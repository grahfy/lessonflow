/**
 * Shared Learning-Material Response Helpers
 *
 * Single source of truth for streaming stored learning-material blobs over HTTP.
 * Both the student and admin download routes (and the shared library download
 * route) delegate their byte path here so byte-range, content-disposition, and
 * not-found semantics stay identical everywhere.
 *
 * RATIONALE: Byte-range support is critical for audio/video materials, allowing
 * the browser to "seek" within a track without downloading the whole file. Any
 * drift between the personal and library read paths would be a correctness (and,
 * for the library, a security-sensitive) hazard, so the logic lives in one place.
 */

import { NextRequest, NextResponse } from "next/server";

import { isFilesystemNotFoundError } from "@/lib/storage-errors";
import type { MaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { buildLearningMaterialDownloadFilename } from "@/lib/student-portal/materials";
import type { LearningMaterialType } from "@/generated/prisma/client";

/**
 * Constructs an HTTP response for file content, supporting both full and
 * partial (Range) delivery.
 *
 * @param buffer - The raw file content
 * @param mimeType - Content-Type header value
 * @param disposition - 'inline' or 'attachment'
 * @param filename - Human-readable name for the download
 * @param rangeHeader - Incoming 'Range' header from the client
 * @returns Standard or Partial Content Response
 */
export function buildMaterialResponse(
  buffer: Buffer,
  mimeType: string,
  disposition: string,
  filename: string,
  rangeHeader: string | null
) {
  const total = buffer.length;
  const baseHeaders: Record<string, string> = {
    "content-type": mimeType,
    "content-disposition": `${disposition}; filename="${filename}"`,
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes"
  };

  // Logic: Handle standard full-file request
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...baseHeaders,
        "content-length": String(total)
      }
    });
  }

  // Logic: Parse Byte-Range
  // Format: bytes=start-end
  const [startRaw, endRaw] = rangeHeader.replace(/^bytes=/, "").split("-", 2);
  let start = startRaw ? Number.parseInt(startRaw, 10) : NaN;
  let end = endRaw ? Number.parseInt(endRaw, 10) : NaN;

  // Handle suffix range (e.g. bytes=-500)
  if (Number.isNaN(start) && !Number.isNaN(end)) {
    const suffixLength = Math.max(0, end);
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  } else {
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end)) end = total - 1;
  }

  // Validation: Bounds check
  if (start < 0 || end < start || start >= total) {
    return new NextResponse(null, {
      status: 416, // Range Not Satisfiable
      headers: {
        ...baseHeaders,
        "content-range": `bytes */${total}`
      }
    });
  }

  end = Math.min(end, total - 1);
  const chunk = buffer.subarray(start, end + 1);

  // Return Partial Content
  return new NextResponse(new Uint8Array(chunk), {
    status: 206,
    headers: {
      ...baseHeaders,
      "content-length": String(chunk.length),
      "content-range": `bytes ${start}-${end}/${total}`
    }
  });
}

/**
 * Minimal descriptor of a stored material needed to stream it. Deliberately
 * decoupled from any Prisma row so both `LearningMaterial` and `LibraryItem`
 * (which share these fields) can be streamed through the identical path.
 */
export type StreamMaterialDescriptor = {
  storageKey: string;
  mimeType: string;
  title: string;
  materialType: LearningMaterialType;
  /**
   * Original upload filename (LibraryItem.originalFilename). Optional: personal
   * LearningMaterial rows and legacy library rows never captured one. Supplies
   * the download extension when the MIME type doesn't reverse-map (Guitar Pro
   * files are stored as application/octet-stream).
   */
  originalFilename?: string | null;
};

export type StreamMaterialOptions = {
  /**
   * Body message returned when the blob is missing from storage. Defaults to the
   * student-facing wording; the admin route overrides it to preserve its
   * existing "Learning material not found." copy.
   */
  notFoundMessage?: string;
};

/**
 * Owns the entire download tail shared by every material read route:
 *   storage.get -> (filesystem-not-found -> null) -> 404 -> disposition -> range -> Response.
 *
 * Callers MUST perform their own authorization BEFORE invoking this helper —
 * this function reads bytes unconditionally for the given storageKey.
 */
export async function streamMaterialBlob(
  storage: MaterialStorageDriver,
  descriptor: StreamMaterialDescriptor,
  request: NextRequest,
  options: StreamMaterialOptions = {}
): Promise<Response> {
  const notFoundMessage = options.notFoundMessage ?? "Material not found or access denied.";

  // NOTE: Auth is verified by the caller before this storage access.
  const blob = await storage
    .get({
      storageKey: descriptor.storageKey
    })
    .catch((error) => {
      if (isFilesystemNotFoundError(error)) {
        return null;
      }
      throw error;
    });
  if (!blob) {
    return NextResponse.json({ error: notFoundMessage }, { status: 404 });
  }

  const disposition = request.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

  return buildMaterialResponse(
    blob.buffer,
    descriptor.mimeType,
    disposition,
    buildLearningMaterialDownloadFilename({
      title: descriptor.title,
      materialType: descriptor.materialType,
      mimeType: descriptor.mimeType,
      originalFilename: descriptor.originalFilename ?? null
    }),
    request.headers.get("range")
  );
}
