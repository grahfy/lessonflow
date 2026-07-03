/**
 * Student Materials Download/Stream API
 * 
 * Provides authenticated access to learning materials (PDFs, Audio, Video).
 * Supports partial content (Byte-Range) for streaming capability.
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { streamMaterialBlob } from "@/lib/student-portal/material-response";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

/** Next.js Route Params */
type Params = {
  params: Promise<{
    id: string;
  }>;
};

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

  // NOTE: Auth is verified before storage access; the byte path (get -> 404 ->
  // disposition -> range) is shared with the admin and library read routes.
  return streamMaterialBlob(
    storage,
    {
      storageKey: material.storageKey,
      mimeType: material.mimeType,
      title: material.title,
      materialType: material.materialType
    },
    request
  );
}
