import { NextResponse } from "next/server";

import { createSessionToken, getSessionCookieName } from "@/lib/admin-auth";
import { getSetupAccessDeniedMessage, isSetupAccessAllowed } from "@/lib/setup-access";
import { createInitialAdmin, getSetupReadiness, setupInitializeSchema } from "@/lib/setup";

/**
 * Creates the first admin account after requirement checks pass.
 */
export async function POST(request: Request) {
  if (!isSetupAccessAllowed(request)) {
    return NextResponse.json(
      {
        error: getSetupAccessDeniedMessage(),
        code: "SETUP_ACCESS_DENIED"
      },
      { status: 403 }
    );
  }

  const readiness = await getSetupReadiness();
  if (readiness.completed) {
    return NextResponse.json({ error: "Setup is already complete." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = setupInitializeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid setup payload.",
        details: parsed.error.flatten(),
        readiness
      },
      { status: 400 }
    );
  }

  if (readiness.failCount > 0) {
    return NextResponse.json(
      {
        error: "Resolve all failing setup checks before initializing production.",
        readiness
      },
      { status: 400 }
    );
  }

  const createdAdmin = await createInitialAdmin(parsed.data);
  if (!createdAdmin) {
    return NextResponse.json({ error: "Setup has already been initialized by another session." }, { status: 409 });
  }

  const token = createSessionToken(createdAdmin.email);
  const response = NextResponse.json({
    ok: true,
    admin: {
      id: createdAdmin.id,
      email: createdAdmin.email,
      displayName: createdAdmin.displayName
    },
    nextPath: "/admin/bookings"
  }, { status: 201 });

  response.cookies.set(getSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });

  return response;
}
