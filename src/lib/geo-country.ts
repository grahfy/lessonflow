import { getRequestIpFromHeaders } from "@/lib/rate-limit";

type ResolveCountryResult = {
  country: string | null;
};

function normalizeCountryCode(value: unknown): string | null {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (!normalized || normalized === "XX") {
    return null;
  }
  return normalized;
}

/**
 * Resolves a request country from trusted edge headers or IP lookup fallback.
 */
export async function resolveRequestCountry(headers: Headers): Promise<ResolveCountryResult> {
  const vercelCountry = normalizeCountryCode(headers.get("x-vercel-ip-country"));
  if (vercelCountry) {
    return { country: vercelCountry };
  }

  const cloudflareCountry = normalizeCountryCode(headers.get("cf-ipcountry"));
  if (cloudflareCountry) {
    return { country: cloudflareCountry };
  }

  const ip = getRequestIpFromHeaders(headers);
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return { country: null };
  }

  try {
    const geoResponse = await fetch(`https://freeipapi.com/api/json/${ip}`, {
      cache: "no-store"
    });
    if (!geoResponse.ok) {
      return { country: null };
    }
    const data = (await geoResponse.json()) as { countryCode?: unknown };
    return {
      country: normalizeCountryCode(data.countryCode)
    };
  } catch {
    return { country: null };
  }
}
