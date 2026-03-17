import { NextResponse } from "next/server";

import { getSetupAccessDeniedMessage, isSetupAccessAllowed } from "@/lib/setup-access";
import { getSetupReadiness, isSetupComplete } from "@/lib/setup";

/**
 * Returns first-run setup completion state and production-readiness checks.
 */
export async function GET(request?: Request) {
  if (!isSetupAccessAllowed(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: getSetupAccessDeniedMessage(),
        code: "SETUP_ACCESS_DENIED",
        completed: false
      },
      { status: 403 }
    );
  }

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
