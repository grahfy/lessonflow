import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFilePath), "..");

const parseEnvFile = (filePath: string): Record<string, string> => {
  const values: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
};

for (const fileName of [".env.test.local", ".env.test", ".env.local", ".env"]) {
  const filePath = path.join(projectRoot, fileName);

  if (!fs.existsSync(filePath)) {
    continue;
  }

  const fileValues = parseEnvFile(filePath);
  for (const [key, value] of Object.entries(fileValues)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV ??= "test";
env.DATABASE_URL ??= "file:./test.db";
env.NEXT_PUBLIC_SITE_URL ??= "http://127.0.0.1:3000";
env.ADMIN_EMAIL ??= "owner@example.com";
env.ADMIN_PASSWORD ??= "change-me";
env.ADMIN_SESSION_SECRET ??= "test-session-secret";
env.STUDENT_SESSION_SECRET ??= "test-student-session-secret";
env.STUDENT_SESSION_MAX_AGE_SECONDS ??= "2592000";
env.STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY ??= "test-student-portal-encryption-key";
env.STUDENT_PORTAL_PASSWORD_LENGTH ??= "14";
env.CRON_SECRET ??= "test-cron-secret";
env.LEARNING_MATERIALS_STORAGE_DRIVER ??= "local";
env.LEARNING_MATERIALS_LOCAL_ROOT ??= ".data/learning-materials-test";
env.SMTP_HOST ??= "";
env.SMTP_PORT ??= "587";
env.SMTP_USER ??= "";
env.SMTP_PASS ??= "";
env.SMTP_FROM ??= "Melbourne Guitar School <no-reply@example.com>";
env.INVOICE_BUSINESS_NAME ??= "Melbourne Guitar School";
env.INVOICE_BUSINESS_ABN ??= "12345678901";
env.INVOICE_BANK_NAME ??= "ANZ";
env.INVOICE_BANK_BSB ??= "013001";
env.INVOICE_BANK_ACCOUNT_NAME ??= "Melbourne Guitar School";
env.INVOICE_BANK_ACCOUNT_NUMBER ??= "12345678";
env.INVOICE_PAYMENT_TERMS_DAYS ??= "14";
env.INVOICE_GST_REGISTERED ??= "true";
env.INVOICE_DEFAULT_TAX_MODE ??= "taxable";
env.INVOICE_CREDIT_NOTE_PREFIX ??= "MGSCN";
