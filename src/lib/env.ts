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
 * Returns whether owner login should surface unread customer-email alerts.
 */
export function isAdminCustomerEmailAlertsEnabled(): boolean {
  const value = (process.env.ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED || "").trim().toLowerCase();
  if (!value) {
    return true;
  }

  return value !== "false";
}

export type CustomerEmailAlertsProvider = "auto" | "gmail" | "imap";

/**
 * Returns the configured inbound provider preference for customer email alerts.
 */
export function getAdminCustomerEmailAlertsProvider(): CustomerEmailAlertsProvider {
  const value = (process.env.ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER || "").trim().toLowerCase();
  if (value === "gmail" || value === "imap") {
    return value;
  }

  return "auto";
}

/**
 * Returns whether IMAP inbox access is configured for inbound email checks.
 */
export function isImapConfigured(): boolean {
  return Boolean(
    (process.env.IMAP_HOST || "").trim() &&
      (process.env.IMAP_USER || "").trim() &&
      (process.env.IMAP_PASS || "").trim()
  );
}

export type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
};

/**
 * Returns normalized IMAP configuration for inbox polling.
 */
export function getImapConfig(): ImapConfig {
  const host = (process.env.IMAP_HOST || "").trim();
  const user = (process.env.IMAP_USER || "").trim();
  const pass = process.env.IMAP_PASS || "";

  if (!host || !user || !pass) {
    throw new Error("Missing IMAP inbox configuration in environment variables.");
  }

  const port = Number(process.env.IMAP_PORT || 993);
  const secure = (process.env.IMAP_TLS || "true").trim().toLowerCase() !== "false";
  const mailbox = (process.env.IMAP_MAILBOX || "INBOX").trim() || "INBOX";

  return {
    host,
    port: Number.isFinite(port) ? port : 993,
    secure,
    user,
    pass,
    mailbox
  };
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
 * Returns the OS user that should run web-triggered deploys.
 *
 * RATIONALE: Browser-triggered updates use this account for source-git fetch
 * and merge operations even when the host-side runner itself executes with
 * higher privileges for swap management and service restarts.
 */
export function getUpdatesDeployUser(): string {
  return (process.env.UPDATES_DEPLOY_USER || "").trim();
}

/**
 * Returns the systemd unit used to launch a browser-triggered update.
 */
export function getWebUpdateServiceName(): string {
  return (process.env.UPDATES_WEB_SYSTEMD_SERVICE_NAME || "lessonflow-web-update.service").trim();
}

/**
 * Helper to build the exact login link for portal invitations.
 */
export function getStudentPortalLoginUrl(): string {
  return `${getPublicSiteUrl().replace(/\/+$/, "")}/student/login`;
}
