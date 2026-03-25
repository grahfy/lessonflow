import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as adminLogin } from "@/app/api/admin/login/route";
import { POST as configureSetupEnv } from "@/app/api/setup/configure/route";
import { GET as getSetupEnv } from "@/app/api/setup/env/route";
import { POST as initializeSetup } from "@/app/api/setup/initialize/route";
import { GET as getSetupStatus } from "@/app/api/setup/status/route";
import { getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

type MutableEnv = Record<string, string | undefined>;

const env = process.env as MutableEnv;
const originalAdminEmail = env.ADMIN_EMAIL;
const originalStorageDriver = env.LEARNING_MATERIALS_STORAGE_DRIVER;
const originalNodeEnv = env.NODE_ENV;
const originalSetupAccessToken = env.SETUP_ACCESS_TOKEN;

/**
 * Clears mutable business data for isolated setup tests.
 */
async function clearData() {
  await prisma.geoblockingSettings.deleteMany();
  await prisma.invoiceAuditLog.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customerPortalCredentialAuditLog.deleteMany();
  await prisma.customerPortalCredential.deleteMany();
  await prisma.learningMaterial.deleteMany();
  await prisma.bookingAuditLog.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.bookingSeries.deleteMany();
  await prisma.bookingRequest.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.adminUser.deleteMany();
}

function buildSetupInitializePayload(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Owner",
    email: "owner@melbourneguitar.school",
    password: "StrongPass!234",
    confirmPassword: "StrongPass!234",
    allowedCountries: ["AU", "NZ"],
    unknownCountryMode: "allow",
    ...overrides
  };
}

