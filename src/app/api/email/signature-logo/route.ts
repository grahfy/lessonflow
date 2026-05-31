import { NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { getEmailSignatureSettings } from "@/lib/email/signature";
import { getEmailSignatureLogo } from "@/lib/email/signature-storage";

export async function GET() {
  try {
    const settings = await getEmailSignatureSettings();
    if (!settings?.logoStorageKey || !settings.logoMimeType) {
      return NextResponse.json({ error: "Signature logo not found." }, { status: 404 });
    }

    const blob = await getEmailSignatureLogo(settings.logoStorageKey, settings.logoMimeType);
    return new NextResponse(new Uint8Array(blob.buffer), {
      headers: {
        "content-type": blob.mimeType,
        "cache-control": "public, max-age=300, stale-while-revalidate=86400",
        "content-length": String(blob.buffer.length),
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load signature logo.");
  }
}
