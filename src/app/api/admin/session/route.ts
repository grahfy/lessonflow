import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";

/**
 * Returns the current signed-in staff account for role-aware admin UI rendering.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      firstName: admin.firstName,
      lastName: admin.lastName,
      displayName: admin.displayName
    }
  });
}
