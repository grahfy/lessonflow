export function getOwnerEmail(): string {
  return process.env.ADMIN_EMAIL || "owner@example.com";
}

export function getCronSecret(): string {
  return process.env.CRON_SECRET || "";
}

export function hasCronSecret(): boolean {
  return !!process.env.CRON_SECRET && process.env.CRON_SECRET.length > 0;
}

/**
 * Returns canonical site URL used in customer-facing links.
 */
export function getPublicSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";
}

/**
 * Returns full student login URL for portal onboarding emails.
 */
export function getStudentPortalLoginUrl(): string {
  return `${getPublicSiteUrl().replace(/\/+$/, "")}/student/login`;
}
