import { getRequestIpFromHeaders } from "@/lib/rate-limit";

type ResolveCountryResult = {
  country: string | null;
};

/**
 * Upstream geo lookup timeout (ms) so a slow provider can't stall handling.
 * Sized to tolerate a single AU->US round-trip with TLS setup; the previous
 * 2500ms was too tight once freeipapi.com started 302-redirecting (see
 * GEO_LOOKUP_ENDPOINT), causing intermittent aborts -> null country.
 */
const GEO_FETCH_TIMEOUT_MS = 4000;

/**
 * Geo provider endpoint. Point directly at the `free.` host: `freeipapi.com`
 * now 302-redirects there, and the extra redirect round-trip pushed lookups
 * over GEO_FETCH_TIMEOUT_MS under real traffic, yielding null countries.
 */
const GEO_LOOKUP_ENDPOINT = "https://free.freeipapi.com/api/json";

/** Matches a syntactically valid IPv4 dotted-quad or IPv6 address. */
const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

function isValidIpAddress(ip: string): boolean {
  if (IPV4_PATTERN.test(ip)) {
    return true;
  }
  // IPv6: must contain a colon and only hex/colon characters.
  return ip.includes(":") && IPV6_PATTERN.test(ip);
}

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
 *
 * SECURITY: `x-vercel-ip-country` / `cf-ipcountry` are client-spoofable on a
 * single-droplet (Nginx) deployment. They are only honored when
 * `TRUST_EDGE_GEO` explicitly names the platform that sets them
 * ("vercel" or "cloudflare"); otherwise they are ignored and resolution
 * falls back to a validated IP lookup.
 */
export async function resolveRequestCountry(headers: Headers): Promise<ResolveCountryResult> {
  const trustEdgeGeo = process.env.TRUST_EDGE_GEO?.trim().toLowerCase();

  if (trustEdgeGeo === "vercel") {
    const vercelCountry = normalizeCountryCode(headers.get("x-vercel-ip-country"));
    if (vercelCountry) {
      return { country: vercelCountry };
    }
  }

  if (trustEdgeGeo === "cloudflare") {
    const cloudflareCountry = normalizeCountryCode(headers.get("cf-ipcountry"));
    if (cloudflareCountry) {
      return { country: cloudflareCountry };
    }
  }

  const ip = getRequestIpFromHeaders(headers);
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return { country: null };
  }

  // SSRF guard: only fetch when `ip` is a syntactically valid address so an
  // attacker-controlled forwarding header cannot inject an arbitrary URL.
  if (!isValidIpAddress(ip)) {
    return { country: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEO_FETCH_TIMEOUT_MS);
  try {
    const geoResponse = await fetch(
      `${GEO_LOOKUP_ENDPOINT}/${encodeURIComponent(ip)}`,
      {
        cache: "no-store",
        signal: controller.signal
      }
    );
    if (!geoResponse.ok) {
      return { country: null };
    }
    const data = (await geoResponse.json()) as { countryCode?: unknown };
    return {
      country: normalizeCountryCode(data.countryCode)
    };
  } catch {
    return { country: null };
  } finally {
    clearTimeout(timeout);
  }
}
