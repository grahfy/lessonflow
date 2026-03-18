import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import {
  getNotificationSettings,
  saveNotificationSettings,
  serializeNotificationSettings
} from "@/lib/email/notification-settings";
import { notificationSettingsInputSchema } from "@/lib/email/notification-settings-contract";

function formatFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .filter(([, value]) => Array.isArray(value) && value.length > 0)
      .map(([key, value]) => [key, value?.[0] ?? "Invalid value."])
  );
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const settings = await getNotificationSettings();
  return NextResponse.json({
    ok: true,
    notificationSettings: serializeNotificationSettings(settings)
  });
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

    const parsed = notificationSettingsInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid notification settings payload.",
          fieldErrors: formatFieldErrors(parsed.error.flatten().fieldErrors)
        },
        { status: 400 }
      );
    }

    const settings = await saveNotificationSettings(parsed.data);
    return NextResponse.json({
      ok: true,
      notificationSettings: serializeNotificationSettings(settings)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save notification settings.");
  }
}
