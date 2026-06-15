/**
 * Configurable Environment Variable Registry & Validation
 *
 * Defines the `CONFIGURABLE_ENV_VARS` registry that drives both server-side
 * validation and client-side form generation for the Setup Wizard and admin
 * settings screen, along with the zod schemas and per-key validation helpers
 * that operate on that registry.
 */

import { z } from "zod";

/**
 * Environment variable definitions for setup configuration.
 * Each entry defines the key, display info, validation, and whether it's sensitive.
 */
type ConfigurableEnvVarInputType = "text" | "boolean" | "select";

type ConfigurableEnvVarOption = {
  label: string;
  value: string;
};

type ConfigurableEnvVarDefinition = {
  key: string;
  title: string;
  description: string;
  placeholder: string;
  isRequired: boolean;
  isSecret: boolean;
  inputType?: ConfigurableEnvVarInputType;
  options?: ConfigurableEnvVarOption[];
  validation: (value: string) => string | null;
};

export const CONFIGURABLE_ENV_VARS: ConfigurableEnvVarDefinition[] = [
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
    key: "ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER",
    title: "Customer Email Alert Inbox Provider",
    description: "Which inbox provider should power owner login customer email alerts. Auto prefers Gmail, then falls back to IMAP.",
    placeholder: "auto",
    isRequired: false,
    isSecret: false,
    inputType: "select",
    options: [
      { label: "Auto", value: "auto" },
      { label: "Gmail API", value: "gmail" },
      { label: "IMAP", value: "imap" }
    ],
    validation: (v: string) => {
      const normalized = v.trim().toLowerCase();
      if (!normalized) return null;
      return ["auto", "gmail", "imap"].includes(normalized) ? null : "Must be auto, gmail, or imap";
    }
  },
  {
    key: "ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED",
    title: "Owner Customer Email Alerts",
    description: "When enabled, owners check the configured inbox provider for unread emails from known customers on admin login and see a header alert.",
    placeholder: "false",
    isRequired: false,
    isSecret: false,
    inputType: "boolean",
    validation: (v: string) => {
      const normalized = v.trim().toLowerCase();
      if (!normalized) return null;
      return normalized === "true" || normalized === "false" ? null : "Must be true or false";
    }
  },
  {
    key: "IMAP_HOST",
    title: "IMAP Host",
    description: "Inbox server hostname for standard mail accounts used for unread customer email alerts.",
    placeholder: "imap.example.com",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "IMAP_PORT",
    title: "IMAP Port",
    description: "Inbox server port for IMAP access.",
    placeholder: "993",
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
    key: "IMAP_USER",
    title: "IMAP Username",
    description: "Username for IMAP authentication.",
    placeholder: "owner@example.com",
    isRequired: false,
    isSecret: false,
    validation: () => null
  },
  {
    key: "IMAP_PASS",
    title: "IMAP Password",
    description: "Password or app password for IMAP authentication.",
    placeholder: "your-imap-password",
    isRequired: false,
    isSecret: true,
    validation: () => null
  },
  {
    key: "IMAP_TLS",
    title: "IMAP TLS",
    description: "Whether to use TLS for IMAP connections.",
    placeholder: "true",
    isRequired: false,
    isSecret: false,
    inputType: "boolean",
    validation: (v: string) => {
      const normalized = v.trim().toLowerCase();
      if (!normalized) return null;
      return normalized === "true" || normalized === "false" ? null : "Must be true or false";
    }
  },
  {
    key: "IMAP_MAILBOX",
    title: "IMAP Mailbox",
    description: "Mailbox folder to check for unread customer emails.",
    placeholder: "INBOX",
    isRequired: false,
    isSecret: false,
    validation: () => null
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
    description: "Default tax mode for invoices (taxable or gst_free).",
    placeholder: "taxable",
    isRequired: false,
    isSecret: false,
    validation: (v: string) => {
      if (!v.trim()) return null;
      if (!["taxable", "gst_free"].includes(v)) return "Invalid tax mode";
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
    placeholder: "/icon.png",
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
    validation: (v: string) => {
      if (!v.trim()) return null;
      return /^[A-Za-z]{3}$/.test(v.trim()) ? null : "Must be a 3-letter currency code";
    }
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

export function normalizeManagedEnvValue(key: string, value: string): string {
  if (key === "NEXT_PUBLIC_DEFAULT_CURRENCY") {
    return value.trim().toUpperCase();
  }

  return value;
}

/**
 * Schema for validating individual env var updates.
 */
export const envVarUpdateSchema = z.object({
  key: z.string(),
  value: z.string()
});

export type EnvVarUpdate = z.infer<typeof envVarUpdateSchema>;

/**
 * Returns true when the value is clearly a default/example placeholder.
 */
export function isLikelyPlaceholder(value: string): boolean {
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
 * Validates a single env var value against its definition.
 */
export function validateEnvVar(key: string, value: string): string | null {
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
