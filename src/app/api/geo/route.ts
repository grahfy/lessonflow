import { NextRequest, NextResponse } from "next/server";

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
  // 1. Check for platform-provided headers (Vercel, Cloudflare, etc.)
  const vercelCountry = request.headers.get("x-vercel-ip-country");
  if (vercelCountry) {
    return NextResponse.json({ country: vercelCountry });
  }

  const cfCountry = request.headers.get("cf-ipcountry");
  if (cfCountry) {
    return NextResponse.json({ country: cfCountry });
  }

  // 2. Identify IP for external lookup
  // We prefer x-forwarded-for or x-real-ip if behind a proxy like Nginx
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = (forwardedFor ? forwardedFor.split(",")[0] : realIp) || "127.0.0.1";

  // Skip lookup for local development IPs
  if (ip === "127.0.0.1" || ip === "::1" || !ip) {
    return NextResponse.json({ country: "AU", note: "Local development fallback" });
  }

  try {
    // 3. External API Lookup (ip-api.com - free for non-commercial/low-volume)
    // Using freeipapi.com as an alternative which is also robust
    const geoResponse = await fetch(`https://freeipapi.com/api/json/${ip}`, {
      next: { revalidate: 3600 } // Cache for an hour
    });
    
    if (geoResponse.ok) {
      const data = await geoResponse.json();
      return NextResponse.json({ 
        country: data.countryCode, // e.g. "AU"
        city: data.cityName 
      });
    }
  } catch (error) {
    console.error("Geo lookup failed:", error);
  }

  // Fail open or default to AU in case of API failure to avoid blocking valid users
  return NextResponse.json({ country: "AU", note: "Lookup failed, defaulting to AU" });
}
