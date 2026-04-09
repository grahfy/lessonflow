import { NextResponse } from "next/server";

import { getSetupAccessDeniedMessage, isSetupAccessAllowed } from "@/lib/setup-access";
import { getSetupCompletionState, getSetupReadiness } from "@/lib/setup";

/**
 * Returns first-run setup completion state and production-readiness checks.
 */
export async function GET(request: Request) {
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

  const setupState = await getSetupCompletionState();
  if (setupState.status === "unavailable") {
    return NextResponse.json(
      {
        ok: false,
        error: setupState.message,
        code: setupState.errorCode,
        completed: false
      },
      { status: 503 }
    );
  }

  if (setupState.status === "complete") {
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

  const readiness = await getSetupReadiness(setupState);
  return NextResponse.json({
    ok: true,
    readiness
  });
}
