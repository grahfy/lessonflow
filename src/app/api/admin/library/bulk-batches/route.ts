/**
 * Bulk-Upload Batch Grant API
 *
 * POST mints an in-memory bulk-upload grant covering up to 200 file POSTs to
 * /api/admin/library off ONE CAPTCHA solve (challenges are single-use, so one
 * captcha cannot cover N per-file uploads). The client re-mints here after a
 * mid-batch `grant_expired` (one new captcha in production).
 *
 * SECURITY: the grant is CAPTCHA parity + server-side batch-cap enforcement,
 * not the auth boundary — this route and every file POST independently require
 * the admin session (requireAdminFromRequest + canManageLibrary). CAPTCHA is
 * enforced outside test/development, mirroring the upload route's gate.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { verifyCaptchaSubmission } from "@/lib/captcha";
import { MAX_BULK_UPLOAD_FILES, mintBulkUploadGrant } from "@/lib/library/bulk-upload-grant";
import { log, logEvent } from "@/lib/observability";

const bulkBatchBodySchema = z.object({
  fileCount: z.number().int().min(1).max(MAX_BULK_UPLOAD_FILES),
  captchaToken: z.string().trim().optional(),
  captchaAnswer: z.string().trim().optional()
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = bulkBatchBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid batch request.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Same production-only CAPTCHA gate as the upload route: one solve per batch.
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
      const captchaResult = verifyCaptchaSubmission({
        captchaToken: parsed.data.captchaToken ?? "",
        captchaAnswer: parsed.data.captchaAnswer ?? ""
      });
      if (!captchaResult.ok) {
        log("warn", "library_item.bulk_grant_denied", { adminId: admin.id, code: captchaResult.code });
        return NextResponse.json({ error: captchaResult.message, code: captchaResult.code }, { status: 400 });
      }
    }

    const grant = mintBulkUploadGrant({ adminId: admin.id, fileCount: parsed.data.fileCount });
    logEvent("library_item.bulk_grant_minted", { adminId: admin.id, maxFiles: grant.maxFiles });

    return NextResponse.json(
      {
        grantId: grant.grantId,
        maxFiles: grant.maxFiles,
        expiresAt: grant.expiresAt.toISOString()
      },
      { status: 201 }
    );
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to start bulk upload batch.");
  }
}
