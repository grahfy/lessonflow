import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/admin/customers/[id]/route";

function adminRequest(url: string, method: "GET", token: string) {
  return new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("repro-customer-404", () => {
  beforeEach(async () => {
    await prisma.customer.deleteMany();
  });

  it("returns 404 for archived customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customer = await prisma.customer.create({
      data: {
        fullName: "Archived Student",
        email: "archived@example.com",
        phone: "0400111222",
        normalizedEmail: "archived@example.com",
        normalizedPhone: "0400111222",
        skillLevel: "beginner",
        lessonMode: "in_person",
        isArchived: true
      }
    });

    const req = adminRequest(`http://localhost/api/admin/customers/${customer.id}`, "GET", token);
    const res = await GET(req, { params: Promise.resolve({ id: customer.id }) });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customer.fullName).toBe("Archived Student");
    expect(body.customer.isArchived).toBe(true);
  });
});