describe("setup-wizard", () => {
  beforeEach(async () => {
    await clearData();
    env.ADMIN_EMAIL = "owner@melbourneguitar.school";
    env.LEARNING_MATERIALS_STORAGE_DRIVER = "local";
    env.SETUP_ACCESS_TOKEN = undefined;
  });

  afterEach(() => {
    env.ADMIN_EMAIL = originalAdminEmail;
    env.LEARNING_MATERIALS_STORAGE_DRIVER = originalStorageDriver;
    env.NODE_ENV = originalNodeEnv;
    env.SETUP_ACCESS_TOKEN = originalSetupAccessToken;
  });

  it("reports setup as incomplete before first admin is created", async () => {
    const response = await getSetupStatus(new Request("http://localhost/api/setup/status"));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      readiness: {
        completed: boolean;
        checks: Array<{ id: string }>;
      };
    };

    expect(body.readiness.completed).toBe(false);
    expect(body.readiness.checks.some((entry) => entry.id === "database-connectivity")).toBe(true);
  });

  it("keeps setup available in development until the first admin exists", async () => {
    env.NODE_ENV = "development";

    const statusResponse = await getSetupStatus(new Request("http://localhost/api/setup/status"));
    expect(statusResponse.status).toBe(200);
    const statusBody = (await statusResponse.json()) as {
      readiness: {
        completed: boolean;
      };
    };
    expect(statusBody.readiness.completed).toBe(false);

    const loginResponse = await adminLogin(
      new NextRequest("http://localhost/api/admin/login", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "owner@melbourneguitar.school",
          password: "StrongPass!234"
        })
      })
    );
    expect(loginResponse.status).toBe(409);
    const loginBody = (await loginResponse.json()) as { code?: string };
    expect(loginBody.code).toBe("SETUP_REQUIRED");
  });

  it("allows setup env endpoints before setup completes and blocks them after initialization", async () => {
    const preEnvResponse = await getSetupEnv(new Request("http://localhost/api/setup/env"));
    expect(preEnvResponse.status).toBe(200);
    const preEnvBody = (await preEnvResponse.json()) as { ok?: boolean; envVars?: Array<{ key: string }> };
    expect(preEnvBody.ok).toBe(true);
    expect(preEnvBody.envVars?.some((envVar) => envVar.key === "DATABASE_URL")).toBe(true);

    const preConfigureResponse = await configureSetupEnv(
      new Request("http://localhost/api/setup/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      })
    );
    expect(preConfigureResponse.status).toBe(400);

    const initializeRequest = new NextRequest("http://localhost/api/setup/initialize", {
      method: "POST",
      body: JSON.stringify(buildSetupInitializePayload()),
      headers: {
        "content-type": "application/json"
      }
    });
    const initializeResponse = await initializeSetup(initializeRequest);
    expect(initializeResponse.status).toBe(201);

    const postEnvResponse = await getSetupEnv(new Request("http://localhost/api/setup/env"));
    expect(postEnvResponse.status).toBe(409);
    const postEnvBody = (await postEnvResponse.json()) as { code?: string };
    expect(postEnvBody.code).toBe("SETUP_COMPLETE");

    const postConfigureResponse = await configureSetupEnv(
      new Request("http://localhost/api/setup/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ ADMIN_EMAIL: "attacker@example.com" })
      })
    );
    expect(postConfigureResponse.status).toBe(409);
    const postConfigureBody = (await postConfigureResponse.json()) as { code?: string };
    expect(postConfigureBody.code).toBe("SETUP_COMPLETE");
  });

  it("returns 400 for invalid setup configure JSON payloads", async () => {
    const response = await configureSetupEnv(
      new Request("http://localhost/api/setup/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: "{invalid-json"
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Invalid configuration payload.");
  });

  it("round-trips the persisted inbox alert settings through the setup env APIs", async () => {
    const initialEnvResponse = await getSetupEnv(new Request("http://localhost/api/setup/env"));
    expect(initialEnvResponse.status).toBe(200);
    const initialEnvBody = (await initialEnvResponse.json()) as {
      envVars: Array<{ key: string; currentValue: string }>;
    };

    const envPayload = Object.fromEntries(
      initialEnvBody.envVars.map((envVar) => [envVar.key, envVar.currentValue === "***SET***" ? "" : envVar.currentValue])
    );
    envPayload.ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER = "imap";
    envPayload.ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED = "false";
    envPayload.IMAP_HOST = "imap.example.com";
    envPayload.IMAP_USER = "setup-owner@example.com";

    const configureResponse = await configureSetupEnv(
      new Request("http://localhost/api/setup/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(envPayload)
      })
    );
    expect(configureResponse.status).toBe(200);

    const refreshedEnvResponse = await getSetupEnv(new Request("http://localhost/api/setup/env"));
    expect(refreshedEnvResponse.status).toBe(200);
    const refreshedEnvBody = (await refreshedEnvResponse.json()) as {
      envVars: Array<{ key: string; currentValue: string }>;
    };
    const valuesByKey = Object.fromEntries(refreshedEnvBody.envVars.map((envVar) => [envVar.key, envVar.currentValue]));

    expect(valuesByKey.ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER).toBe("imap");
    expect(valuesByKey.ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED).toBe("false");
    expect(valuesByKey.IMAP_HOST).toBe("imap.example.com");
    expect(valuesByKey.IMAP_USER).toBe("setup-owner@example.com");
  });

  it("blocks setup access from public addresses in production before initialization", async () => {
    env.NODE_ENV = "production";

    const statusResponse = await getSetupStatus(
      new Request("https://lessonflow.example.com/api/setup/status", {
        headers: {
          "x-real-ip": "203.0.113.10"
        }
      })
    );
    expect(statusResponse.status).toBe(403);

    const envResponse = await getSetupEnv(
      new Request("https://lessonflow.example.com/api/setup/env", {
        headers: {
          "x-real-ip": "203.0.113.10"
        }
      })
    );
    expect(envResponse.status).toBe(403);

    const configureResponse = await configureSetupEnv(
      new Request("https://lessonflow.example.com/api/setup/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.10"
        },
        body: JSON.stringify({})
      })
    );
    expect(configureResponse.status).toBe(403);

    const initializeResponse = await initializeSetup(
      new Request("https://lessonflow.example.com/api/setup/initialize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.10"
        },
        body: JSON.stringify(buildSetupInitializePayload())
      })
    );
    expect(initializeResponse.status).toBe(403);
  });

  it("ignores spoofed private proxy headers when the production host is public", async () => {
    env.NODE_ENV = "production";

    const response = await getSetupStatus(
      new Request("https://lessonflow.example.com/api/setup/status", {
        headers: {
          "x-real-ip": "127.0.0.1",
          "x-forwarded-for": "10.0.0.5"
        }
      })
    );

    expect(response.status).toBe(403);
  });

  it("blocks localhost setup access in production when the bootstrap token is missing", async () => {
    env.NODE_ENV = "production";

    const response = await getSetupStatus(
      new Request("http://127.0.0.1/api/setup/status")
    );

    expect(response.status).toBe(403);
  });

  it("allows production setup access when the bootstrap token is provided", async () => {
    env.NODE_ENV = "production";
    env.SETUP_ACCESS_TOKEN = "bootstrap-secret";

    const statusResponse = await getSetupStatus(
      new Request("https://lessonflow.example.com/api/setup/status", {
        headers: {
          "x-setup-access-token": "bootstrap-secret"
        }
      })
    );
    expect(statusResponse.status).toBe(200);

    const envResponse = await getSetupEnv(
      new Request("https://lessonflow.example.com/api/setup/env", {
        headers: {
          "x-setup-access-token": "bootstrap-secret"
        }
      })
    );
    expect(envResponse.status).toBe(200);
  });

  it("blocks admin login before setup is initialized", async () => {
    const request = new NextRequest("http://localhost/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@melbourneguitar.school",
        password: "StrongPass!234"
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    const response = await adminLogin(request);
    expect(response.status).toBe(409);

    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("SETUP_REQUIRED");
  });

  it("creates first admin during setup and sets an admin session cookie", async () => {
    const request = new NextRequest("http://localhost/api/setup/initialize", {
      method: "POST",
      body: JSON.stringify(buildSetupInitializePayload()),
      headers: {
        "content-type": "application/json"
      }
    });

    const response = await initializeSetup(request);
    expect(response.status).toBe(201);

    const body = (await response.json()) as { ok: boolean; nextPath: string };
    expect(body.ok).toBe(true);
    expect(body.nextPath).toBe("/admin/bookings");

    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie.includes(getSessionCookieName())).toBe(true);

    const adminCount = await prisma.adminUser.count();
    expect(adminCount).toBe(1);

    const geoblocking = await prisma.geoblockingSettings.findUnique({
      where: { id: "default-geoblocking-settings" }
    });
    expect(geoblocking?.allowedCountries).toEqual(["AU", "NZ"]);
    expect(geoblocking?.unknownCountryMode).toBe("allow");

    const statusResponse = await getSetupStatus(new Request("http://localhost/api/setup/status"));
    expect(statusResponse.status).toBe(409);
    const statusBody = (await statusResponse.json()) as { code?: string; completed?: boolean };
    expect(statusBody.code).toBe("SETUP_COMPLETE");
    expect(statusBody.completed).toBe(true);
  });

  it("blocks initialization when a failing check exists", async () => {
    env.LEARNING_MATERIALS_STORAGE_DRIVER = "s3";

    const request = new NextRequest("http://localhost/api/setup/initialize", {
      method: "POST",
      body: JSON.stringify(buildSetupInitializePayload()),
      headers: {
        "content-type": "application/json"
      }
    });

    const response = await initializeSetup(request);
    expect(response.status).toBe(400);

    const body = (await response.json()) as {
      error: string;
      readiness: {
        failCount: number;
      };
    };

    expect(body.error).toContain("Resolve all failing setup checks");
    expect(body.readiness.failCount).toBeGreaterThan(0);
  });

  it("rejects setup initialization when no allowed countries are selected", async () => {
    const request = new NextRequest("http://localhost/api/setup/initialize", {
      method: "POST",
      body: JSON.stringify(
        buildSetupInitializePayload({
          allowedCountries: []
        })
      ),
      headers: {
        "content-type": "application/json"
      }
    });

    const response = await initializeSetup(request);
    expect(response.status).toBe(400);

    const body = (await response.json()) as {
      details?: {
        fieldErrors?: Record<string, string[]>;
      };
    };

    expect(body.details?.fieldErrors?.allowedCountries?.[0]).toContain("Select at least one allowed country");
  });
});
