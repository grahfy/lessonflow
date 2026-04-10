import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const defaultAdminEmail = "owner@example.com";
export const defaultAdminPassword = "DocsDemoAdmin!23";
export const defaultStudentName = "Alex Student";
export const defaultStudentPostcode = "3000";
export const defaultStudentPassword = "StudentDemo!23";

function readSeedChecklistValue(label: "Student login name" | "Student postcode"): string | null {
  const checklistPath = path.resolve(process.cwd(), "Documentation/assets/SCREENSHOT_SEED_CHECKLIST.md");
  if (!fs.existsSync(checklistPath)) {
    return null;
  }

  const source = fs.readFileSync(checklistPath, "utf8");
  const pattern = new RegExp(`^- ${label}: \`([^\`]+)\``, "m");
  const match = source.match(pattern);
  return match?.[1]?.trim() || null;
}

function ensureStudentE2EFixture(input: {
  fullName: string;
  postcode: string;
  password: string;
}) {
  execFileSync(
    "npx",
    ["tsx", "scripts/ensure-e2e-student.ts"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      env: {
        ...process.env,
        E2E_STUDENT_FULL_NAME: input.fullName,
        E2E_STUDENT_POSTCODE: input.postcode,
        E2E_STUDENT_PASSWORD: input.password
      }
    }
  );
}

export async function createCaptchaPayload(
  request: APIRequestContext,
  label: string
): Promise<{ captchaToken: string; captchaAnswer: string }> {
  const captchaResponse = await request.get("/api/captcha");
  expect(captchaResponse.ok(), `Captcha endpoint should succeed for ${label}.`).toBeTruthy();

  const captcha = (await captchaResponse.json()) as {
    token?: string;
    imageDataUrl?: string;
  } | null;

  const token = String(captcha?.token || "").trim();
  const imageDataUrl = String(captcha?.imageDataUrl || "");
  expect(token, `Captcha token should be present for ${label}.`).not.toBe("");
  expect(
    imageDataUrl.startsWith("data:image/svg+xml;base64,"),
    `Captcha SVG data URL should be present for ${label}.`
  ).toBeTruthy();

  const svg = Buffer.from(imageDataUrl.split(",")[1] || "", "base64").toString("utf8");
  const answer = Array.from(svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g))
    .map((match) => match[1])
    .join("")
    .trim();

  expect(answer, `Captcha answer should be derivable for ${label}.`).not.toBe("");

  return {
    captchaToken: token,
    captchaAnswer: answer
  };
}

export async function loginAdminViaApi(
  page: Page,
  options?: {
    email?: string;
    password?: string;
    forwardedIp?: string;
  }
): Promise<void> {
  const email = options?.email || process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || defaultAdminEmail;
  const password = options?.password || process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || defaultAdminPassword;

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  const captchaPayload = await createCaptchaPayload(page.request, "admin login");
  const response = await page.request.post("/api/admin/login", {
    headers: options?.forwardedIp
      ? {
          "x-forwarded-for": options.forwardedIp
        }
      : undefined,
    data: {
      email,
      password,
      website: "",
      ...captchaPayload
    }
  });

  const body = await response.text();
  expect(
    response.ok(),
    `Admin login via API should succeed. Received ${response.status()} with body: ${body}`
  ).toBeTruthy();
}

export async function loginStudentViaApi(
  page: Page,
  options?: {
    fullName?: string;
    postcode?: string;
    password?: string;
  }
): Promise<void> {
  const fullName = options?.fullName
    || process.env.DOCS_SCREENSHOTS_STUDENT_FULL_NAME
    || readSeedChecklistValue("Student login name")
    || defaultStudentName;
  const postcode = options?.postcode
    || process.env.DOCS_SCREENSHOTS_STUDENT_POSTCODE
    || readSeedChecklistValue("Student postcode")
    || defaultStudentPostcode;
  const password = options?.password || process.env.DOCS_SCREENSHOTS_STUDENT_PASSWORD || defaultStudentPassword;

  ensureStudentE2EFixture({ fullName, postcode, password });

  await page.goto("/student/login", { waitUntil: "domcontentloaded" });
  const captchaPayload = await createCaptchaPayload(page.request, "student login");
  const response = await page.request.post("/api/student/login", {
    data: {
      fullName,
      postcode,
      password,
      website: "",
      ...captchaPayload
    }
  });

  const body = await response.text();
  expect(
    response.ok(),
    `Student login via API should succeed. Received ${response.status()} with body: ${body}`
  ).toBeTruthy();
}
