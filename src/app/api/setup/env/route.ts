import { NextResponse } from "next/server";

import { getSetupAccessDeniedMessage, isSetupAccessAllowed } from "@/lib/setup-access";
import { CONFIGURABLE_ENV_VARS, getCurrentEnvValues, isSetupComplete } from "@/lib/setup";

/**
 * Returns current env var configuration for the setup UI.
 * Secrets are masked - only indicates whether they are set.
 */
export async function GET(request?: Request) {
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

  const values = getCurrentEnvValues();

  const envVars = CONFIGURABLE_ENV_VARS.map((def) => ({
    key: def.key,
    title: def.title,
    description: def.description,
    placeholder: def.placeholder,
    isRequired: def.isRequired,
    isSecret: def.isSecret,
    currentValue: values[def.key] || ""
  }));

  return NextResponse.json({
    ok: true,
    envVars
  });
}
