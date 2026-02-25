import { NextResponse } from "next/server";

import { getSetupReadiness, isSetupComplete } from "@/lib/setup";

/**
 * Returns first-run setup completion state and production-readiness checks.
 */
export async function GET() {
  if (await isSetupComplete()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Setup is already complete.",
        code: "SETUP_COMPLETE",
        completed: true
      },
      { status: 409 }
    );
  }

  const readiness = await getSetupReadiness();
  return NextResponse.json({
    ok: true,
    readiness
  });
}
