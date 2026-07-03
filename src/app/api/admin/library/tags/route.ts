import { NextRequest, NextResponse } from "next/server";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

/**
 * Returns the distinct tag vocabulary (categories → values) that drives the admin
 * Library's pick-from-list facet UI. New values created via `[id]/tags` POST
 * surface here on the next load (add-on-the-fly). Gated by canManageLibrary.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only surface tag values that are still attached to at least one item.
    // Removing a tag from its last item leaves the shared Tag row intact (the
    // vocabulary is deliberately not pruned), so an unfiltered list would show
    // "orphaned" facets/suggestions that match zero items.
    const tags = await prisma.tag.findMany({
      where: { items: { some: {} } },
      orderBy: [{ category: "asc" }, { value: "asc" }],
      select: { category: true, value: true }
    });

    // Group values under their category so the client can render one facet per
    // category with its selectable values.
    const byCategory = new Map<string, string[]>();
    for (const { category, value } of tags) {
      const values = byCategory.get(category);
      if (values) {
        values.push(value);
      } else {
        byCategory.set(category, [value]);
      }
    }

    return NextResponse.json({
      categories: Array.from(byCategory.entries()).map(([category, values]) => ({ category, values }))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load library tag vocabulary.");
  }
}
