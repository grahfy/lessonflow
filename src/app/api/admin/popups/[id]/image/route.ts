import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import {
  ALLOWED_POPUP_IMAGE_MIME_TYPES,
  InvalidPopupImageContentError,
  MAX_POPUP_IMAGE_SIZE_BYTES,
  buildPopupImageUrl,
  deletePopupImageFile,
  getPopup,
  requireOwnerAdminOrResponse,
  setPopupImage,
  storePopupImageFile
} from "@/lib/popups/popups";

type Params = { params: Promise<{ id: string }> };

/**
 * Uploads (or replaces) a popup's image. Owner-only (AC-26). Follows the
 * notes-image / staff-photo pattern: 5MB cap, JPEG/PNG/GIF/WebP only, `sharp`
 * magic-byte validation so a renamed non-image is rejected, local-disk
 * storage via the material storage driver's same path-traversal guard shape.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireOwnerAdminOrResponse(request);
    if ("response" in guard) {
      return guard.response;
    }

    const { id } = await params;
    const popup = await getPopup(id);
    if (!popup) {
      return NextResponse.json({ error: "Popup not found." }, { status: 404 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_POPUP_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: "Image must be between 1 byte and 5MB." }, { status: 400 });
    }
    if (!ALLOWED_POPUP_IMAGE_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, GIF, and WebP images are allowed." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      // Real-content (magic-byte) validation happens inside storePopupImageFile,
      // before persisting, so a renamed/spoofed upload is never written to disk.
      await storePopupImageFile(id, buffer);
    } catch (error) {
      if (error instanceof InvalidPopupImageContentError) {
        return NextResponse.json(
          { error: "Image must be a valid JPEG, PNG, GIF, or WebP file." },
          { status: 400 }
        );
      }
      throw error;
    }

    const imageUrl = buildPopupImageUrl(id);
    await setPopupImage(id, imageUrl);

    return NextResponse.json({ ok: true, imageUrl });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to upload popup image.");
  }
}

/**
 * Removes a popup's image. Owner-only (AC-26).
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireOwnerAdminOrResponse(request);
    if ("response" in guard) {
      return guard.response;
    }

    const { id } = await params;
    const popup = await getPopup(id);
    if (!popup) {
      return NextResponse.json({ error: "Popup not found." }, { status: 404 });
    }

    await deletePopupImageFile(id);
    await setPopupImage(id, null);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete popup image.");
  }
}
