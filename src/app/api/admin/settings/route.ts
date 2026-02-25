import { NextRequest, NextResponse } from "next/server";

import { getSessionCookieName } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import {
  CONFIGURABLE_ENV_VARS,
  getCurrentEnvValues,
  saveAdminSettingsConfig,
  type AdminSettingsSaveInput
} from "@/lib/setup";

/**
 * Returns admin-editable environment settings plus the current authenticated admin profile.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const values = getCurrentEnvValues();

  return NextResponse.json({
    ok: true,
    admin: {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName
    },
    envVars: CONFIGURABLE_ENV_VARS.map((def) => ({
      key: def.key,
      title: def.title,
      description: def.description,
      placeholder: def.placeholder,
      isRequired: def.isRequired,
      isSecret: def.isSecret,
      currentValue: values[def.key] || ""
    }))
  });
}

/**
 * Saves admin-editable environment settings and synchronizes admin credentials into the DB.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          env?: Record<string, unknown>;
          adminPassword?: unknown;
        }
      | null;

    const envPayload = body?.env && typeof body.env === "object" ? body.env : null;
    if (!envPayload) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid settings payload."
        },
        { status: 400 }
      );
    }

    const input: AdminSettingsSaveInput = {};
    for (const def of CONFIGURABLE_ENV_VARS) {
      const raw = envPayload[def.key];
      input[def.key] = typeof raw === "string" ? raw : "";
    }
    input.ADMIN_PASSWORD = typeof body?.adminPassword === "string" ? body.adminPassword : "";

    const result = await saveAdminSettingsConfig(input, { currentAdminId: admin.id });
    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Validation failed",
          fieldErrors: result.errors
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      message: result.message,
      requiresReauth: result.requiresReauth,
      nextPath: result.requiresReauth ? "/admin/login" : undefined
    });

    if (result.requiresReauth) {
      response.cookies.set(getSessionCookieName(), "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0
      });
    }

    return response;
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save admin settings.");
  }
}
