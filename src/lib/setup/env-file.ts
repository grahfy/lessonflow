/**
 * Runtime Env File Persistence & First Admin Creation
 *
 * Resolves the writable runtime `.env` path (shared deploy dir in production,
 * project root locally), reads/writes managed env keys while preserving the
 * existing file structure, and exposes the admin-facing save flows plus the
 * first-admin bootstrap used to mark setup complete.
 */

import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import bcrypt from "bcryptjs";
import { parse as parseDotenv } from "dotenv";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { DEFAULT_GEOBLOCKING_SETTINGS_ID } from "@/lib/geoblocking-settings";
import { geoblockingSettingsInputSchema } from "@/lib/geoblocking-settings-contract";
import { resolveRuntimeAppRoot } from "@/lib/runtime-paths";

import {
  CONFIGURABLE_ENV_VARS,
  isLikelyPlaceholder,
  normalizeManagedEnvValue,
  validateEnvConfig,
  type ConfigurableEnvVar,
} from "./env-var-registry";
import { DEFAULT_INVOICE_PRESETS, DEFAULT_LESSON_PLAN_TEMPLATES } from "./seed-data";

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
    confirmPassword: z.string().min(1, "Confirm password is required.").max(128, "Confirm password is too long."),
    allowedCountries: geoblockingSettingsInputSchema.shape.allowedCountries,
    unknownCountryMode: geoblockingSettingsInputSchema.shape.unknownCountryMode
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
 * Also seeds default invoice product presets and example lesson-plan
 * templates so the admin UI is functional immediately after deployment.
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
        role: "owner",
        firstName: displayName,
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

    await tx.geoblockingSettings.upsert({
      where: { id: DEFAULT_GEOBLOCKING_SETTINGS_ID },
      update: {
        allowedCountries: input.allowedCountries,
        unknownCountryMode: input.unknownCountryMode
      },
      create: {
        id: DEFAULT_GEOBLOCKING_SETTINGS_ID,
        allowedCountries: input.allowedCountries,
        unknownCountryMode: input.unknownCountryMode
      }
    });

    // Seed default invoice template so PDF generation works immediately.
    const existingInvoiceTemplate = await tx.invoiceTemplate.findFirst({ where: { isDefault: true } });
    if (!existingInvoiceTemplate) {
      await tx.invoiceTemplate.create({
        data: {
          isDefault: true,
          logoUrl: "/images/company-logo-invoice.png",
          accentColor: "#2247d8",
          footerText: "Thank you for your business. Payment is due within 14 days.",
          headerInfo: ""
        }
      });
    }

    // Seed default email templates so notification workflows work
    // out of the box. Admins can customise these via Settings.
    const emailTemplateDefaults = [
      {
        key: "customer_booking_reminder",
        subject: "Lesson Reminder: {{lessonTime}}",
        body: `<p>Hi {{customerName}},</p><p>This is a reminder for your upcoming lesson at {{lessonTime}}.</p><p>We look forward to seeing you then!</p>`
      },
      {
        key: "customer_booking_status",
        subject: "Booking Status Update: {{status}}",
        body: `<p>Hi {{customerName}},</p><p>Your booking for {{lessonTime}} has been updated to: <strong>{{status}}</strong>.</p>`
      },
      {
        key: "customer_invoice",
        subject: "Invoice {{invoiceNumber}} from {{brandName}}",
        body: `<p>Hi {{customerName}},</p><p>Please find your invoice {{invoiceNumber}} attached for the amount of {{totalAmount}}.</p><p>Due date: {{dueDate}}</p>`
      }
    ];
    for (const t of emailTemplateDefaults) {
      await tx.emailTemplate.upsert({
        where: { templateKey: t.key },
        update: {},
        create: {
          templateKey: t.key,
          subject: t.subject,
          htmlBody: t.body
        }
      });
    }

    // Seed example lesson-plan templates so the template library is
    // ready to use immediately. skipDuplicates makes this idempotent.
    await tx.lessonPlanTemplate.createMany({
      data: DEFAULT_LESSON_PLAN_TEMPLATES.map((t) => ({
        title: t.title,
        description: t.description,
        category: t.category,
        instrument: t.instrument ?? null,
        skillLevel: t.skillLevel ?? null,
        tags: t.tags ?? null,
        sections: JSON.parse(JSON.stringify(t.sections)),
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        createdById: admin.id,
        updatedById: admin.id
      })),
      skipDuplicates: true
    });

    return admin;
  });

  return created;
}

function inferSharedEnvPathFromReleaseRoot(root: string): string | null {
  const normalizedRoot = path.resolve(root);
  const rootPrefix = path.parse(normalizedRoot).root;
  const relativeSegments = normalizedRoot
    .slice(rootPrefix.length)
    .split(path.sep)
    .filter(Boolean);
  const releasesIndex = relativeSegments.lastIndexOf("releases");

  if (releasesIndex === -1 || releasesIndex + 1 >= relativeSegments.length) {
    return null;
  }

  const deployRoot = path.join(rootPrefix, ...relativeSegments.slice(0, releasesIndex));
  return path.join(deployRoot, "shared", ".env");
}

