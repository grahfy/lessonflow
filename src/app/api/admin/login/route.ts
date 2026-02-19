import { NextResponse } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName, verifyAdminPassword } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  await ensureOwnerAdmin();

  const admin = await verifyAdminPassword(email, password);
  if (!admin) {
    return NextResponse.json({ error: "Invalid login credentials." }, { status: 401 });
  }

  const token = createSessionToken(admin.email);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return response;
}
