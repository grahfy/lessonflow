import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";

import { getSessionCookieName } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import {
  CONFIGURABLE_ENV_VARS,
  getCurrentEnvValues,
  saveAdminSettingsConfig,
  type AdminSettingsSaveInput
} from "@/lib/setup";

const DEFAULT_SYSTEMD_SERVICE_NAME = "lessonflow";

/**
 * Queues a delayed systemd restart so the current HTTP response can complete before the app process
 * is bounced. The command is best-effort because many deployments require sudoers permission for the
 * runtime user (for example `www-data`) to restart the service.
 */
function queueSystemdServiceRestart(): { queued: boolean; warning?: string } {
  const serviceName = (process.env.SYSTEMD_SERVICE_NAME || DEFAULT_SYSTEMD_SERVICE_NAME).trim();
  if (!serviceName) {
    return { queued: false, warning: "Restart skipped: service name is not configured." };
  }
  if (!/^[a-zA-Z0-9_.@-]+$/.test(serviceName)) {
    return { queued: false, warning: "Restart skipped: service name contains unsupported characters." };
  }

  try {
    // Try direct systemctl first (works if the runtime user has permission), then passwordless sudo.
    // `sleep` gives the API time to flush the JSON response before the app process is restarted.
    const command = [
      "sleep 2",
      `systemctl restart '${serviceName}' >/dev/null 2>&1 || sudo -n systemctl restart '${serviceName}' >/dev/null 2>&1`
    ].join("; ");

    const child = spawn("bash", ["-lc", command], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();

    return { queued: true };
  } catch {
    return { queued: false, warning: "Restart could not be queued. Restart the service manually." };
  }
}

/**
 * Returns admin-editable environment settings plus the current authenticated admin profile.
 */
export async function GET(request: NextRequest) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
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
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
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

    const restart = queueSystemdServiceRestart();

    const response = NextResponse.json({
      ok: true,
      message: restart.queued
        ? `${result.message} Restarting the systemd service now.`
        : `${result.message} ${restart.warning || "Restart the service manually."}`,
      requiresReauth: result.requiresReauth,
      nextPath: result.requiresReauth ? "/admin/login" : undefined,
      restartQueued: restart.queued
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
