import { NextResponse } from "next/server";

import { CONFIGURABLE_ENV_VARS, getCurrentEnvValues } from "@/lib/setup";

/**
 * Returns current env var configuration for the setup UI.
 * Secrets are masked - only indicates whether they are set.
 */
export async function GET() {
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
