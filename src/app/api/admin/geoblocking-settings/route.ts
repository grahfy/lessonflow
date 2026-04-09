import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import {
  getGeoblockingSettings,
  saveGeoblockingSettings,
  serializeGeoblockingSettings
} from "@/lib/geoblocking-settings";
import { geoblockingSettingsInputSchema } from "@/lib/geoblocking-settings-contract";

function formatFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .filter(([, value]) => Array.isArray(value) && value.length > 0)
      .map(([key, value]) => [key, value?.[0] ?? "Invalid value."])
  );
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const settings = await getGeoblockingSettings();

    return NextResponse.json({
      ok: true,
      geoblockingSettings: serializeGeoblockingSettings(settings)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to load geoblocking settings.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = geoblockingSettingsInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid geoblocking settings payload.",
          fieldErrors: formatFieldErrors(parsed.error.flatten().fieldErrors)
        },
        { status: 400 }
      );
    }

    const settings = await saveGeoblockingSettings(parsed.data);

    return NextResponse.json({
      ok: true,
      geoblockingSettings: serializeGeoblockingSettings(settings)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save geoblocking settings.");
  }
}
