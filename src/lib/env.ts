/**
 * Environment Variable Accessors
 * 
 * This module provides type-safe access to environment variables used throughout
 * the Melbourne Guitar School application. These variables configure critical
 * system behavior including admin credentials, site URLs, and security settings.
 * 
 * SECURITY CONSIDERATIONS:
 * - Cron secrets should be long random strings (24+ characters) to prevent
 *   unauthorized access to scheduled job endpoints
 * - Site URLs are used in email links sent to customers, so they must be
 *   valid and accessible
 * 
 * UI/USAGE:
 * - getOwnerEmail(): Used for admin notifications and as fallback for customer communications
 * - getPublicSiteUrl(): Used in all customer-facing email links and redirects
 * - getStudentPortalLoginUrl(): Direct link for student portal login page
 */

/**
 * Retrieves the admin/owner email address from environment variables.
 * 
 * This email is used for:
 * - Admin notifications about new bookings and contact form submissions
 * - System error notifications
 * - Fallback sender for customer communications
 * 
 * @returns The configured ADMIN_EMAIL or a placeholder for local development
 * @security Returns a default placeholder in development - ensure production sets this
 */
export function getOwnerEmail(): string {
  return process.env.ADMIN_EMAIL || "owner@example.com";
}

/**
 * Retrieves the cron secret for authenticating scheduled job endpoints.
 * 
 * CRON JOBS:
 * - Used to secure /api/cron/* endpoints that perform automated tasks
 * - Should only be accessible by trusted cron services (e.g., Vercel Cron)
 * 
 * @returns The CRON_SECRET value or empty string if not configured
 * @security Empty string indicates cron endpoints are unprotected
 */
export function getCronSecret(): string {
  return process.env.CRON_SECRET || "";
}

/**
 * Checks whether a cron secret has been configured.
 * 
 * @returns true if CRON_SECRET is set and non-empty, false otherwise
 * @security This check is used to determine if cron endpoints should allow access
 */
export function hasCronSecret(): boolean {
  return !!process.env.CRON_SECRET && process.env.CRON_SECRET.length > 0;
}

/**
 * Returns canonical site URL used in customer-facing links.
 * 
 * USAGE:
 * - Email templates for booking confirmations
 * - Invoice PDF generation
 * - Student portal login links
 * - Redirect URLs after form submissions
 * 
 * @returns The NEXT_PUBLIC_SITE_URL or localhost for development
 * @security Should always use HTTPS in production to prevent man-in-the-middle attacks
 * @ui Used in all automated emails sent to customers
 */
export function getPublicSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";
}

/**
 * Returns full student login URL for portal onboarding emails.
 * 
 * This constructs the complete URL by combining the public site URL with
 * the student login path, ensuring consistent link generation across
 * the application.
 * 
 * @returns Complete URL to the student portal login page
 * @ui Used in welcome emails when students are given portal access
 * @see getPublicSiteUrl
 */
export function getStudentPortalLoginUrl(): string {
  return `${getPublicSiteUrl().replace(/\/+$/, "")}/student/login`;
}
