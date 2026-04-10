import { execFileSync } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export function getE2EAdminCredentials(): { email: string; password: string } {
  return {
    email: process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "owner@example.com",
    password: process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "change-me",
  };
}

export function isLocalPlaywrightBaseUrl(): boolean {
  const baseUrl = process.env.DOCS_SCREENSHOTS_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

  try {
    const url = new URL(baseUrl);
    return ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function ensureLocalOwnerAdminForE2E(): Promise<void> {
  if (!isLocalPlaywrightBaseUrl()) {
    return;
  }

  const { email, password } = getE2EAdminCredentials();

  execFileSync(
    "npx",
    ["tsx", "./scripts/ensure-e2e-admin.ts"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      env: {
        ...process.env,
        E2E_ADMIN_EMAIL: email,
        E2E_ADMIN_PASSWORD: password,
      },
    }
  );
}

export async function createCaptchaPayload(request: APIRequestContext) {
  const captchaResponse = await request.get("/api/captcha");
  expect(captchaResponse.ok(), "Captcha endpoint should succeed for admin E2E login.").toBeTruthy();

  const captcha = (await captchaResponse.json()) as {
    token?: string;
    imageDataUrl?: string;
  } | null;

  const token = String(captcha?.token || "").trim();
  const imageDataUrl = String(captcha?.imageDataUrl || "");
  expect(token, "Captcha response should include a token.").not.toBe("");
  expect(imageDataUrl.startsWith("data:image/svg+xml;base64,"), "Captcha should be returned as SVG data URL.").toBeTruthy();

  const svg = Buffer.from(imageDataUrl.split(",")[1] || "", "base64").toString("utf8");
  const answer = Array.from(svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g))
    .map((match) => match[1])
    .join("")
    .trim();

  expect(answer, "Captcha SVG should expose a solvable text answer.").not.toBe("");

  return {
    captchaToken: token,
    captchaAnswer: answer,
  };
}

export async function loginAdminViaApi(page: Page): Promise<void> {
  await ensureLocalOwnerAdminForE2E();

  const captchaPayload = await createCaptchaPayload(page.request);
  const { email, password } = getE2EAdminCredentials();
  const forwardedIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

  const response = await page.request.post("/api/admin/login", {
    headers: {
      "x-forwarded-for": forwardedIp,
    },
    data: {
      email,
      password,
      website: "",
      ...captchaPayload,
    },
  });

  expect(response.ok(), `Admin login via API should succeed. Received ${response.status()}.`).toBeTruthy();
}

export async function bootstrapAdminStorageState(page: Page, authFile: string): Promise<void> {
  await loginAdminViaApi(page);
  await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /bookings/i }).first()).toBeVisible({ timeout: 10_000 });
  await page.context().storageState({ path: authFile });
}

export function seedBookingNotesFixturesForE2E(): void {
  if (!isLocalPlaywrightBaseUrl()) {
    return;
  }

  execFileSync(
    "npx",
    ["tsx", "./scripts/seed-e2e-booking-notes.ts"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      env: {
        ...process.env,
      },
    }
  );
}
