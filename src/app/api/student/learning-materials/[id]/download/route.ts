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

  return new NextResponse(new Uint8Array(blob.buffer), {
    status: 200,
    headers: {
      "content-type": material.mimeType,
      "content-disposition": `${request.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment"}; filename="${buildLearningMaterialDownloadFilename({
        title: material.title,
        materialType: material.materialType,
        mimeType: material.mimeType
      })}"`,
      "x-content-type-options": "nosniff"
    }
  });
}
