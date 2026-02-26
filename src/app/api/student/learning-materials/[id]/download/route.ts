import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { buildLearningMaterialDownloadFilename } from "@/lib/student-portal/materials";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function buildMaterialResponse(buffer: Buffer, mimeType: string, disposition: string, filename: string, rangeHeader: string | null) {
  const total = buffer.length;
  const baseHeaders: Record<string, string> = {
    "content-type": mimeType,
    "content-disposition": `${disposition}; filename="${filename}"`,
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes"
  };

  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...baseHeaders,
        "content-length": String(total)
      }
    });
  }

  const [startRaw, endRaw] = rangeHeader.replace(/^bytes=/, "").split("-", 2);
  let start = startRaw ? Number.parseInt(startRaw, 10) : NaN;
  let end = endRaw ? Number.parseInt(endRaw, 10) : NaN;

  if (Number.isNaN(start) && !Number.isNaN(end)) {
    const suffixLength = Math.max(0, end);
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  } else {
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end)) end = total - 1;
  }

  if (start < 0 || end < start || start >= total) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "content-range": `bytes */${total}`
      }
    });
  }

  end = Math.min(end, total - 1);
  const chunk = buffer.subarray(start, end + 1);
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
 * Streams one owned learning material file for the authenticated student.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const student = await requireStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const material = await prisma.learningMaterial.findUnique({
    where: {
      id
    }
  });
  if (!material || material.customerId !== student.id) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  const storage = createMaterialStorageDriver();
  // Storage access is authorized by the material row ownership check above.
  const blob = await storage.get({
    storageKey: material.storageKey
  });

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
