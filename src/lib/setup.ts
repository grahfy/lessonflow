/**
 * Setup Wizard Configuration
 * 
 * First-run setup wizard for configuring environment variables and creating
 * the initial admin account. Used during initial deployment.
 */

import fs from "node:fs/promises";
import path from "node:path";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { isGmailConfigured } from "@/lib/email/gmail-service";
import { getOwnerEmail } from "@/lib/env";
import { getMaterialStorageDriverName } from "@/lib/student-portal/material-storage";

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
 * Environment variable definitions for setup configuration.
 * Each entry defines the key, display info, validation, and whether it's sensitive.
 */
export const CONFIGURABLE_ENV_VARS = [
  {
    key: "DATABASE_URL",
    title: "Database URL",
    description: "Connection string for your database. Use file:./prisma/dev.db for SQLite, or mysql://user:pass@host:port/db for MySQL.",
    placeholder: "mysql://user:password@localhost:3306/dbname",
    isRequired: true,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return "Database URL is required";
      if (v.startsWith("file:")) return null; // SQLite is valid
      if (!v.match(/^mysql:\/\/.+/)) return "Must be a valid database URL (mysql://... or file:...)";
      return null;
    }
  },
  {
    key: "NEXT_PUBLIC_SITE_URL",
    title: "Site URL",
    description: "Public URL where the site will be accessible (include protocol).",
    placeholder: "https://example.com",
    isRequired: true,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return "Site URL is required";
      try {
        const url = new URL(v);
        if (!["http:", "https:"].includes(url.protocol)) return "Must use http or https";
        return null;
      } catch {
        return "Must be a valid URL";
      }
    }
  },
  {
    key: "ADMIN_EMAIL",
    title: "Owner Email",
    description: "Email address for admin notifications and login.",
    placeholder: "owner@example.com",
    isRequired: true,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return "Owner email is required";
      const result = z.string().email().safeParse(v);
      return result.success ? null : "Must be a valid email";
    }
  },
  {
    key: "GMAIL_CLIENT_ID",
    title: "Gmail Client ID",
    description: "Google Cloud OAuth2 client ID used for Gmail API delivery (preferred on hosts that block SMTP ports).",
    placeholder: "1234567890-abc123.apps.googleusercontent.com",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "GMAIL_CLIENT_SECRET",
    title: "Gmail Client Secret",
    description: "Google Cloud OAuth2 client secret for the Gmail API app.",
    placeholder: "GOCSPX-...",
    isRequired: false,
    isSecret: true,
    validation: () => null
  },
  {
    key: "GMAIL_REFRESH_TOKEN",
    title: "Gmail Refresh Token",
    description: "Refresh token generated for the Gmail API sender account.",
    placeholder: "1//0g...",
    isRequired: false,
    isSecret: true,
    validation: () => null
  },
  {
    key: "GMAIL_USER_EMAIL",
    title: "Gmail Sender Address",
    description: "Gmail address used as the sender for outbound emails (for example lessonflow@gmail.com).",
    placeholder: "lessonflow@gmail.com",
    isRequired: false,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return null;
      const result = z.string().email().safeParse(v);
      return result.success ? null : "Must be a valid email";
    }
  },
  {
    key: "SMTP_HOST",
    title: "SMTP Host",
    description: "Email server hostname (optional - leave blank to skip email setup).",
    placeholder: "smtp.example.com",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "SMTP_PORT",
    title: "SMTP Port",
    description: "Email server port.",
    placeholder: "587",
    isRequired: false,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return null;
      const port = parseInt(v, 10);
      if (isNaN(port) || port < 1 || port > 65535) return "Must be a valid port number";
      return null;
    }
  },
  {
    key: "SMTP_USER",
    title: "SMTP Username",
    description: "Username for SMTP authentication.",
    placeholder: "user@example.com",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "SMTP_PASS",
    title: "SMTP Password",
    description: "Password for SMTP authentication.",
    placeholder: "your-smtp-password",
    isRequired: false,
    isSecret: true,
    validation: () => null
  },
  {
    key: "SMTP_FROM",
    title: "SMTP From Address",
    description: "Sender name and email for outgoing emails.",
    placeholder: "LessonFlow <no-reply@example.com>",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "ADMIN_SESSION_SECRET",
    title: "Admin Session Secret",
    description: "Random string used to sign admin sessions (32+ characters recommended).",
    placeholder: "generate-a-random-secret-key",
    isRequired: true,
    isSecret: true,
    validation: (v: string) => {
      if (!v.trim()) return "Admin session secret is required";
      if (v.length < 16) return "Should be at least 16 characters";
      return null;
    }
  },
  {
    key: "STUDENT_SESSION_SECRET",
    title: "Student Session Secret",
    description: "Random string used to sign student portal sessions (32+ characters recommended).",
    placeholder: "generate-another-random-secret",
    isRequired: true,
    isSecret: true,
    validation: (v: string) => {
      if (!v.trim()) return "Student session secret is required";
      if (v.length < 16) return "Should be at least 16 characters";
      return null;
    }
  },
  {
    key: "STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY",
    title: "Portal Credential Encryption Key",
    description: "Random string used to encrypt/decrypt student portal passwords (32+ characters required).",
    placeholder: "generate-encryption-key",
    isRequired: true,
    isSecret: true,
    validation: (v: string) => {
      if (!v.trim()) return "Portal credential encryption key is required";
      if (v.length < 32) return "Must be at least 32 characters";
      return null;
    }
  },
  {
    key: "CRON_SECRET",
    title: "Cron Secret",
    description: "Secret for scheduled job endpoints (24+ characters recommended).",
    placeholder: "generate-a-cron-secret",
    isRequired: false,
    isSecret: true,
    validation: (v: string) => {
      if (!v.trim()) return null; // Optional
      if (v.length < 12) return "Should be at least 12 characters if provided";
      return null;
    }
  },
  {
    key: "INVOICE_BUSINESS_NAME",
    title: "Business Name",
    description: "Business name for invoices.",
    placeholder: "LessonFlow",
    isRequired: true,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return "Business name is required for invoices";
      return null;
    }
  },
  {
    key: "INVOICE_BUSINESS_ABN",
    title: "ABN",
    description: "Australian Business Number (optional).",
    placeholder: "12 345 678 901",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "INVOICE_BANK_NAME",
    title: "Bank Name",
    description: "Bank name for invoice payments.",
    placeholder: "Commonwealth Bank",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "INVOICE_BANK_BSB",
    title: "Bank BSB",
    description: "Bank BSB number for invoice payments.",
    placeholder: "123-456",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "INVOICE_BANK_ACCOUNT_NAME",
    title: "Bank Account Name",
    description: "Account name for invoice payments.",
    placeholder: "LessonFlow",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "INVOICE_BANK_ACCOUNT_NUMBER",
    title: "Bank Account Number",
    description: "Account number for invoice payments.",
    placeholder: "12345678",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "STUDENT_SESSION_MAX_AGE_SECONDS",
    title: "Student Session Max Age",
    description: "Duration of student portal sessions in seconds.",
    placeholder: "2592000",
    isRequired: false,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return null;
      const val = parseInt(v, 10);
      return isNaN(val) ? "Must be a number" : null;
    }
  },
  {
    key: "STUDENT_PORTAL_PASSWORD_LENGTH",
    title: "Student Portal Password Length",
    description: "Required length for student portal passwords.",
    placeholder: "14",
    isRequired: false,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return null;
      const val = parseInt(v, 10);
      return isNaN(val) ? "Must be a number" : null;
    }
  },
  {
    key: "INVOICE_PAYMENT_TERMS_DAYS",
    title: "Invoice Payment Terms",
    description: "Number of days for invoice payment terms.",
    placeholder: "14",
    isRequired: false,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return null;
      const val = parseInt(v, 10);
      return isNaN(val) ? "Must be a number" : null;
    }
  },
  {
    key: "INVOICE_GST_REGISTERED",
    title: "GST Registered",
    description: "Whether the business is GST registered (true/false).",
    placeholder: "false",
    isRequired: false,
    isSecret: false,
    validation: (v: string) => {
      const val = v.toLowerCase().trim();
      if (val !== "true" && val !== "false") return "Must be 'true' or 'false'";
      return null;
    }
  },
  {
    key: "INVOICE_DEFAULT_TAX_MODE",
    title: "Default Tax Mode",
    description: "Default tax mode for invoices (gst_free, gst_inclusive, or gst_exclusive).",
    placeholder: "gst_free",
    isRequired: false,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return null;
      if (!["gst_free", "gst_inclusive", "gst_exclusive"].includes(v)) return "Invalid tax mode";
      return null;
    }
  },
  {
    key: "INVOICE_CREDIT_NOTE_PREFIX",
    title: "Credit Note Prefix",
    description: "Prefix for credit note numbers.",
    placeholder: "MGSCN",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "NEXT_PUBLIC_BRAND_NAME",
    title: "Brand Name",
    description: "The public name of your music school.",
    placeholder: "LessonFlow",
    isRequired: true,
    isSecret: false,
    validation: (v: string) => (!v.trim() ? "Brand name is required" : null)
  },
  {
    key: "NEXT_PUBLIC_PRIMARY_SUBJECT",
    title: "Primary Subject",
    description: "The main instrument or subject taught (e.g. Guitar, Piano).",
    placeholder: "Guitar",
    isRequired: true,
    isSecret: false,
    validation: (v: string) => (!v.trim() ? "Primary subject is required" : null)
  },
  {
    key: "NEXT_PUBLIC_PRIMARY_LOCATION",
    title: "Primary Location",
    description: "The suburb or city where your studio is located.",
    placeholder: "Northcote",
    isRequired: true,
    isSecret: false,
    validation: (v: string) => (!v.trim() ? "Primary location is required" : null)
  },
  {
    key: "NEXT_PUBLIC_CONTACT_PHONE",
    title: "Contact Phone",
    description: "Public contact phone number.",
    placeholder: "0401 489 437",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "NEXT_PUBLIC_CONTACT_ADDRESS",
    title: "Contact Address",
    description: "Full public address of your studio.",
    placeholder: "Rear 66/68 High St, Northcote VIC 3070",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "NEXT_PUBLIC_LOGO_URL",
    title: "Logo URL",
    description: "URL to your school logo image.",
    placeholder: "/images/mgs-logo.webp",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "NEXT_PUBLIC_INVOICE_LOGO_URL",
    title: "Invoice Logo URL",
    description: "URL to the logo shown on invoices.",
    placeholder: "/images/company-logo-invoice.png",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "NEXT_PUBLIC_FAVICON_URL",
    title: "Favicon URL",
    description: "URL to your site favicon.",
    placeholder: "/favicon.ico",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "NEXT_PUBLIC_DEFAULT_CURRENCY",
    title: "Default Currency",
    description: "Default currency code (e.g. AUD, USD).",
    placeholder: "AUD",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "NEXT_PUBLIC_TIMEZONE",
    title: "Timezone",
    description: "The primary timezone for bookings and reports (e.g. Australia/Melbourne).",
    placeholder: "Australia/Melbourne",
    isRequired: false,
    isSecret: false,
    validation: () => null
  }
] as const;