/**
 * Returns the writable runtime env path.
 *
 * RATIONALE: Production deployments persist runtime config in the shared deploy directory rather
 * than in an immutable release folder. Local and test environments still fall back to the
 * project-root `.env`.
 */
function getEnvFilePath(options?: { cwd?: string; sharedDir?: string }): string {
  const sharedDir = options?.sharedDir?.trim() || process.env.SHARED_DIR?.trim();
  if (sharedDir) {
    return path.resolve(sharedDir, ".env");
  }

  const root = resolveRuntimeAppRoot(options?.cwd || process.cwd());
  const sharedEnvPath = inferSharedEnvPathFromReleaseRoot(root);

  if (sharedEnvPath) {
    return sharedEnvPath;
  }

  return path.resolve(root, ".env");
}

/**
 * Reads the managed env keys from the active runtime first, with the persisted .env file as a
 * fallback for values that have not been loaded into the current process.
 */
function getStoredEnvValues(): Record<string, string> {
  let fileValues: Record<string, string> = {};

  try {
    fileValues = parseDotenv(fsSync.readFileSync(getEnvFilePath(), "utf-8"));
  } catch {
    fileValues = {};
  }

  const values: Record<string, string> = {};
  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const fileValue = fileValues[envVar.key];
    values[envVar.key] = process.env[envVar.key] || (typeof fileValue === "string" ? fileValue : "");
  }

  return values;
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
  const currentValues = getStoredEnvValues();

  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const value = currentValues[envVar.key] || "";
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
 * Resolves the persisted value for a managed env var from raw submitted input:
 * the new value when one was submitted, the currently-stored secret when the
 * input was blank/unchanged ("***SET***"), or "" to clear it.
 */
function resolveManagedEnvValue(
  envVar: ConfigurableEnvVar,
  rawValue: string,
  currentValues: Record<string, string>
): string {
  if (rawValue && rawValue !== "***SET***") {
    return rawValue;
  }
  if (envVar.isSecret && currentValues[envVar.key]) {
    return currentValues[envVar.key];
  }
  return "";
}

/**
 * Saves env var configuration to the .env file.
 * This is a transactional operation - either all vars are saved or none are.
 */
export async function saveEnvConfig(input: Record<string, string>): Promise<{ success: boolean; errors?: Record<string, string> }> {
  const errors = validateEnvConfig(input);
  const currentValues = getStoredEnvValues();

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const vars = new Map<string, string>();

  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const value = resolveManagedEnvValue(envVar, input[envVar.key] || "", currentValues);
    vars.set(envVar.key, value);
    if (value) {
      process.env[envVar.key] = value;
    } else {
      delete process.env[envVar.key];
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
  const normalizedInput: Record<string, string | undefined> = { ...input };
  const validationInput: Record<string, string> = {};
  const currentValues = getStoredEnvValues();
  for (const envVar of CONFIGURABLE_ENV_VARS) {
    const rawValue = normalizeManagedEnvValue(envVar.key, normalizedInput[envVar.key] || "");
    if (envVar.isSecret && !rawValue.trim()) {
      // In the admin settings screen, blank secret inputs mean "keep current value" when a secret
      // is already configured. Validate against the currently loaded env value so required secrets
      // don't fail validation unnecessarily.
      validationInput[envVar.key] = currentValues[envVar.key] || "";
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
    const rawValue = normalizeManagedEnvValue(envVar.key, normalizedInput[envVar.key] || "");
    const value = resolveManagedEnvValue(envVar, rawValue, currentValues);
    vars.set(envVar.key, value);
    if (value) {
      // Update in-memory process.env so the current process sees the change immediately
      process.env[envVar.key] = value;
    } else {
      delete process.env[envVar.key];
    }
  }

  // RATIONALE: Admin passwords are stored only as database hashes. Saving settings
  // must scrub any legacy plaintext env copy rather than preserve it in .env.
  vars.set("ADMIN_PASSWORD", "");
  delete process.env.ADMIN_PASSWORD;

  await writeEnvFile(vars, managedKeys);

  const adminUpdate: {
    email?: string;
    passwordHash?: string;
    sessionInvalidBefore?: Date;
  } = {};

  let requiresReauth = false;

  if (nextAdminEmail && nextAdminEmail !== currentAdmin.email) {
    adminUpdate.email = nextAdminEmail;
    requiresReauth = true;
  }
  if (shouldUpdateAdminPassword) {
    adminUpdate.passwordHash = await bcrypt.hash(adminPassword, 12);
    adminUpdate.sessionInvalidBefore = new Date();
    requiresReauth = true;
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
