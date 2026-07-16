/**
 * Bulk-Upload Grant Store
 *
 * One CAPTCHA solve mints a short-lived grant covering a whole bulk-upload
 * batch (≤200 files), because CAPTCHA challenges are single-use (consumed on
 * first verification — src/lib/captcha.ts) and cannot cover N per-file POSTs.
 *
 * SECURITY FRAMING: the grant is CAPTCHA-convention parity plus server-side
 * batch-cap enforcement — it is NOT the auth boundary. Every file POST is still
 * authenticated by the admin session (requireAdminFromRequest + canManageLibrary)
 * before the grant is consulted. Grant checks fail closed: missing/expired/
 * foreign-admin/exhausted grants are 400s in production, never a silent bypass.
 *
 * ACCOUNTING (reserve-at-accept / refund-on-failure): a unit is reserved
 * SYNCHRONOUSLY at the grant check — before any await — so N concurrent POSTs
 * against `remaining: 1` cannot race past the cap. If the upload then fails
 * (missing file, size, classify, storage put, row create), the unit is
 * refunded, so a failed upload consumes nothing net and client retries can
 * never strand a batch. Refunding a grant that has expired or been evicted is
 * a deliberate silent no-op.
 *
 * The in-memory, single-process assumption is exactly the one captcha.ts
 * already makes (prod runs one `next start` process); the store mirrors its
 * globalThis-pinned Map + TTL sweep + resident-cap pattern.
 */

import { randomUUID } from "node:crypto";

/** Grant lifetime — long enough for a 200-file batch on a slow uplink. */
export const BULK_UPLOAD_GRANT_TTL_MS = 30 * 60 * 1000;

/** Server-enforced per-batch file cap (spec: ~200/batch). */
export const MAX_BULK_UPLOAD_FILES = 200;

/** Interval between background prunes of expired grants. */
const GRANT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Hard ceiling on resident grants. Grants are minted only by authenticated
 * admins (unlike public captchas), so a small cap is ample; oldest entries are
 * evicted first if a runaway client ever floods the mint endpoint.
 */
const GRANT_MAX_ENTRIES = 1_000;

type BulkUploadGrantRecord = {
  adminId: string;
  expiresAt: number;
  /** Units still reservable. Starts at the minted fileCount. */
  remaining: number;
  /** Minted size — refunds never push `remaining` above this. */
  maxFiles: number;
};

export type BulkUploadGrantDenial = {
  ok: false;
  code: "grant_invalid" | "grant_expired" | "grant_exhausted";
  message: string;
};

export type BulkUploadGrantReservation = { ok: true } | BulkUploadGrantDenial;

const globalStore = globalThis as unknown as {
  __libraryBulkUploadGrants?: Map<string, BulkUploadGrantRecord>;
  __libraryBulkUploadGrantSweepRegistered?: boolean;
};

const grantStore = globalStore.__libraryBulkUploadGrants ?? new Map<string, BulkUploadGrantRecord>();
if (!globalStore.__libraryBulkUploadGrants) {
  globalStore.__libraryBulkUploadGrants = grantStore;
}

/** Opportunistic prune of expired grants (lazy path; sweep covers idle periods). */
function cleanupExpiredGrants(now = Date.now()): void {
  for (const [grantId, record] of grantStore.entries()) {
    if (record.expiresAt <= now) {
      grantStore.delete(grantId);
    }
  }
}

/** Oldest-first eviction once the resident cap is exceeded (Map = insertion order). */
function enforceGrantStoreCap(now = Date.now()): void {
  if (grantStore.size <= GRANT_MAX_ENTRIES) {
    return;
  }
  cleanupExpiredGrants(now);
  for (const grantId of grantStore.keys()) {
    if (grantStore.size <= GRANT_MAX_ENTRIES) {
      break;
    }
    grantStore.delete(grantId);
  }
}

/** Background sweep so idle periods still prune; unref()-ed, HMR-guarded (mirrors captcha.ts). */
function registerExpiredGrantSweep(): void {
  if (globalStore.__libraryBulkUploadGrantSweepRegistered) return;
  globalStore.__libraryBulkUploadGrantSweepRegistered = true;

  const timer = setInterval(() => {
    cleanupExpiredGrants(Date.now());
  }, GRANT_SWEEP_INTERVAL_MS);
  timer.unref?.();
}

registerExpiredGrantSweep();

/**
 * Mints a grant for `fileCount` uploads bound to one admin. The caller
 * (bulk-batches route) has already authenticated the admin and, in production,
 * verified a CAPTCHA. `fileCount` is clamped to the server-side cap.
 */
export function mintBulkUploadGrant(input: { adminId: string; fileCount: number }): {
  grantId: string;
  maxFiles: number;
  expiresAt: Date;
} {
  cleanupExpiredGrants();

  const maxFiles = Math.max(1, Math.min(Math.floor(input.fileCount), MAX_BULK_UPLOAD_FILES));
  const grantId = randomUUID();
  const expiresAt = Date.now() + BULK_UPLOAD_GRANT_TTL_MS;

  grantStore.set(grantId, {
    adminId: input.adminId,
    expiresAt,
    remaining: maxFiles,
    maxFiles
  });

  enforceGrantStoreCap();

  return { grantId, maxFiles, expiresAt: new Date(expiresAt) };
}

/**
 * Reserves one upload unit. Fully synchronous — the decrement happens before
 * the caller performs any await, which is what makes the batch cap race-free.
 * A grant belonging to a different admin is indistinguishable from a missing
 * one (`grant_invalid`), so grant ids leak nothing across admin accounts.
 */
export function reserveBulkUploadGrantUnit(input: { grantId: string; adminId: string }): BulkUploadGrantReservation {
  const record = grantStore.get(input.grantId);
  if (!record || record.adminId !== input.adminId) {
    return {
      ok: false,
      code: "grant_invalid",
      message: "Upload session is invalid. Please start a new batch."
    };
  }
  if (record.expiresAt <= Date.now()) {
    grantStore.delete(input.grantId);
    return {
      ok: false,
      code: "grant_expired",
      message: "Upload session expired. Please start a new batch."
    };
  }
  if (record.remaining <= 0) {
    return {
      ok: false,
      code: "grant_exhausted",
      message: "Upload session file limit reached. Please start a new batch."
    };
  }
  record.remaining -= 1;
  return { ok: true };
}

/**
 * Returns a previously reserved unit after a failed upload. Silent no-op when
 * the grant has expired, been evicted, or belongs to another admin; refunds
 * never push `remaining` above the minted size.
 */
export function refundBulkUploadGrantUnit(input: { grantId: string; adminId: string }): void {
  const record = grantStore.get(input.grantId);
  if (!record || record.adminId !== input.adminId || record.expiresAt <= Date.now()) {
    return;
  }
  record.remaining = Math.min(record.remaining + 1, record.maxFiles);
}
