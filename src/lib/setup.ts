import fs from "node:fs/promises";
import path from "node:path";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getOwnerEmail } from "@/lib/env";
import { getMaterialStorageDriverName } from "@/lib/student-portal/material-storage";

export type SetupCheckStatus = "pass" | "warn" | "fail";

export type SetupCheck = {
  id: string;
  title: string;
  status: SetupCheckStatus;
  detail: string;
};

export type SetupReadiness = {
  completed: boolean;
  checks: SetupCheck[];
  failCount: number;
  warnCount: number;
  passCount: number;
  canInitialize: boolean;
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