export type ConfigurableEnvVar = (typeof CONFIGURABLE_ENV_VARS)[number];
export type EnvVarKey = ConfigurableEnvVar["key"];

/**
 * Schema for validating env var configuration input.
 */
export const envConfigSchema = z.object(
  CONFIGURABLE_ENV_VARS.reduce((acc, envVar) => {
    acc[envVar.key] = z.string();
    return acc;
  }, {} as Record<string, z.ZodString>)
);

export type EnvConfigInput = z.infer<typeof envConfigSchema>;

/**
 * Schema for validating individual env var updates.
 */
export const envVarUpdateSchema = z.object({
  key: z.string(),
  value: z.string()
});

export type EnvVarUpdate = z.infer<typeof envVarUpdateSchema>;

export type AdminSettingsSaveInput = Record<string, string> & {
  ADMIN_PASSWORD?: string;
};

export type AdminSettingsSaveResult =
  | {
      success: true;
      message: string;
      requiresReauth: boolean;
    }
  | {
      success: false;
      errors: Record<string, string>;
      error?: string;
    };

const DEFAULT_LOCAL_MATERIAL_ROOT = path.resolve(process.cwd(), ".data/learning-materials");

/**
 * Returns true when the value is clearly a default/example placeholder.
 */
function isLikelyPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    normalized.includes("change-me") ||
    normalized.includes("example.com") ||
    normalized.includes("test-") ||
    normalized === "owner@example.com"
  );
}

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
  const configured = process.env.LEARNING_MATERIALS_LOCAL_ROOT?.trim();
  if (!configured) {
    return DEFAULT_LOCAL_MATERIAL_ROOT;
  }
  return path.resolve(configured);
}

