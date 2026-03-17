import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import {
  getEmailSignatureSettings,
  saveEmailSignatureBodyText,
  serializeEmailSignatureSettings
} from "@/lib/email/signature";

const bodySchema = z.object({
  bodyText: z.string().max(4000)
});

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const settings = await getEmailSignatureSettings();
  return NextResponse.json({
    ok: true,
    signature: serializeEmailSignatureSettings(settings)
  });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid email signature payload." }, { status: 400 });
    }

    const settings = await saveEmailSignatureBodyText(parsed.data.bodyText);
    return NextResponse.json({
      ok: true,
      signature: serializeEmailSignatureSettings(settings)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save email signature.");
  }
}
