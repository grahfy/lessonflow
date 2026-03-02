import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFilePath), "..");

/**
 * Loads test environment variables from .env.test.local or .env.test.
 * Fallbacks are provided for required values if files are missing.
 */
function loadTestEnv() {
  const envFiles = [".env.test.local", ".env.test"];
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  for (const file of envFiles) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const match = line.match(/^\s*([^#\s][^=]*)\s*=\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
          }
          env[key] ??= value;
        }
      }
    }
  }

  // Mandatory fallbacks for CI and environments without .env.test
  env.DATABASE_URL ??= "mysql://root:root@127.0.0.1:3306/mgs_test";
  env.ADMIN_EMAIL ??= "owner@example.com";
  env.ADMIN_SESSION_SECRET ??= "test-admin-secret-at-least-32-chars-long-for-security";
  env.STUDENT_SESSION_SECRET ??= "test-student-secret-at-least-32-chars-long-for-security";
  env.STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY ??= "test-encryption-key-at-least-32-chars";
  env.CRON_SECRET ??= "test-cron-secret";
  env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
  
  // Whitelabel defaults
  env.NEXT_PUBLIC_BRAND_NAME ??= "Melbourne Guitar School";
  env.NEXT_PUBLIC_PRIMARY_SUBJECT ??= "Guitar";
  env.NEXT_PUBLIC_PRIMARY_LOCATION ??= "Northcote";
  
  env.SMTP_FROM ??= "Melbourne Guitar School <no-reply@example.com>";
  env.INVOICE_BUSINESS_NAME ??= "Melbourne Guitar School";
  env.INVOICE_BUSINESS_ABN ??= "12 345 678 901";
  env.INVOICE_BANK_NAME ??= "Test Bank";
  env.INVOICE_BANK_BSB ??= "000-000";
  env.INVOICE_BANK_ACCOUNT_NAME ??= "Melbourne Guitar School";
  env.INVOICE_BANK_ACCOUNT_NUMBER ??= "12345678";
  env.INVOICE_PAYMENT_TERMS_DAYS ??= "14";
  env.INVOICE_GST_REGISTERED ??= "true";
  env.INVOICE_DEFAULT_TAX_MODE ??= "taxable";
  env.INVOICE_CREDIT_NOTE_PREFIX ??= "MGSCN";

  return env;
}

const env = loadTestEnv();

// Inject into process.env for all tests
for (const [key, value] of Object.entries(env)) {
  process.env[key] = value;
}
