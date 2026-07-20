import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { reorderMaterials } from "@/lib/materials/reorder";
import { studentReorderRequestSchema } from "@/lib/student-portal/contracts";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

/**
 * Moves and reorders the authenticated student's own materials.
 *
 * SCOPE: `customerId` comes from the session and is never read from the body,
 * so a student cannot address another student's rows. Ownership is enforced
 * inside `reorderMaterials` by the `findMany` where-clause, the `rows.length`
 * comparison and the `WHERE customerId` on the CASE update — never
 * findUnique-then-compare, and never a bare `updateMany` (which affects 0 rows
 * on a foreign id without throwing, i.e. would 200 a cross-customer write).
 *
 * NOT AN EXISTENCE ORACLE: both `not_found` and `cross_customer` map to 404.
 * The admin route's 400 `CROSS_CUSTOMER` is deliberately NOT copied here — it
 * would tell a student whether an arbitrary folder id exists.
 *
 * CSRF: the actual mitigation is that `PATCH` + `application/json` forces a
 * preflight (the session cookie is `sameSite: "lax"` and this app has no CSRF
 * token). The 415 below is defence in depth, not the mechanism. `POST` and
 * `text/plain` are not accepted.
 *
 * INV-4 DEVIATION (deliberate, plan accepted-risk 3): no `canManageBooking` is
 * passed, so a student CAN reorder their own booking-linked materials even
 * though an admin who is not the assigned teacher cannot. The material is the
 * student's own and only `folderId`/`sortOrder` change. Pinned by a test so a
 * future change trips red rather than drifting.
 *
 * NO RATE LIMIT (user-confirmed): the writes are non-destructive and
 * self-scoped, and `consumeRateLimit` short-circuits under vitest, so any limit
 * here would ship unverified.
 */
export async function PATCH(request: NextRequest) {
  try {
    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: "Unsupported media type." }, { status: 415 });
    }

    const parsed = studentReorderRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid reorder.", details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await reorderMaterials({
      customerId: student.id,
      folderId: parsed.data.folderId,
      movedId: parsed.data.movedId,
      orderedIds: parsed.data.orderedIds
    });

    if (!result.ok) {
      if (result.reason === "stale") {
        return NextResponse.json({ error: "Materials changed.", code: "STALE_ORDER" }, { status: 409 });
      }
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ materials: result.materials });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to reorder learning materials.");
  }
}
