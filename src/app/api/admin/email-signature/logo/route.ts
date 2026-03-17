import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import {
  buildEmailSignatureLogoStorageKey,
  classifyEmailSignatureLogo,
  deleteEmailSignatureLogo,
  putEmailSignatureLogo
} from "@/lib/email/signature-storage";
import {
  clearEmailSignatureLogo,
  getEmailSignatureSettings,
  saveEmailSignatureLogo,
  serializeEmailSignatureSettings
} from "@/lib/email/signature";

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ ok: false, error: "Invalid upload payload." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Signature logo file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_LOGO_SIZE_BYTES) {
      return NextResponse.json({ ok: false, error: "Signature logo must be between 1 byte and 5MB." }, { status: 400 });
    }

    const classification = classifyEmailSignatureLogo(file);
    if (!classification) {
      return NextResponse.json({ ok: false, error: "Signature logo must be JPEG, PNG, GIF, or WebP." }, { status: 400 });
    }

    const existing = await getEmailSignatureSettings();
    const storageKey = buildEmailSignatureLogoStorageKey(classification.extension);
    const buffer = Buffer.from(await file.arrayBuffer());
    await putEmailSignatureLogo(storageKey, buffer);

    try {
      const settings = await saveEmailSignatureLogo({
        storageKey,
        mimeType: classification.mimeType
      });

      await deleteEmailSignatureLogo(existing?.logoStorageKey).catch(() => null);

      return NextResponse.json({
        ok: true,
        signature: serializeEmailSignatureSettings(settings)
      });
    } catch (error) {
      await deleteEmailSignatureLogo(storageKey).catch(() => null);
      return jsonUnexpectedError(error, "Unable to save signature logo.");
    }
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to upload signature logo.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const existing = await getEmailSignatureSettings();
    const settings = await clearEmailSignatureLogo();
    await deleteEmailSignatureLogo(existing?.logoStorageKey).catch(() => null);

    return NextResponse.json({
      ok: true,
      signature: serializeEmailSignatureSettings(settings)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete signature logo.");
  }
}
