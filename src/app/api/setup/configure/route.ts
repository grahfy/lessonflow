import { NextResponse } from "next/server";

import { getSetupAccessDeniedMessage, isSetupAccessAllowed } from "@/lib/setup-access";
import { isSetupComplete, saveEnvConfig } from "@/lib/setup";

/**
 * Saves env var configuration from the setup UI.
 */
export async function POST(request: Request) {
  try {
    if (!isSetupAccessAllowed(request)) {
      return NextResponse.json(
        {
          ok: false,
          error: getSetupAccessDeniedMessage(),
          code: "SETUP_ACCESS_DENIED"
        },
        { status: 403 }
      );
    }

    if (await isSetupComplete()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Setup is already complete.",
          code: "SETUP_COMPLETE"
        },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid configuration payload."
        },
        { status: 400 }
      );
    }
    const result = await saveEnvConfig(body);

    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation failed",
          fieldErrors: result.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Environment configuration saved. Restart the server to apply changes."
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save configuration"
      },
      { status: 500 }
    );
  }
}