/**
 * Performs a writable-directory probe for local material storage.
 */
async function canWriteLocalMaterialRoot(): Promise<boolean> {
  const root = getLocalMaterialRoot();
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.access(root);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true once at least one admin account exists.
 */
export async function isSetupComplete(): Promise<boolean> {
  // Only bypass setup checks in true development mode, test mode must actually
  // run the setup workflow for end-to-end tests to pass.
  if (process.env.NODE_ENV === "development" && process.env.VITEST !== "true" && process.env.PLAYWRIGHT_TEST_BASE_URL === undefined) {
    return true;
  }
  const adminCount = await prisma.adminUser.count();
  return adminCount > 0;
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

  const storageDriver = getMaterialStorageDriverName();
  if (storageDriver === "s3") {
    checks.push({
      id: "materials-storage-driver",
      title: "Learning material storage",
      status: "fail",
      detail: "S3 storage driver is selected but not implemented in this build. Use local storage with persistent volume."
    });
  } else {
    const localStorageWritable = await canWriteLocalMaterialRoot();
    checks.push({
      id: "materials-storage-driver",
      title: "Learning material storage",
      status: localStorageWritable ? (isProduction ? "warn" : "pass") : "fail",
      detail: localStorageWritable
        ? isProduction
          ? "Local storage is writable. Ensure your hosting keeps this directory persistent and backed up."
          : "Local storage root is writable."
        : "Local storage root is not writable. Fix LEARNING_MATERIALS_LOCAL_ROOT permissions."
    });
  }

  return checks;
}

/**
 * Computes setup completion and requirement-check summary for setup UI/API usage.
 */
export async function getSetupReadiness(): Promise<SetupReadiness> {
  const [completed, checks] = await Promise.all([isSetupComplete(), evaluateSetupChecks()]);

  const failCount = checks.filter((entry) => entry.status === "fail").length;
  const warnCount = checks.filter((entry) => entry.status === "warn").length;
  const passCount = checks.filter((entry) => entry.status === "pass").length;

  return {
    completed,
    checks,
    failCount,
    warnCount,
    passCount,
    canInitialize: !completed && failCount === 0
  };
}

/**
 * Strong password policy for first admin account creation in setup wizard.
 */
function validateStrongPassword(password: string): string[] {
  const issues: string[] = [];

  if (password.length < 12) {
    issues.push("Use at least 12 characters.");
  }
  if (!/[a-z]/.test(password)) {
    issues.push("Include at least one lowercase letter.");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("Include at least one uppercase letter.");
  }
  if (!/[0-9]/.test(password)) {
    issues.push("Include at least one number.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push("Include at least one symbol.");
  }

  return issues;
}

export const setupInitializeSchema = z
  .object({
    displayName: z.string().trim().min(2, "Display name is required.").max(80, "Display name is too long."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(1, "Password is required.").max(128, "Password is too long."),
    confirmPassword: z.string().min(1, "Confirm password is required.").max(128, "Confirm password is too long.")
  })
  .superRefine((input, ctx) => {
    if (input.password !== input.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match."
      });
    }

    const passwordIssues = validateStrongPassword(input.password);
    if (passwordIssues.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: passwordIssues.join(" ")
      });
    }
  });

