import { NextResponse } from "next/server";

import { getSetupReadiness } from "@/lib/setup";

/**
 * Returns first-run setup completion state and production-readiness checks.
 */
export async function GET() {
  const readiness = await getSetupReadiness();
  return NextResponse.json({
    ok: true,
    readiness
  });
}
