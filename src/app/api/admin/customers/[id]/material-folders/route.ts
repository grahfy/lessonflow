import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import {
  assertSameCustomerFolder,
  assertUniqueSiblingName,
  buildFolderTree,
  FolderValidationError
} from "@/lib/student-portal/folders";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().trim().min(1).nullish()
});

/**
 * Lists the full per-customer folder tree (scoped to the customer) for the admin
 * materials panel.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: {
        id
      }
    });
    if (!customer || customer.isArchived) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const folders = await prisma.studentMaterialFolder.findMany({
      where: {
        customerId: customer.id
      }
    });

    return NextResponse.json({
      folders: buildFolderTree(folders)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load material folders.");
  }
}

/**
 * Creates a folder for the customer, optionally nested under an existing folder.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: {
        id
      }
    });
    if (!customer || customer.isArchived) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = createFolderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid folder details.", details: parsed.error.flatten() }, { status: 400 });
    }

    const parentId = parsed.data.parentId ?? null;

    // Validate the parent exists and belongs to the same customer before creating.
    if (parentId) {
      const parent = await prisma.studentMaterialFolder.findUnique({
        where: {
          id: parentId
        }
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent folder not found." }, { status: 400 });
      }
      assertSameCustomerFolder(customer.id, parent);
    }

    const siblings = await prisma.studentMaterialFolder.findMany({
      where: {
        customerId: customer.id,
        parentId
      }
    });

    const name = assertUniqueSiblingName({
      name: parsed.data.name,
      customerId: customer.id,
      parentId,
      siblings
    });

    const folder = await prisma.studentMaterialFolder.create({
      data: {
        customerId: customer.id,
        parentId,
        name
      }
    });

    return NextResponse.json(
      {
        folder: {
          id: folder.id,
          parentId: folder.parentId,
          name: folder.name,
          sourceBookingId: folder.sourceBookingId
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof FolderValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return jsonUnexpectedError(error, "Unable to create material folder.");
  }
}