export type SetupInitializeInput = z.infer<typeof setupInitializeSchema>;

/**
 * Default invoice product presets seeded during initial setup so the
 * "Add from Preset" dropdown is populated on fresh deployments.
 * Admins can edit/delete/add presets later via Settings → Product Presets.
 */
const DEFAULT_INVOICE_PRESETS = [
  { id: "trial_30min", label: "30min Trial Lesson ($20)", description: "30min Trial Lesson", unitPriceCents: 2000, sortOrder: 10 },
  { id: "pack_5x30", label: "5 × 30 Minute Lessons ($200)", description: "5 × 30 Minute Lessons", unitPriceCents: 20000, sortOrder: 20 },
  { id: "pack_10x30", label: "10 × 30 Minute Lessons ($388)", description: "10 × 30 Minute Lessons", unitPriceCents: 38800, sortOrder: 30 },
  { id: "pack_5x60", label: "5 × 1 Hour Lessons ($375)", description: "5 × 1 Hour Lessons", unitPriceCents: 37500, sortOrder: 40 },
  { id: "pack_10x60", label: "10 × 1 Hour Lessons ($725)", description: "10 × 1 Hour Lessons", unitPriceCents: 72500, sortOrder: 50 },
];

/**
 * Creates the first admin account used to mark setup as complete.
 * Also seeds default invoice product presets so the invoice UI is
 * functional immediately after deployment.
 */
