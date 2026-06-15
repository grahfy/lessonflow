/**
 * First-Run Setup Readiness Checks
 *
 * Builds the `pass`/`warn`/`fail` pre-flight checks used by the Setup Wizard
 * UI (database connectivity, site URL, secrets, email delivery, storage) and
 * aggregates them into the overall readiness summary consumed by setup
 * UI/API entrypoints.
 */

import fs from "node:fs/promises";

import { z } from "zod";

import {
  DATABASE_UNAVAILABLE_CODE as SETUP_DB_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE as SETUP_DB_UNAVAILABLE_MESSAGE,
} from "@/lib/database-errors";
import { prisma } from "@/lib/db";
import { isGmailConfigured } from "@/lib/email/gmail-service";
import { getAdminCustomerEmailAlertsProvider, getOwnerEmail, isAdminCustomerEmailAlertsEnabled, isImapConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { isRelativeConfiguredPath } from "@/lib/runtime-paths";
import { getMaterialStorageDriverName } from "@/lib/student-portal/material-storage";
import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";
import { getStaffPhotoStorageRoot } from "@/lib/admin/staff-photo-storage";
import { getEmailSignatureLogoStorageRoot } from "@/lib/email/signature-storage";

import { isLikelyPlaceholder } from "./env-var-registry";

/**
 * Status levels for setup checks - determines UI display and if setup can proceed.
 */
export type SetupCheckStatus = "pass" | "warn" | "fail";

/**
 * Individual setup check result for the wizard UI.
 */
export type SetupCheck = {
  id: string;
  title: string;
  status: SetupCheckStatus;
  detail: string;
};

/**
 * Aggregated setup readiness result.
 */
export type SetupReadiness = {
  completed: boolean;
  checks: SetupCheck[];
  failCount: number;
  warnCount: number;
  passCount: number;
  canInitialize: boolean;
};

/**
 * Stable machine-readable code for admin/setup flows when Prisma cannot reach
 * the configured database.
 */
/**
 * Typed result for the first-read setup check used by admin and setup
 * entrypoints.
 *
 * RATIONALE: The old boolean-only `isSetupComplete()` helper could not
 * distinguish between "no admin exists yet" and "the database is down", so
 * callers incorrectly treated hard infrastructure failures as setup state.
 */
export type SetupCompletionState =
  | {
      status: "complete";
      adminCount: number;
    }
  | {
      status: "incomplete";
      adminCount: number;
    }
  | {
      status: "unavailable";
      errorCode: typeof SETUP_DB_UNAVAILABLE_CODE;
      message: string;
    };

/**
 * Validates that a URL is a safe absolute HTTP/HTTPS URL.
 */
function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Returns true when a secret exists, is not placeholder-like, and meets a minimum length.
 */
function hasStrongSecret(value: string, minLength: number): boolean {
  return value.trim().length >= minLength && !isLikelyPlaceholder(value);
}

/**
 * Resolves the configured local learning-material root directory.
 */
function getLocalMaterialRoot(): string {
  return getLocalMaterialStorageRoot();
}

/**
 * Performs a writable-directory probe for local material storage.
 */
async function canWriteStorageRoot(root: string): Promise<boolean> {
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.access(root);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the current setup completion state without throwing on transient or
 * infrastructure-level database failures.
 */
export async function getSetupCompletionState(): Promise<SetupCompletionState> {
  try {
    const adminCount = await prisma.adminUser.count();
    return adminCount > 0
      ? { status: "complete", adminCount }
      : { status: "incomplete", adminCount };
  } catch (error) {
    // RATIONALE: Admin entrypoints need a stable, user-safe failure mode for
    // database outages instead of letting the error boundary mask the real
    // infrastructure issue behind a generic "Something went wrong" screen.
    logError("setup.completion_state_failed", error, {
      code: SETUP_DB_UNAVAILABLE_CODE,
    });

    return {
      status: "unavailable",
      errorCode: SETUP_DB_UNAVAILABLE_CODE,
      message: SETUP_DB_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Backwards-compatible boolean setup check for legacy callers that do not yet
 * consume the richer completion state.
 */
export async function isSetupComplete(): Promise<boolean> {
  return (await getSetupCompletionState()).status === "complete";
}

/**
 * Builds environment and dependency checks used by the first-run setup wizard.
 *
 * The setup UI relies on mixed `pass`/`warn`/`fail` outcomes so it can block only hard
 * requirements while still surfacing production-readiness concerns before initialization.
 */
export async function evaluateSetupChecks(): Promise<SetupCheck[]> {
  const checks: SetupCheck[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  // Check order intentionally mirrors the setup UI flow: core connectivity first, then public URL,
  // notification identity, secrets, delivery, and storage.
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    checks.push({
      id: "database-url",
      title: "Database URL",
      status: "fail",
      detail: "DATABASE_URL is missing. Configure a persistent production database URL."
    });
  } else if (databaseUrl.startsWith("file:")) {
    checks.push({
      id: "database-url",
      title: "Database URL",
      status: isProduction ? "fail" : "warn",
      detail: isProduction
        ? "SQLite file URLs are not suitable for production hosting. Use MySQL for production deployments."
        : "SQLite is acceptable for local/test, but production should use MySQL."
    });
  } else {
    checks.push({
      id: "database-url",
      title: "Database URL",
      status: "pass",
      detail: "Database URL is configured for a server-based database driver."
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      id: "database-connectivity",
      title: "Database connectivity",
      status: "pass",
      detail: "Database connectivity check passed."
    });
  } catch {
    checks.push({
      id: "database-connectivity",
      title: "Database connectivity",
      status: "fail",
      detail: "Database connection failed. Verify network access and credentials."
    });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!siteUrl || !isValidHttpUrl(siteUrl)) {
    checks.push({
      id: "public-site-url",
      title: "Public site URL",
      status: "fail",
      detail: "NEXT_PUBLIC_SITE_URL must be a valid absolute URL."
    });
  } else if (isProduction && !siteUrl.startsWith("https://")) {
    checks.push({
      id: "public-site-url",
      title: "Public site URL",
      status: "fail",
      detail: "Production NEXT_PUBLIC_SITE_URL must use HTTPS."
    });
  } else {
    checks.push({
      id: "public-site-url",
      title: "Public site URL",
      status: "pass",
      detail: "Public site URL is valid."
    });
  }

  const ownerEmail = getOwnerEmail();
  const ownerEmailResult = z.string().email().safeParse(ownerEmail);
  if (!ownerEmailResult.success || isLikelyPlaceholder(ownerEmail)) {
    checks.push({
      id: "owner-email",
      title: "Owner notification email",
      status: "fail",
      detail: "Set ADMIN_EMAIL to a real inbox used for booking/contact notifications."
    });
  } else {
    checks.push({
      id: "owner-email",
      title: "Owner notification email",
      status: "pass",
      detail: "Owner notification email is configured."
    });
  }

  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || "";
  checks.push({
    id: "admin-session-secret",
    title: "Admin session secret",
    status: hasStrongSecret(adminSessionSecret, 32) ? "pass" : isProduction ? "fail" : "warn",
    detail: hasStrongSecret(adminSessionSecret, 32)
      ? "Admin session signing secret is strong."
      : "Set ADMIN_SESSION_SECRET to a random value at least 32 characters long."
  });

  const studentSessionSecret = process.env.STUDENT_SESSION_SECRET || "";
  checks.push({
    id: "student-session-secret",
    title: "Student session secret",
    status: hasStrongSecret(studentSessionSecret, 32) ? "pass" : isProduction ? "fail" : "warn",
    detail: hasStrongSecret(studentSessionSecret, 32)
      ? "Student session signing secret is strong."
      : "Set STUDENT_SESSION_SECRET to a random value at least 32 characters long."
  });

  const encryptionKey = process.env.STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY || "";
  checks.push({
    id: "portal-encryption-key",
    title: "Portal credential encryption key",
    status: hasStrongSecret(encryptionKey, 32) ? "pass" : isProduction ? "fail" : "warn",
    detail: hasStrongSecret(encryptionKey, 32)
      ? "Student portal credential encryption key is strong."
      : "Set STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY to a random value at least 32 characters long."
  });

  const cronSecret = process.env.CRON_SECRET || "";
  checks.push({
    id: "cron-secret",
    title: "Cron secret",
    status: hasStrongSecret(cronSecret, 24) ? "pass" : isProduction ? "fail" : "warn",
    detail: hasStrongSecret(cronSecret, 24)
      ? "Cron secret is configured."
      : "Set CRON_SECRET to a random value at least 24 characters long."
  });

  const gmailConfigured = isGmailConfigured();
  const gmailSender = (process.env.GMAIL_USER_EMAIL || "").trim();
  const gmailSenderValid = gmailSender ? z.string().email().safeParse(gmailSender).success : false;
  const imapConfigured = isImapConfigured();
  const alertProviderPreference = getAdminCustomerEmailAlertsProvider();
  const alertsEnabled = isAdminCustomerEmailAlertsEnabled();
  const smtpConfigured =
    Boolean((process.env.SMTP_HOST || "").trim()) &&
    Boolean((process.env.SMTP_USER || "").trim()) &&
    Boolean((process.env.SMTP_PASS || "").trim()) &&
    Boolean((process.env.SMTP_FROM || "").trim());

  const hasAnyGmailField =
    Boolean((process.env.GMAIL_CLIENT_ID || "").trim()) ||
    Boolean((process.env.GMAIL_CLIENT_SECRET || "").trim()) ||
    Boolean((process.env.GMAIL_REFRESH_TOKEN || "").trim()) ||
    Boolean(gmailSender);
  const hasAnyImapField =
    Boolean((process.env.IMAP_HOST || "").trim()) ||
    Boolean((process.env.IMAP_USER || "").trim()) ||
    Boolean((process.env.IMAP_PASS || "").trim()) ||
    Boolean((process.env.IMAP_MAILBOX || "").trim());

  checks.push({
    id: "email-delivery",
    title: "Email delivery",
    status: gmailConfigured || smtpConfigured ? "pass" : "warn",
    detail: gmailConfigured
      ? gmailSenderValid
        ? `Gmail API delivery is configured with sender ${gmailSender}.`
        : "Gmail API delivery is configured."
      : smtpConfigured
        ? "SMTP credentials are configured for outbound email delivery."
        : hasAnyGmailField
          ? "Gmail delivery is partially configured. Complete GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_USER_EMAIL (or configure SMTP)."
          : "Email delivery is not configured. Add Gmail API credentials (recommended) or SMTP credentials for outbound email delivery."
  });

  const inboundAlertsConfigured =
    alertProviderPreference === "gmail"
      ? gmailConfigured
      : alertProviderPreference === "imap"
        ? imapConfigured
        : gmailConfigured || imapConfigured;

  checks.push({
    id: "customer-email-alerts-inbox",
    title: "Customer email alert inbox",
    status: !alertsEnabled ? "pass" : inboundAlertsConfigured ? "pass" : "warn",
    detail: !alertsEnabled
      ? "Owner customer email alerts are disabled."
      : inboundAlertsConfigured
        ? alertProviderPreference === "gmail"
          ? "Customer email alerts are configured to use Gmail inbox access."
          : alertProviderPreference === "imap"
            ? "Customer email alerts are configured to use IMAP inbox access."
            : gmailConfigured
              ? "Customer email alerts are configured and will use Gmail inbox access."
              : "Customer email alerts are configured and will use IMAP inbox access."
        : hasAnyImapField
          ? "IMAP inbox access is partially configured. Complete IMAP_HOST, IMAP_USER, IMAP_PASS, and optional IMAP_PORT/IMAP_TLS/IMAP_MAILBOX."
          : hasAnyGmailField
            ? "Gmail inbox access is partially configured. Complete GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_USER_EMAIL."
            : "Customer email alerts are enabled but no inbox provider is configured. Add Gmail API credentials or IMAP mailbox settings."
  });

  const storageDriver = getMaterialStorageDriverName();
  if (storageDriver === "s3") {
    checks.push({
      id: "materials-storage-driver",
      title: "Learning material storage",
      status: "fail",
      detail: "S3 storage driver is selected but not implemented in this build. Use local storage with persistent volume."
    });
  } else {
    const configuredMaterialRoot = process.env.LEARNING_MATERIALS_LOCAL_ROOT?.trim();
    const resolvedMaterialRoot = getLocalMaterialRoot();
    const localStorageWritable = await canWriteStorageRoot(resolvedMaterialRoot);
    const staffPhotoRoot = getStaffPhotoStorageRoot();
    const emailSignatureRoot = getEmailSignatureLogoStorageRoot();
    const staffPhotoWritable = await canWriteStorageRoot(staffPhotoRoot);
    const emailSignatureWritable = await canWriteStorageRoot(emailSignatureRoot);
    const materialRootIsRelative = isRelativeConfiguredPath(configuredMaterialRoot);
    checks.push({
      id: "materials-storage-driver",
      title: "Learning material storage",
      status: localStorageWritable ? (isProduction ? "warn" : "pass") : "fail",
      detail: localStorageWritable
        ? isProduction
          ? materialRootIsRelative
            ? `Local storage is writable at ${resolvedMaterialRoot}, but the configured path is relative. Use an absolute shared path in production so uploads stay outside the current release.`
            : `Local storage is writable at ${resolvedMaterialRoot}. Ensure your hosting keeps this directory persistent and backed up.`
          : "Local storage root is writable."
        : `Local storage root is not writable at ${resolvedMaterialRoot}. Fix LEARNING_MATERIALS_LOCAL_ROOT permissions.`
    });

    checks.push({
      id: "staff-photo-storage",
      title: "Staff photo storage",
      status: staffPhotoWritable ? (isProduction ? "warn" : "pass") : "fail",
      detail: staffPhotoWritable
        ? isProduction
          ? `Local storage is writable at ${staffPhotoRoot}. Ensure this shared path stays writable for admin profile photo uploads.`
          : "Local staff photo storage root is writable."
        : `Local staff photo storage root is not writable at ${staffPhotoRoot}.`
    });

    checks.push({
      id: "email-signature-logo-storage",
      title: "Email signature logo storage",
      status: emailSignatureWritable ? (isProduction ? "warn" : "pass") : "fail",
      detail: emailSignatureWritable
        ? isProduction
          ? `Local storage is writable at ${emailSignatureRoot}. Ensure this shared path stays writable for email signature logo uploads.`
          : "Local email signature logo storage root is writable."
        : `Local email signature logo storage root is not writable at ${emailSignatureRoot}.`
    });
  }

  return checks;
}

/**
 * Computes setup completion and requirement-check summary for setup UI/API usage.
 */
export async function getSetupReadiness(
  setupCompletionState?: SetupCompletionState
): Promise<SetupReadiness> {
  const completionState = setupCompletionState ?? await getSetupCompletionState();
  if (completionState.status === "unavailable") {
    throw new AppError(completionState.message, completionState.errorCode, 503);
  }

  const checks = await evaluateSetupChecks();

  const failCount = checks.filter((entry) => entry.status === "fail").length;
  const warnCount = checks.filter((entry) => entry.status === "warn").length;
  const passCount = checks.filter((entry) => entry.status === "pass").length;

  return {
    completed: completionState.status === "complete",
    checks,
    failCount,
    warnCount,
    passCount,
    canInitialize: completionState.status !== "complete" && failCount === 0
  };
}
