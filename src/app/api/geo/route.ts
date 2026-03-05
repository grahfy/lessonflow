import { NextRequest, NextResponse } from "next/server";
import { resolveRequestCountry } from "@/lib/geo-country";

/**
 * API Route: /api/geo
 * Description: Detects the user's country based on their IP address.
 * 
 * Rationale: This is used by the booking form to restrict submissions
 * to Australian residents only, preventing international spam or
 * unqualified leads.
 * 
 * Logic:
 * 1. Checks for Vercel-specific geolocation headers.
 * 2. Fallback to Cloudflare or common proxy headers.
 * 3. Final fallback to a free external IP-to-Country API.
 */
export async function GET(request: NextRequest) {
  const resolved = await resolveRequestCountry(request.headers);
  if (resolved.country) {
    return NextResponse.json({ country: resolved.country });
  }

  // Fail open or default to AU in case of API failure to avoid blocking valid users
  return NextResponse.json({ country: "AU", note: "Lookup failed, defaulting to AU" });
}