export async function createInitialAdmin(input: SetupInitializeInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const passwordHash = await bcrypt.hash(input.password, 12);

  const created = await prisma.$transaction(async (tx) => {
    const existingAdminCount = await tx.adminUser.count();
    if (existingAdminCount > 0) {
      return null;
    }

    const admin = await tx.adminUser.create({
      data: {
        email: normalizedEmail,
        displayName,
        passwordHash,
        isActive: true
      }
    });

    // Seed default invoice product presets so the "Add from Preset"
    // dropdown works on fresh deployments. skipDuplicates makes this
    // idempotent if presets were already created by a seed script.
    await tx.invoiceProductPreset.createMany({
      data: DEFAULT_INVOICE_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        unitPriceCents: p.unitPriceCents,
        sortOrder: p.sortOrder,
        isActive: true
      })),
      skipDuplicates: true
    });

    return admin;
  });

  return created;
}

/**
 * Returns the path to the .env file in the project root.
 */
function getEnvFilePath(): string {
  return path.resolve(process.cwd(), ".env");
}

/**
 * Writes all env vars to the .env file (preserves comments and unknown vars).
 */
async function writeEnvFile(vars: Map<string, string>, managedKeys?: Set<string>): Promise<void> {
  const envPath = getEnvFilePath();
  const lines: string[] = [];
  const keysToManage = managedKeys ?? new Set(CONFIGURABLE_ENV_VARS.map((v) => v.key));

  // Try to preserve existing file structure
  try {
    const existingContent = await fs.readFile(envPath, "utf-8");
    const existingLines = existingContent.split("\n");
    const processedKeys = new Set<string>();

    for (const line of existingLines) {
      const trimmed = line.trim();

      // Preserve comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) {
        lines.push(line);
        continue;
      }

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) {
        lines.push(line);
        continue;
      }

      const key = trimmed.substring(0, eqIndex).trim();

      // If this is a configurable var, use the new value
      if (keysToManage.has(key)) {
        const newValue = vars.get(key);
        if (newValue !== undefined) {
          lines.push(`${key}="${newValue}"`);
          processedKeys.add(key);
        }
        // If value was removed/empty, still include it (empty string)
        else {
          lines.push(`${key}=""`);
          processedKeys.add(key);
        }
      } else {
        // Preserve unknown vars as-is
        lines.push(line);
      }
    }

    // Add any new vars that weren't in the original file
    for (const [key, value] of vars) {
      if (!processedKeys.has(key)) {
        lines.push(`${key}="${value}"`);
      }
    }
  } catch {
    // File doesn't exist - create from scratch
    for (const [key, value] of vars) {
      lines.push(`${key}="${value}"`);
    }
  }

  await fs.writeFile(envPath, lines.join("\n") + "\n", "utf-8");
}

/**
 * Gets current env var values for the UI (secrets are masked).
 */
export function getCurrentEnvValues(): Record<string, string> {
  const result: Record<string, string> = {};

  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const value = process.env[envVar.key] || "";
    // Only mask if it's a secret AND it's not a placeholder
    if (envVar.isSecret && value && !isLikelyPlaceholder(value)) {
      result[envVar.key] = "***SET***";
    } else {
      result[envVar.key] = value;
    }
  }

  return result;
}

/**
 * Validates a single env var value against its definition.
 */
function validateEnvVar(key: string, value: string): string | null {
  const envVar = CONFIGURABLE_ENV_VARS.find((v) => v.key === key);
  if (!envVar) {
    return `Unknown env var: ${key}`;
  }

  if (envVar.isRequired && !value.trim()) {
    return `${envVar.title} is required`;
  }

  return envVar.validation(value);
}

/**
 * Validates all env var configuration input.
 * Returns a map of field errors.
 */
export function validateEnvConfig(input: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const value = input[envVar.key] || "";
    const error = validateEnvVar(envVar.key, value);
    if (error) {
      errors[envVar.key] = error;
    }
  }

  return errors;
}

/**
 * Saves env var configuration to the .env file.
 * This is a transactional operation - either all vars are saved or none are.
 */
