/**
 * Student Materials Download/Stream API
 * 
 * Provides authenticated access to learning materials (PDFs, Audio, Video).
 * Supports partial content (Byte-Range) for streaming capability.
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isFilesystemNotFoundError } from "@/lib/storage-errors";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { buildLearningMaterialDownloadFilename } from "@/lib/student-portal/materials";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

/** Next.js Route Params */
type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Constructs an HTTP response for file content, supporting both full and 
 * partial (Range) delivery.
 * 
 * RATIONALE: Byte-range support is critical for audio and video materials 
 * allowing the browser to "seek" within a track without downloading the whole file.
 * 
 * @param buffer - The raw file content
 * @param mimeType - Content-Type header value
 * @param disposition - 'inline' or 'attachment'
 * @param filename - Human-readable name for the download
 * @param rangeHeader - Incoming 'Range' header from the client
 * @returns Standard or Partial Content Response
 */
function buildMaterialResponse(buffer: Buffer, mimeType: string, disposition: string, filename: string, rangeHeader: string | null) {
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
 * GET: Streams one owned learning material file for the authenticated student.
 * 
 * SECURITY:
 * 1. Verifies Student Session.
 * 2. Cross-checks record ownership (material.customerId === student.id).
 * 3. Sanitizes download filenames.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const student = await requireStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const material = await prisma.learningMaterial.findUnique({
    where: { id }
  });

  if (!material || material.customerId !== student.id) {
    return NextResponse.json({ error: "Material not found or access denied." }, { status: 404 });
  }

  const storage = createMaterialStorageDriver();
  
  // NOTE: Auth is verified before storage access.
  const blob = await storage
    .get({
      storageKey: material.storageKey
    })
    .catch((error) => {
      if (isFilesystemNotFoundError(error)) {
        return null;
      }
      throw error;
    });
  if (!blob) {
    return NextResponse.json({ error: "Material not found or access denied." }, { status: 404 });
  }

  return buildMaterialResponse(
    blob.buffer,
    material.mimeType,
    request.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment",
    buildLearningMaterialDownloadFilename({
      title: material.title,
      materialType: material.materialType,
      mimeType: material.mimeType
    }),
    request.headers.get("range")
  );
}
