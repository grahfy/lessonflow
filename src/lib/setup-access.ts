import crypto from "node:crypto";

export const SETUP_ACCESS_TOKEN_HEADER = "x-setup-access-token";
export const SETUP_ACCESS_TOKEN_QUERY_PARAM = "setupToken";

function getConfiguredSetupAccessToken(): string {
  return process.env.SETUP_ACCESS_TOKEN?.trim() || "";
}

function getRequestSetupAccessToken(request?: Request): string {
  if (!request) {
    return "";
  }

  const headerToken = request.headers.get(SETUP_ACCESS_TOKEN_HEADER)?.trim();
  if (headerToken) {
    return headerToken;
  }

  try {
    return new URL(request.url).searchParams.get(SETUP_ACCESS_TOKEN_QUERY_PARAM)?.trim() || "";
  } catch {
    return "";
  }
}

function tokensMatch(expected: string, actual: string): boolean {
  if (!expected || !actual) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function hasSetupAccessTokenConfigured(): boolean {
  return getConfiguredSetupAccessToken().length > 0;
}

export function isValidSetupAccessToken(token?: string | null): boolean {
  const configuredToken = getConfiguredSetupAccessToken();
  if (!configuredToken || !token?.trim()) {
    return false;
  }

  return tokensMatch(configuredToken, token.trim());
}

/**
 * Production setup requires an explicit bootstrap token because request host/IP metadata can be
 * spoofed by internet clients when the app is exposed directly.
 */
export function isSetupAccessAllowed(request?: Request): boolean {
  if (!request || process.env.NODE_ENV !== "production") {
    return true;
  }

  return isValidSetupAccessToken(getRequestSetupAccessToken(request));
}

export function getSetupAccessDeniedMessage(): string {
  if (process.env.NODE_ENV !== "production") {
    return "Setup access is denied.";
  }

  if (!hasSetupAccessTokenConfigured()) {
    return "Production setup is locked until SETUP_ACCESS_TOKEN is configured on the server.";
  }

  return "Setup access requires the configured production bootstrap token.";
}
