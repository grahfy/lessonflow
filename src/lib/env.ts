/**
 * Environment Configuration & Global Definitions
 * 
 * Provides type-safe accessors for critical environment variables and secrets.
 * 
 * ARCHITECTURAL RATIONALE:
 * 1. Single Source of Truth: Centralizing `process.env` access here prevents 
 *    typos and duplicate fallback logic across the application.
 * 2. Fail-Safe Defaults: Local development should instantly work without a 
 *    massive `.env` file, while Production should securely inject values.
 * 3. Security Boundary: Cron secrets and Site URLs are security-sensitive 
 *    and this file acts as the explicit interface for reading them.
 */

/**
 * Retrieves the primary admin contact email.
 * 
 * RATIONALE: This acts as the fallback sender for system notifications and 
 * outbound customer communications if `SMTP_FROM` is not explicitly set.
 */
export function getOwnerEmail(): string {
  return process.env.ADMIN_EMAIL || "owner@example.com";
}

/**
 * Retrieves the cryptographic secret required to trigger background routines.
 * 
 * SECURITY RATIONALE: Vercel/VPS Cron jobs hit public `/api/jobs/*` endpoints. 
 * This secret ensures that unauthorized actors cannot trigger arbitrary 
 * database mutations or email floods.
 */
export function getCronSecret(): string {
  return process.env.CRON_SECRET || "";
}

/**
 * Checks if the background automation endpoints are secured.
 */
export function hasCronSecret(): boolean {
  return !!process.env.CRON_SECRET && process.env.CRON_SECRET.length > 0;
}

/**
 * Returns the canonical frontend URL for public routing.
 * 
 * LOGIC: Used to construct absolute URLs (e.g. `https://example.com/login`) 
 * for outbound emails and PDF generation, where relative paths (`/login`) 
 * would be broken.
 */
export function getPublicSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";
}

/**
 * Resolves the directory housing the git repository.
 * 
 * RATIONALE: The deployment engine uses Git to pull updates. In production, 
 * the repository root might be higher up the directory tree than the 
 * Next.js `.next` folder.
 */
export function getUpdatesGitRepoPath(): string {
  return (process.env.UPDATES_GIT_REPO_PATH || process.cwd()).trim();
}

/**
 * Helper to build the exact login link for portal invitations.
 */
export function getStudentPortalLoginUrl(): string {
  return `${getPublicSiteUrl().replace(/\/+$/, "")}/student/login`;
}
