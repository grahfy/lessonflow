/**
 * Student Library Download/Stream API
 *
 * Streams a shared Library master file (LibraryItem) to a student, but ONLY when
 * that item has been assigned to them by a teacher.
 *
 * SECURITY (Driver 2 — most sensitive read path in the library feature):
 * 1. Verifies the student session (401 if absent).
 * 2. Authorizes by LibraryAssignment existence — NOT by any ownership field on
 *    the file. There is no `customerId` on a LibraryItem; a master blob is shared
 *    by reference across N assignees.
 * 3. A missing assignment (item does not exist OR is not assigned to this
 *    student) collapses to a 404 — NEVER 403. A 403 would confirm the item's
 *    existence to a non-assignee, so both cases are indistinguishable by design
 *    (mirrors the personal download route's 404-on-not-owned behavior).
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
 * GET: Streams one library master assigned to the authenticated student.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const student = await requireStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Authorize by assignment existence, not by any ownership field on the file.
  // The composite unique (libraryItemId, customerId) makes this a single-row
  // point lookup; null → 404 (never 403) so a non-assignee cannot distinguish
  // "not assigned to me" from "does not exist".
  const assignment = await prisma.libraryAssignment.findUnique({
    where: {
      libraryItemId_customerId: {
        libraryItemId: id,
        customerId: student.id
      }
    },
    include: {
      libraryItem: true
    }
  });

  if (!assignment) {
    return NextResponse.json({ error: "Material not found or access denied." }, { status: 404 });
  }

  const item = assignment.libraryItem;
  const storage = createMaterialStorageDriver();

  // NOTE: Auth is verified before storage access; the byte path (get -> 404 ->
  // disposition -> range) is shared with the personal student and admin routes.
  return streamMaterialBlob(
    storage,
    {
      storageKey: item.storageKey,
      mimeType: item.mimeType,
      title: item.title,
      materialType: item.materialType,
      originalFilename: item.originalFilename
    },
    request
  );
}