export async function saveEnvConfig(input: Record<string, string>): Promise<{ success: boolean; errors?: Record<string, string> }> {
  const errors = validateEnvConfig(input);

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const vars = new Map<string, string>();

  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const value = input[envVar.key] || "";
    if (value && value !== "***SET***") {
      vars.set(envVar.key, value);
    } else {
      const existingValue = process.env[envVar.key];
      if (existingValue) {
        vars.set(envVar.key, existingValue);
      }
    }
  }

  await writeEnvFile(vars);

  return { success: true };
}

/**
 * Saves admin-editable environment config and syncs legacy admin credential env vars into the
 * authenticated admin database record so login stays aligned after env changes.
 */
export async function saveAdminSettingsConfig(
  input: AdminSettingsSaveInput,
  options: { currentAdminId: string }
): Promise<AdminSettingsSaveResult> {
  const validationInput: Record<string, string> = {};
  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const rawValue = input[envVar.key] || "";
    if (envVar.isSecret && !rawValue.trim()) {
      // In the admin settings screen, blank secret inputs mean "keep current value" when a secret
      // is already configured. Validate against the currently loaded env value so required secrets
      // don't fail validation unnecessarily.
      validationInput[envVar.key] = process.env[envVar.key] || "";
      continue;
    }
    validationInput[envVar.key] = rawValue;
  }

  const errors = validateEnvConfig(validationInput);
  const adminPassword = typeof input.ADMIN_PASSWORD === "string" ? input.ADMIN_PASSWORD : "";
  const shouldUpdateAdminPassword = adminPassword.trim().length > 0;

  if (shouldUpdateAdminPassword) {
    const passwordIssues = validateStrongPassword(adminPassword);
    if (passwordIssues.length > 0) {
      errors.ADMIN_PASSWORD = passwordIssues.join(" ");
    }
  }

  const nextAdminEmail = (input.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!nextAdminEmail) {
    errors.ADMIN_EMAIL = "Owner email is required";
  }

  const currentAdmin = await prisma.adminUser.findUnique({
    where: { id: options.currentAdminId },
    select: {
      id: true,
      email: true
    }
  });

  if (!currentAdmin) {
    return {
      success: false,
      errors: {},
      error: "Signed-in admin account was not found."
    };
  }

  if (nextAdminEmail && nextAdminEmail !== currentAdmin.email) {
    const conflicting = await prisma.adminUser.findUnique({
      where: { email: nextAdminEmail },
      select: { id: true }
    });
    if (conflicting && conflicting.id !== currentAdmin.id) {
      errors.ADMIN_EMAIL = "Another admin account already uses that email.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const vars = new Map<string, string>();
  const managedKeys = new Set<string>(CONFIGURABLE_ENV_VARS.map((v) => v.key));
  managedKeys.add("ADMIN_PASSWORD");

  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const value = input[envVar.key] || "";
    if (value && value !== "***SET***") {
      vars.set(envVar.key, value);
      // Update in-memory process.env so the current process sees the change immediately
      process.env[envVar.key] = value;
    } else {
      const existingValue = process.env[envVar.key];
      if (existingValue) {
        vars.set(envVar.key, existingValue);
      }
    }
  }

  if (shouldUpdateAdminPassword) {
    vars.set("ADMIN_PASSWORD", adminPassword);
    process.env.ADMIN_PASSWORD = adminPassword;
  } else if (process.env.ADMIN_PASSWORD) {
    vars.set("ADMIN_PASSWORD", process.env.ADMIN_PASSWORD);
  }

  await writeEnvFile(vars, managedKeys);

  const adminUpdate: {
    email?: string;
    passwordHash?: string;
  } = {};

  let requiresReauth = false;

  if (nextAdminEmail && nextAdminEmail !== currentAdmin.email) {
    adminUpdate.email = nextAdminEmail;
    requiresReauth = true;
  }
  if (shouldUpdateAdminPassword) {
    adminUpdate.passwordHash = await bcrypt.hash(adminPassword, 12);
  }

  if (Object.keys(adminUpdate).length > 0) {
    await prisma.adminUser.update({
      where: { id: currentAdmin.id },
      data: adminUpdate
    });
  }

  return {
    success: true,
    message: "Settings saved to .env. Restart the server to apply runtime changes.",
    requiresReauth
  };
}
