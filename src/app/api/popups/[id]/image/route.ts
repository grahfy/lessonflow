import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { readPopupImageFile } from "@/lib/popups/popups";

type Params = { params: Promise<{ id: string }> };

/**
 * Public, unauthenticated: this image renders on public marketing pages for
 * anonymous visitors, so no owner/admin guard belongs here.
 *
 * Content-type is re-derived from the bytes via sharp at serve time instead
 * of being read from a stored column — SitePopup deliberately has no
 * imageMimeType field (schema is frozen). Re-detection is cheap for a file
 * capped at 5MB and can't drift out of sync with the actual bytes, which is
 * better than the stored-column precedent it deviates from. Do not "fix"
 * this by adding a mimeType column back.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const image = await readPopupImageFile(id);
    if (!image) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(image.buffer), {
      headers: {
        "content-type": image.mimeType,
        // A re-upload overwrites the same storage path, so a short max-age
        // (matching the staff-photo route's precedent) lets a new image
        // appear within minutes instead of a cache serving a stale one
        // indefinitely.
        "cache-control": "public, max-age=300",
        "content-length": String(image.buffer.length),
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load popup image.");
  }
}
