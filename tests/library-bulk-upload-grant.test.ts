import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BULK_UPLOAD_GRANT_TTL_MS,
  MAX_BULK_UPLOAD_FILES,
  mintBulkUploadGrant,
  refundBulkUploadGrantUnit,
  reserveBulkUploadGrantUnit
} from "@/lib/library/bulk-upload-grant";

const ADMIN = "admin_1";

describe("bulk-upload-grant", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mints a grant clamped to the server-side batch cap", () => {
    const grant = mintBulkUploadGrant({ adminId: ADMIN, fileCount: 5000 });
    expect(grant.maxFiles).toBe(MAX_BULK_UPLOAD_FILES);
    expect(grant.grantId).toBeTruthy();
    expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const tiny = mintBulkUploadGrant({ adminId: ADMIN, fileCount: 0 });
    expect(tiny.maxFiles).toBe(1);
  });

  it("reserves exactly maxFiles units, then fails closed with grant_exhausted", () => {
    const { grantId } = mintBulkUploadGrant({ adminId: ADMIN, fileCount: 3 });
    for (let i = 0; i < 3; i += 1) {
      expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toEqual({ ok: true });
    }
    const denied = reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN });
    expect(denied).toMatchObject({ ok: false, code: "grant_exhausted" });
  });

  it("refund returns a unit so a failed upload consumes nothing net", () => {
    const { grantId } = mintBulkUploadGrant({ adminId: ADMIN, fileCount: 1 });
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toEqual({ ok: true });
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toMatchObject({ code: "grant_exhausted" });

    refundBulkUploadGrantUnit({ grantId, adminId: ADMIN });
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toEqual({ ok: true });
  });

  it("refunds never push remaining above the minted size", () => {
    const { grantId } = mintBulkUploadGrant({ adminId: ADMIN, fileCount: 1 });
    refundBulkUploadGrantUnit({ grantId, adminId: ADMIN });
    refundBulkUploadGrantUnit({ grantId, adminId: ADMIN });
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toEqual({ ok: true });
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toMatchObject({ code: "grant_exhausted" });
  });

  it("a foreign admin or unknown id is grant_invalid (indistinguishable)", () => {
    const { grantId } = mintBulkUploadGrant({ adminId: ADMIN, fileCount: 2 });
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: "admin_2" })).toMatchObject({
      ok: false,
      code: "grant_invalid"
    });
    expect(reserveBulkUploadGrantUnit({ grantId: "nope", adminId: ADMIN })).toMatchObject({
      ok: false,
      code: "grant_invalid"
    });
    // The rightful admin is unaffected by the foreign attempt.
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toEqual({ ok: true });
  });

  it("expires after the TTL with grant_expired; refunding an expired grant is a silent no-op", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T10:00:00.000Z"));

    const { grantId } = mintBulkUploadGrant({ adminId: ADMIN, fileCount: 2 });
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toEqual({ ok: true });

    vi.setSystemTime(new Date(Date.now() + BULK_UPLOAD_GRANT_TTL_MS + 1000));
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toMatchObject({
      ok: false,
      code: "grant_expired"
    });
    expect(() => refundBulkUploadGrantUnit({ grantId, adminId: ADMIN })).not.toThrow();
    // Still expired after the no-op refund — no resurrection.
    expect(reserveBulkUploadGrantUnit({ grantId, adminId: ADMIN })).toMatchObject({
      ok: false,
      code: "grant_invalid"
    });
  });
});
