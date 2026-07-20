import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as folderCopyPOST } from "@/app/api/admin/material-folders/[id]/copy/route";
import { DELETE as folderDELETE } from "@/app/api/admin/material-folders/[id]/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

/**
 * Placement of assigned library items under folder lifecycle operations. Both
 * cases below were silent data bugs before Stage 4: delete sent nested items to
 * root via the FK's SET NULL while their siblings moved up one level, and copy
 * dropped them entirely.
 */
describe("material-folder-library-placement", () => {
  beforeEach(async () => {
    await prisma.libraryAssignment.deleteMany();
    await prisma.libraryItemTag.deleteMany();
    await prisma.libraryItem.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.studentMaterialFolder.deleteMany();
    await prisma.adminUser.deleteMany();
    await prisma.customer.deleteMany();
  });

  let counter = 0;

  async function createCustomer(name: string, email: string, phone: string) {
    return prisma.customer.create({
      data: customerSnapshotFromInput({
        name,
        email,
        phone,
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "12",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    });
  }

  async function assignLibraryItem(customerId: string, folderId: string | null) {
    counter += 1;
    const item = await prisma.libraryItem.create({
      data: {
        title: `Shared ${counter}`,
        description: null,
        materialType: "pdf",
        storageKey: `library/placement-${counter}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 2048
      }
    });
    await prisma.libraryAssignment.create({
      data: { libraryItemId: item.id, customerId, folderId }
    });
    return item;
  }

  async function ownerCookie() {
    const admin = await ensureOwnerAdmin();
    return `${getSessionCookieName()}=${createSessionToken(admin.email)}`;
  }

  it("deleting a nested folder lands its library item on the PARENT, not root", async () => {
    const cookie = await ownerCookie();
    const customer = await createCustomer("Nest Student", "nest@example.com", "0400400001");
    const parent = await prisma.studentMaterialFolder.create({
      data: { customerId: customer.id, name: "Parent", parentId: null }
    });
    const child = await prisma.studentMaterialFolder.create({
      data: { customerId: customer.id, name: "Child", parentId: parent.id }
    });
    const item = await assignLibraryItem(customer.id, child.id);

    const response = await folderDELETE(
      new NextRequest(`http://localhost/api/admin/material-folders/${child.id}`, {
        method: "DELETE",
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: child.id }) }
    );
    expect(response.status).toBe(200);

    const assignment = await prisma.libraryAssignment.findFirstOrThrow({
      where: { libraryItemId: item.id, customerId: customer.id }
    });
    // The FK's ON DELETE SET NULL would have made this null (root).
    expect(assignment.folderId).toBe(parent.id);
  });

  it("copying a folder LEAVES its library item in the source; the copy has none", async () => {
    const cookie = await ownerCookie();
    const customer = await createCustomer("Copy Student", "copy@example.com", "0400400002");
    const source = await prisma.studentMaterialFolder.create({
      data: { customerId: customer.id, name: "Source", parentId: null }
    });
    const item = await assignLibraryItem(customer.id, source.id);

    const response = await folderCopyPOST(
      new NextRequest(`http://localhost/api/admin/material-folders/${source.id}/copy`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ parentId: null })
      }),
      { params: Promise.resolve({ id: source.id }) }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { folder: { id: string } };

    // A folder copy is always same-customer, and a student can hold exactly one
    // assignment per item (@@unique([libraryItemId, customerId])). So the item
    // is NOT duplicated into the copy and, critically, is NOT moved out of the
    // source either — a copy must never mutate the original.
    const assignments = await prisma.libraryAssignment.findMany({
      where: { libraryItemId: item.id, customerId: customer.id }
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.folderId).toBe(source.id);

    // The copy contains no library assignment at all.
    expect(await prisma.libraryAssignment.count({ where: { folderId: body.folder.id } })).toBe(0);

    // And no blob was duplicated.
    expect(await prisma.libraryItem.count()).toBe(1);
  });
});
