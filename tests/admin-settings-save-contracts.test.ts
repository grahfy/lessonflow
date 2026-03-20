import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getInvoiceTemplate, POST as saveInvoiceTemplate } from "@/app/api/admin/invoice-template/route";
import { GET as getPresets, POST as createPreset } from "@/app/api/admin/presets/route";
import { DELETE as deletePreset, PATCH as updatePreset } from "@/app/api/admin/presets/[id]/route";
import { GET as getSettings, POST as saveSettings } from "@/app/api/admin/settings/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { CONFIGURABLE_ENV_VARS } from "@/lib/setup";

const envFilePath = path.resolve(process.cwd(), ".env");
const managedEnvKeys = [...CONFIGURABLE_ENV_VARS.map((envVar) => envVar.key), "ADMIN_PASSWORD", "SYSTEMD_SERVICE_NAME"];

let originalEnvFileContents: string | null = null;
let originalEnvValues: Record<string, string | undefined> = {};

function adminRequest(url: string, token: string, init?: { method?: string; body?: Record<string, unknown> }) {
  return new NextRequest(url, {
    method: init?.method || "GET",
    body: init?.body ? JSON.stringify(init.body) : undefined,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe.sequential("admin settings save contracts", () => {
  beforeEach(async () => {
    await prisma.invoiceTemplate.deleteMany();
    await prisma.invoiceProductPreset.deleteMany();

    originalEnvValues = Object.fromEntries(
      managedEnvKeys.map((key) => [key, process.env[key]])
    );

    try {
      originalEnvFileContents = await fs.readFile(envFilePath, "utf-8");
    } catch {
      originalEnvFileContents = null;
    }
  });

  afterEach(async () => {
    if (originalEnvFileContents === null) {
      await fs.rm(envFilePath, { force: true });
    } else {
      await fs.writeFile(envFilePath, originalEnvFileContents, "utf-8");
    }

    for (const key of managedEnvKeys) {
      const originalValue = originalEnvValues[key];
      if (typeof originalValue === "string") {
        process.env[key] = originalValue;
      } else {
        delete process.env[key];
      }
    }

    vi.unstubAllEnvs();
  });

  it("persists env-backed settings and returns updated values", async () => {
    vi.stubEnv("SYSTEMD_SERVICE_NAME", "invalid service name!");

    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const initialResponse = await getSettings(adminRequest("http://localhost/api/admin/settings", token));
    expect(initialResponse.status).toBe(200);

    const initialBody = (await initialResponse.json()) as {
      envVars: Array<{ key: string; currentValue: string }>;
    };

    const envPayload = Object.fromEntries(
      initialBody.envVars.map((envVar) => [
        envVar.key,
        envVar.currentValue === "***SET***" ? "" : envVar.currentValue
      ])
    );

    envPayload.NEXT_PUBLIC_BRAND_NAME = "Settings Save Test Brand";
    envPayload.INVOICE_BUSINESS_NAME = "Settings Save Test Business";
    envPayload.NEXT_PUBLIC_CONTACT_PHONE = "0412 000 111";
    envPayload.ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER = "imap";
    envPayload.ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED = "false";
    envPayload.IMAP_HOST = "imap.example.com";
    envPayload.IMAP_USER = "owner@example.com";

    const response = await saveSettings(
      adminRequest("http://localhost/api/admin/settings", token, {
        method: "POST",
        body: {
          env: envPayload,
          adminPassword: ""
        }
      })
    );

    expect(response.status).toBe(200);
    const saveBody = (await response.json()) as { ok: boolean; requiresReauth?: boolean };
    expect(saveBody.ok).toBe(true);
    expect(saveBody.requiresReauth).toBe(false);

    const loadResponse = await getSettings(adminRequest("http://localhost/api/admin/settings", token));
    expect(loadResponse.status).toBe(200);

    const loadBody = (await loadResponse.json()) as {
      envVars: Array<{ key: string; currentValue: string }>;
    };
    const valuesByKey = Object.fromEntries(loadBody.envVars.map((item) => [item.key, item.currentValue]));

    expect(valuesByKey.NEXT_PUBLIC_BRAND_NAME).toBe("Settings Save Test Brand");
    expect(valuesByKey.INVOICE_BUSINESS_NAME).toBe("Settings Save Test Business");
    expect(valuesByKey.NEXT_PUBLIC_CONTACT_PHONE).toBe("0412 000 111");
    expect(valuesByKey.ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER).toBe("gmail");
    expect(valuesByKey.ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED).toBe("true");
    expect(valuesByKey.IMAP_HOST).toBe("imap.example.com");
    expect(valuesByKey.IMAP_USER).toBe("owner@example.com");

    const envFileContents = await fs.readFile(envFilePath, "utf-8");
    expect(envFileContents).toContain('NEXT_PUBLIC_BRAND_NAME="Settings Save Test Brand"');
    expect(envFileContents).toContain('INVOICE_BUSINESS_NAME="Settings Save Test Business"');
    expect(envFileContents).toContain('NEXT_PUBLIC_CONTACT_PHONE="0412 000 111"');
    expect(envFileContents).toContain('ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER="gmail"');
    expect(envFileContents).toContain('ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED="true"');
    expect(envFileContents).toContain('IMAP_HOST="imap.example.com"');
    expect(envFileContents).toContain('IMAP_USER="owner@example.com"');
  });

  it("clears optional env-backed settings instead of restoring the previous value", async () => {
    vi.stubEnv("SYSTEMD_SERVICE_NAME", "invalid service name!");

    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const initialResponse = await getSettings(adminRequest("http://localhost/api/admin/settings", token));
    expect(initialResponse.status).toBe(200);

    const initialBody = (await initialResponse.json()) as {
      envVars: Array<{ key: string; currentValue: string }>;
    };

    const envPayload = Object.fromEntries(
      initialBody.envVars.map((envVar) => [
        envVar.key,
        envVar.currentValue === "***SET***" ? "" : envVar.currentValue
      ])
    );

    envPayload.NEXT_PUBLIC_LOGO_URL = "https://example.com/settings-save-logo.png";

    const seedResponse = await saveSettings(
      adminRequest("http://localhost/api/admin/settings", token, {
        method: "POST",
        body: {
          env: envPayload,
          adminPassword: ""
        }
      })
    );

    expect(seedResponse.status).toBe(200);

    const clearedPayload = {
      ...envPayload,
      NEXT_PUBLIC_LOGO_URL: ""
    };

    const clearResponse = await saveSettings(
      adminRequest("http://localhost/api/admin/settings", token, {
        method: "POST",
        body: {
          env: clearedPayload,
          adminPassword: ""
        }
      })
    );

    expect(clearResponse.status).toBe(200);

    const loadResponse = await getSettings(adminRequest("http://localhost/api/admin/settings", token));
    const loadBody = (await loadResponse.json()) as {
      envVars: Array<{ key: string; currentValue: string }>;
    };

    const valuesByKey = Object.fromEntries(loadBody.envVars.map((item) => [item.key, item.currentValue]));
    expect(valuesByKey.NEXT_PUBLIC_LOGO_URL).toBe("");

    const envFileContents = await fs.readFile(envFilePath, "utf-8");
    expect(envFileContents).toContain('NEXT_PUBLIC_LOGO_URL=""');
  });

  it("saves and reloads the default currency setting and rejects malformed values", async () => {
    vi.stubEnv("SYSTEMD_SERVICE_NAME", "invalid service name!");

    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const initialResponse = await getSettings(adminRequest("http://localhost/api/admin/settings", token));
    expect(initialResponse.status).toBe(200);

    const initialBody = (await initialResponse.json()) as {
      envVars: Array<{ key: string; currentValue: string }>;
    };

    const envPayload = Object.fromEntries(
      initialBody.envVars.map((envVar) => [
        envVar.key,
        envVar.currentValue === "***SET***" ? "" : envVar.currentValue
      ])
    );

    envPayload.NEXT_PUBLIC_DEFAULT_CURRENCY = "usd";

    const saveResponse = await saveSettings(
      adminRequest("http://localhost/api/admin/settings", token, {
        method: "POST",
        body: {
          env: envPayload,
          adminPassword: ""
        }
      })
    );

    expect(saveResponse.status).toBe(200);

    const loadResponse = await getSettings(adminRequest("http://localhost/api/admin/settings", token));
    expect(loadResponse.status).toBe(200);

    const loadBody = (await loadResponse.json()) as {
      envVars: Array<{ key: string; currentValue: string }>;
    };
    const valuesByKey = Object.fromEntries(loadBody.envVars.map((item) => [item.key, item.currentValue]));

    expect(valuesByKey.NEXT_PUBLIC_DEFAULT_CURRENCY).toBe("USD");
    expect(process.env.NEXT_PUBLIC_DEFAULT_CURRENCY).toBe("USD");

    const invalidResponse = await saveSettings(
      adminRequest("http://localhost/api/admin/settings", token, {
        method: "POST",
        body: {
          env: {
            ...envPayload,
            NEXT_PUBLIC_DEFAULT_CURRENCY: "USDX"
          },
          adminPassword: ""
        }
      })
    );

    expect(invalidResponse.status).toBe(400);
    const invalidBody = (await invalidResponse.json()) as {
      ok: boolean;
      fieldErrors?: Record<string, string>;
    };
    expect(invalidBody.ok).toBe(false);
    expect(invalidBody.fieldErrors?.NEXT_PUBLIC_DEFAULT_CURRENCY).toBe("Must be a 3-letter currency code");
  });

  it("saves and reloads the default invoice template", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const saveResponse = await saveInvoiceTemplate(
      adminRequest("http://localhost/api/admin/invoice-template", token, {
        method: "POST",
        body: {
          logoUrl: "/images/test-invoice-logo.webp",
          accentColor: "#123456",
          headerInfo: "Line 1\nLine 2",
          footerText: "Pay within 7 days."
        }
      })
    );

    expect(saveResponse.status).toBe(200);

    const loadResponse = await getInvoiceTemplate(adminRequest("http://localhost/api/admin/invoice-template", token));
    expect(loadResponse.status).toBe(200);

    const loadBody = (await loadResponse.json()) as {
      template: {
        logoUrl: string | null;
        accentColor: string | null;
        headerInfo: string | null;
        footerText: string | null;
      } | null;
    };

    expect(loadBody.template).toMatchObject({
      logoUrl: "/images/test-invoice-logo.webp",
      accentColor: "#123456",
      headerInfo: "Line 1\nLine 2",
      footerText: "Pay within 7 days."
    });
  });

  it("creates, updates, lists, and soft-deletes presets", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const createResponse = await createPreset(
      adminRequest("http://localhost/api/admin/presets", token, {
        method: "POST",
        body: {
          label: "No Description Preset",
          description: "",
          unitPriceCents: 4500,
          discountKind: "percent",
          discountValue: 1000
        }
      })
    );

    expect(createResponse.status).toBe(200);
    const createBody = (await createResponse.json()) as {
      preset: {
        id: string;
        label: string;
        description: string;
        unitPriceCents: number;
        discountKind: string | null;
        discountValue: number | null;
      };
    };

    expect(createBody.preset.description).toBe("");
    expect(createBody.preset.discountKind).toBe("percent");
    expect(createBody.preset.discountValue).toBe(1000);

    const patchResponse = await updatePreset(
      adminRequest(`http://localhost/api/admin/presets/${createBody.preset.id}`, token, {
        method: "PATCH",
        body: {
          label: "Updated Preset",
          description: "Updated description",
          unitPriceCents: 5200,
          discountKind: "amount",
          discountValue: 700,
          sortOrder: 3,
          isActive: true
        }
      }),
      { params: Promise.resolve({ id: createBody.preset.id }) }
    );

    expect(patchResponse.status).toBe(200);

    const listResponse = await getPresets(adminRequest("http://localhost/api/admin/presets", token));
    expect(listResponse.status).toBe(200);

    const listBody = (await listResponse.json()) as {
      presets: Array<{ id: string; label: string; description: string; unitPriceCents: number; discountKind: string | null; discountValue: number | null }>;
    };

    expect(listBody.presets).toEqual([
      expect.objectContaining({
        id: createBody.preset.id,
        label: "Updated Preset",
        description: "Updated description",
        unitPriceCents: 5200,
        discountKind: "amount",
        discountValue: 700
      })
    ]);

    const deleteResponse = await deletePreset(
      adminRequest(`http://localhost/api/admin/presets/${createBody.preset.id}`, token, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: createBody.preset.id }) }
    );

    expect(deleteResponse.status).toBe(200);

    const afterDeleteResponse = await getPresets(adminRequest("http://localhost/api/admin/presets", token));
    const afterDeleteBody = (await afterDeleteResponse.json()) as {
      presets: Array<{ id: string }>;
    };
    expect(afterDeleteBody.presets).toEqual([]);

    const dbRecord = await prisma.invoiceProductPreset.findUnique({
      where: { id: createBody.preset.id }
    });
    expect(dbRecord?.isActive).toBe(false);
  });
});
