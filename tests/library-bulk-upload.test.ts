/**
 * AC-I4 grant lifecycle under SIMULATED PRODUCTION (`vi.stubEnv("NODE_ENV",
 * "production")`, precedent: tests/admin-invoice-mutations.test.ts). The
 * dev/test captcha bypass in the upload + bulk-batches routes is keyed on
 * NODE_ENV, so these tests prove the grant checks actually run and that the
 * 400s carry the GRANT module's error codes — not the bypass masking them.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as mintBatch } from "@/app/api/admin/library/bulk-batches/route";
import { POST as uploadLibrary } from "@/app/api/admin/library/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import * as bulkUploadGrant from "@/lib/library/bulk-upload-grant";
import { BULK_UPLOAD_GRANT_TTL_MS, mintBulkUploadGrant } from "@/lib/library/bulk-upload-grant";
import { MAX_UPLOAD_REQUEST_BYTES } from "@/lib/library/upload-limits";
import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";

describe("library-bulk-upload (production-mode grant lifecycle, AC-I4)", () => {
  beforeEach(async () => {
    await prisma.libraryItemTag.deleteMany();
    await prisma.libraryAssignment.deleteMany();
    await prisma.libraryItem.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.adminUser.deleteMany();
    vi.stubEnv("NODE_ENV", "production");
    // In production the local root resolves under /var/www/... — pin it to an
    // absolute test-writable dir (absolute configured roots always win) so
    // storage puts succeed under the stubbed env. MUST be a dedicated -test
    // dir: ".data/learning-materials" is the LIVE dev server's blob store and
    // the fs.rm below would recursively destroy it on every suite run.
    vi.stubEnv("LEARNING_MATERIALS_LOCAL_ROOT", path.resolve(process.cwd(), ".data/learning-materials-test"));
    await fs.rm(getLocalMaterialStorageRoot(), { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function ownerCookie() {
    const admin = await ensureOwnerAdmin();
    return { admin, cookie: `${getSessionCookieName()}=${createSessionToken(admin.email)}` };
  }

  function uploadRequest(cookie: string, file: File, extra: Record<string, string> = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(extra)) {
      form.set(key, value);
    }
    form.set("file", file);
    return new NextRequest("http://localhost/api/admin/library", {
      method: "POST",
      body: form,
      headers: { cookie }
    });
  }

  const mp3 = (name = "riff.mp3") => new File([Buffer.from("audio-bytes")], name, { type: "audio/mpeg" });

  it("prod: minting a grant without a captcha fails with a captcha code (no test bypass)", async () => {
    const { cookie } = await ownerCookie();
    const response = await mintBatch(
      new NextRequest("http://localhost/api/admin/library/bulk-batches", {
        method: "POST",
        body: JSON.stringify({ fileCount: 10 }),
        headers: { cookie, "content-type": "application/json" }
      })
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("MISSING");
  });

  it("prod: an upload with neither grant nor captcha fails closed", async () => {
    const { cookie } = await ownerCookie();
    const response = await uploadLibrary(uploadRequest(cookie, mp3()));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("MISSING");
    expect(await prisma.libraryItem.count()).toBe(0);
  });

  it("prod: a grant covers exactly its units, then 400 grant_exhausted from the grant module", async () => {
    const { admin, cookie } = await ownerCookie();
    const { grantId } = mintBulkUploadGrant({ adminId: admin.id, fileCount: 2 });

    expect((await uploadLibrary(uploadRequest(cookie, mp3("a.mp3"), { grantId }))).status).toBe(201);
    expect((await uploadLibrary(uploadRequest(cookie, mp3("b.mp3"), { grantId }))).status).toBe(201);

    const third = await uploadLibrary(uploadRequest(cookie, mp3("c.mp3"), { grantId }));
    expect(third.status).toBe(400);
    expect(((await third.json()) as { code?: string }).code).toBe("grant_exhausted");
    expect(await prisma.libraryItem.count()).toBe(2);
  });

  it("prod: a failed upload refunds its unit — retries never strand a batch", async () => {
    const { admin, cookie } = await ownerCookie();
    const { grantId } = mintBulkUploadGrant({ adminId: admin.id, fileCount: 1 });
    const refundSpy = vi.spyOn(bulkUploadGrant, "refundBulkUploadGrantUnit");

    // Unclassifiable file: reserved at accept, refunded on the classify 400.
    const rejected = await uploadLibrary(
      uploadRequest(cookie, new File([Buffer.from("doc-bytes")], "notes.docx", { type: "" }), { grantId })
    );
    expect(rejected.status).toBe(400);
    // Exactly one refund for the one failure — the self-nulling closure can
    // never fire twice for a single reserved unit.
    expect(refundSpy).toHaveBeenCalledTimes(1);

    // The refund makes the retry succeed on the same grant...
    expect((await uploadLibrary(uploadRequest(cookie, mp3(), { grantId }))).status).toBe(201);
    // ...and the grant is then genuinely exhausted.
    const exhausted = await uploadLibrary(uploadRequest(cookie, mp3("more.mp3"), { grantId }));
    expect(((await exhausted.json()) as { code?: string }).code).toBe("grant_exhausted");
  });

  it("prod: another admin's grant (or an unknown id) is 400 grant_invalid", async () => {
    const { cookie } = await ownerCookie();
    const foreign = mintBulkUploadGrant({ adminId: "some-other-admin", fileCount: 5 });

    const withForeign = await uploadLibrary(uploadRequest(cookie, mp3(), { grantId: foreign.grantId }));
    expect(withForeign.status).toBe(400);
    expect(((await withForeign.json()) as { code?: string }).code).toBe("grant_invalid");

    const withUnknown = await uploadLibrary(uploadRequest(cookie, mp3(), { grantId: "not-a-grant" }));
    expect(((await withUnknown.json()) as { code?: string }).code).toBe("grant_invalid");
    expect(await prisma.libraryItem.count()).toBe(0);
  });

  it("prod: mid-batch expiry → 400 grant_expired; a re-minted grant resumes the batch", async () => {
    const { admin, cookie } = await ownerCookie();
    const { grantId } = mintBulkUploadGrant({ adminId: admin.id, fileCount: 5 });
    expect((await uploadLibrary(uploadRequest(cookie, mp3("first.mp3"), { grantId }))).status).toBe(201);

    // Jump past the grant TTL (admin session lives 7 days, so it stays valid).
    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow + BULK_UPLOAD_GRANT_TTL_MS + 60_000);

    const expired = await uploadLibrary(uploadRequest(cookie, mp3("second.mp3"), { grantId }));
    expect(expired.status).toBe(400);
    expect(((await expired.json()) as { code?: string }).code).toBe("grant_expired");

    // Re-mint (prod flow: one new captcha via bulk-batches) and resume.
    const reminted = mintBulkUploadGrant({ adminId: admin.id, fileCount: 4 });
    const resumed = await uploadLibrary(uploadRequest(cookie, mp3("second.mp3"), { grantId: reminted.grantId }));
    expect(resumed.status).toBe(201);

    nowSpy.mockRestore();
    expect(await prisma.libraryItem.count()).toBe(2);
  });

  it("prod: concurrent uploads cannot race past the cap (reserve is pre-await)", async () => {
    const { admin, cookie } = await ownerCookie();
    const { grantId } = mintBulkUploadGrant({ adminId: admin.id, fileCount: 1 });

    const responses = await Promise.all([
      uploadLibrary(uploadRequest(cookie, mp3("r1.mp3"), { grantId })),
      uploadLibrary(uploadRequest(cookie, mp3("r2.mp3"), { grantId })),
      uploadLibrary(uploadRequest(cookie, mp3("r3.mp3"), { grantId }))
    ]);

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 400, 400]);
    for (const response of responses) {
      if (response.status === 400) {
        expect(((await response.json()) as { code?: string }).code).toBe("grant_exhausted");
      }
    }
    expect(await prisma.libraryItem.count()).toBe(1);
  });

  it("prod: an oversized declared content-length is rejected pre-buffer and consumes no grant unit", async () => {
    const { admin, cookie } = await ownerCookie();
    const { grantId } = mintBulkUploadGrant({ adminId: admin.id, fileCount: 1 });

    const form = new FormData();
    form.set("grantId", grantId);
    form.set("file", mp3("huge.mp3"));
    const oversized = await uploadLibrary(
      new NextRequest("http://localhost/api/admin/library", {
        method: "POST",
        body: form,
        headers: { cookie, "content-length": String(MAX_UPLOAD_REQUEST_BYTES + 1) }
      })
    );
    expect(oversized.status).toBe(400);
    expect(((await oversized.json()) as { error?: string }).error).toBe("File must be between 1 byte and 100MB.");
    expect(await prisma.libraryItem.count()).toBe(0);

    // The guard fired before the form (and its grantId) was ever read — the
    // grant's single unit is intact, so a normal retry on the same grant lands.
    expect((await uploadLibrary(uploadRequest(cookie, mp3("retry.mp3"), { grantId }))).status).toBe(201);
  });
});
