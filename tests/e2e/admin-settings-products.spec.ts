import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const defaultAdminEmail = "owner@example.com";
const defaultAdminPassword = "DocsDemoAdmin!23";

async function gotoWithRetry(page: Page, urlPath: string) {
  try {
    return await page.goto(urlPath, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (String(error).includes("ERR_ABORTED")) {
      await page.waitForTimeout(500);
      return await page.goto(urlPath, { waitUntil: "domcontentloaded" });
    }
    throw error;
  }
}

async function waitForPageSettle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => null);
}

async function dismissDeployUpdatesModal(page: Page): Promise<void> {
  const modal = page.getByRole("dialog", { name: /deployment updates/i });
  if (!(await modal.isVisible().catch(() => false))) {
    return;
  }

  await modal.getByRole("button", { name: /^close$/i }).click({ force: true }).catch(async () => {
    await page.keyboard.press("Escape").catch(() => null);
  });
  await modal.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);
}

async function createCaptchaPayload(request: APIRequestContext) {
  const captchaResponse = await request.get("/api/captcha");
  expect(captchaResponse.ok(), "Captcha endpoint should succeed for admin login e2e.").toBeTruthy();

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
    captchaAnswer: answer
  };
}

async function loginAdmin(page: Page): Promise<void> {
  const captchaPayload = await createCaptchaPayload(page.request);
  const email = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || defaultAdminEmail;
  const password = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || defaultAdminPassword;

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

  const response = await page.request.post("/api/admin/login", {
    data: {
      email,
      password,
      website: "",
      ...captchaPayload
    }
  });

  expect(response.ok(), "Admin login via API should succeed for settings products e2e.").toBeTruthy();
}

async function findAddPresetPanel(page: Page): Promise<Locator> {
  return page.locator(".admin-editor-panel").filter({ has: page.getByRole("heading", { name: /add new preset/i }) }).first();
}

test.describe("admin settings products", () => {
  test("accepts natural price typing in the add preset form and persists the saved value", async ({ page }) => {
    await loginAdmin(page);
    await gotoWithRetry(page, "/admin/settings");
    await page.getByRole("heading", { name: /admin configuration/i }).first().waitFor({ timeout: 12_000 });
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);

    await page.getByRole("tab", { name: /^products$/i }).click();
    await page.getByRole("heading", { name: /product presets/i }).waitFor({ timeout: 12_000 });

    const addPanel = await findAddPresetPanel(page);
    const labelInput = addPanel.locator("input").nth(0);
    const priceInput = addPanel.locator("input").nth(1);
    const presetLabel = `Price Input Spec ${Date.now()}`;

    await labelInput.fill(presetLabel);
    await priceInput.click();
    await priceInput.pressSequentially("12");
    await expect(priceInput).toHaveValue("12");
    await priceInput.pressSequentially(".34");
    await expect(priceInput).toHaveValue("12.34");

    await addPanel.getByRole("button", { name: /add preset/i }).click();
    await expect(page.getByText(/preset added\./i)).toBeVisible();

    const createdPanel = page.locator(".admin-editor-panel").filter({ has: page.locator(`input[value="${presetLabel}"]`) }).first();
    await expect(createdPanel).toBeVisible();
    await expect(createdPanel.locator("input").nth(1)).toHaveValue("12.34");

    page.once("dialog", (dialog) => dialog.accept());
    await createdPanel.getByRole("button", { name: /delete preset/i }).click();
    await expect(page.getByText(/preset deleted\./i)).toBeVisible();
  });
});
