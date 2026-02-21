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
      if (!v.match(/^(mysql|postgresql):\/\/.+/)) return "Must be a valid database URL (mysql:// or postgresql:// or file:)";
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
    placeholder: "Melbourne Guitar School <no-reply@example.com>",
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
    placeholder: "Melbourne Guitar School",
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
    placeholder: "Melbourne Guitar School",
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
  const adminCount = await prisma.adminUser.count();
  return adminCount > 0;
}

/**
 * Builds environment and dependency checks used by the first-run setup wizard.
 */
export async function evaluateSetupChecks(): Promise<SetupCheck[]> {
  const checks: SetupCheck[] = [];
  const isProduction = process.env.NODE_ENV === "production";

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
        ? "SQLite file URLs are not suitable for production hosting. Use managed Postgres."
        : "SQLite is acceptable for local/test, but production should use managed Postgres."
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

  const smtpConfigured =
    Boolean((process.env.SMTP_HOST || "").trim()) &&
    Boolean((process.env.SMTP_USER || "").trim()) &&
    Boolean((process.env.SMTP_PASS || "").trim()) &&
    Boolean((process.env.SMTP_FROM || "").trim());
  checks.push({
    id: "smtp",
    title: "SMTP delivery",
    status: smtpConfigured ? "pass" : "warn",
    detail: smtpConfigured
      ? "SMTP credentials are configured for outbound email delivery."
      : "SMTP is incomplete. Emails will be queued without delivery until SMTP is configured."
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
 * Creates the first admin account used to mark setup as complete.
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

    return tx.adminUser.create({
      data: {
        email: normalizedEmail,
        displayName,
        passwordHash,
        isActive: true
      }
    });
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
async function writeEnvFile(vars: Map<string, string>): Promise<void> {
  const envPath = getEnvFilePath();
  const lines: string[] = [];

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
      if (CONFIGURABLE_ENV_VARS.some((v) => v.key === key)) {
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
    if (envVar.isSecret && value) {
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
