import { NextResponse } from "next/server";

import { saveEnvConfig } from "@/lib/setup";

/**
 * Saves env var configuration from the setup UI.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
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
