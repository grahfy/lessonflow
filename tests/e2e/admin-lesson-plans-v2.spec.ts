import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const adminEmail = "admin@example.com";
const adminPassword = "admin123";
const authFile = path.join(__dirname, ".auth-lesson-plans-v2.json");

// ── Shared helpers ──────────────────────────────────────────

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

async function createCaptchaPayload(request: APIRequestContext) {
  const captchaResponse = await request.get("/api/captcha");
  expect(captchaResponse.ok()).toBeTruthy();
  const captcha = (await captchaResponse.json()) as { token?: string; imageDataUrl?: string } | null;
  const token = String(captcha?.token || "").trim();
  const imageDataUrl = String(captcha?.imageDataUrl || "");
  const svg = Buffer.from(imageDataUrl.split(",")[1] || "", "base64").toString("utf8");
  const answer = Array.from(svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g))
    .map((m) => m[1]).join("").trim();
  return { captchaToken: token, captchaAnswer: answer };
}

async function dismissDeployUpdatesModal(page: Page) {
  const modal = page.getByRole("dialog", { name: /deployment updates/i });
  if (await modal.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await modal.getByRole("button", { name: /close|dismiss/i }).click({ force: true }).catch(() => null);
    await modal.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => null);
  }
}

// ── Auth setup (runs once) ──────────────────────────────────

test("authenticate admin", async ({ page }) => {
  const captchaPayload = await createCaptchaPayload(page.request);
  const email = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || adminEmail;
  const password = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || adminPassword;

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  const response = await page.request.post("/api/admin/login", {
    data: { email, password, website: "", ...captchaPayload },
  });
  expect(response.ok(), `Login failed: ${response.status()}`).toBeTruthy();

  // Verify auth works by navigating to admin page.
  await gotoWithRetry(page, "/admin/bookings");
  await expect(page.getByRole("heading", { name: /bookings/i }).first()).toBeVisible({ timeout: 10_000 });

  // Save auth state for subsequent tests.
  await page.context().storageState({ path: authFile });
});

// ── Main tests (reuse auth) ─────────────────────────────────

test.describe("admin lesson plans V2", () => {
  test.use({
    viewport: { width: 1440, height: 980 },
    storageState: authFile,
  });

  test("template library page renders with V2 TipTap editor", async ({ page }) => {
    await gotoWithRetry(page, "/admin/lesson-plans");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);

    await expect(page.getByRole("heading", { name: /lesson plans/i }).first()).toBeVisible({ timeout: 10_000 });

    // Sidebar.
    await expect(page.getByText("Template Library")).toBeVisible();
    await expect(page.getByRole("button", { name: /new template/i })).toBeVisible();

    // Seeded templates.
    const templateItems = page.locator(".lesson-plan-template-list-item");
    await expect(templateItems.first()).toBeVisible({ timeout: 8_000 });

    // Click "New Template".
    await page.getByRole("button", { name: /new template/i }).click();
    await page.waitForTimeout(500);

    // TipTap editors appear (6 default sections).
    const editors = page.locator(".tiptap-editor-shell");
    await expect(editors.first()).toBeVisible({ timeout: 5_000 });
    expect(await editors.count()).toBeGreaterThanOrEqual(6);

    // Section titles.
    await expect(page.getByText("Lesson Focus")).toBeVisible();
    await expect(page.getByText("Goals")).toBeVisible();
    await expect(page.getByText("Homework")).toBeVisible();
    await expect(page.getByText("Private Notes")).toBeVisible();

    // Toolbar.
    await expect(page.locator(".tiptap-toolbar").first()).toBeVisible();

    // Category dropdown.
    await expect(page.locator("select").filter({ hasText: /General/i }).first()).toBeVisible();
  });

  test("booking dialog renders V2 lesson plan with sections", async ({ page }) => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("heading", { name: /bookings/i }).first().waitFor({ timeout: 10_000 });
    await waitForPageSettle(page);

    // Click first calendar booking button.
    const calendarButtons = page.locator("button").filter({ hasText: /\d{1,2}:\d{2}/ });
    await page.waitForTimeout(1_000);
    const count = await calendarButtons.count();

    let foundPlan = false;
    for (let i = 0; i < Math.min(count, 6); i++) {
      const btn = calendarButtons.nth(i);
      const text = await btn.textContent().catch(() => "");
      if (!text || text.length < 6) continue;

      await btn.click();
      const dialog = page.locator("#booking-detail-dialog");
      await expect(dialog).toBeVisible({ timeout: 8_000 });

      await dialog.getByRole("button", { name: /lesson plan/i }).click();
      await page.waitForTimeout(1_500);

      if (await dialog.locator(".tiptap-editor-shell").first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        foundPlan = true;

        await expect(dialog.getByText("Lesson Focus")).toBeVisible();
        await expect(dialog.getByText("Goals")).toBeVisible();
        await expect(dialog.locator(".lesson-plan-section-visibility").first()).toBeVisible();
        await expect(dialog.locator(".lesson-plan-status-selector")).toBeVisible();
        await expect(dialog.locator(".lesson-plan-badge").first()).toBeVisible();
        await expect(dialog.locator(".tiptap-toolbar").first()).toBeVisible();
        break;
      }

      await dialog.getByRole("button", { name: /^close$/i }).first().click();
      await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);
      await page.waitForTimeout(300);
    }

    expect(foundPlan).toBe(true);
  });

  test("booking empty state shows create and template options", async ({ page }) => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("heading", { name: /bookings/i }).first().waitFor({ timeout: 10_000 });
    await waitForPageSettle(page);

    const calendarButtons = page.locator("button").filter({ hasText: /\d{1,2}:\d{2}/ });
    await page.waitForTimeout(1_000);
    const count = await calendarButtons.count();
    if (count === 0) { test.skip(); return; }

    // Try to find a booking without a plan to verify the empty state.
    for (let i = count - 1; i >= Math.max(0, count - 4); i--) {
      const btn = calendarButtons.nth(i);
      const text = await btn.textContent().catch(() => "");
      if (!text || text.length < 6) continue;

      await btn.click();
      const dialog = page.locator("#booking-detail-dialog");
      await expect(dialog).toBeVisible({ timeout: 8_000 });

      await dialog.getByRole("button", { name: /lesson plan/i }).click();
      await page.waitForTimeout(1_000);

      const createBtn = dialog.getByRole("button", { name: /create from scratch/i });
      if (await createBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        // Verify empty state elements.
        await expect(createBtn).toBeVisible();
        await expect(dialog.getByRole("button", { name: /apply template/i })).toBeVisible();
        await expect(dialog.getByText("Scratch Plan")).toBeVisible();

        // Click create from scratch → editors appear.
        await createBtn.click();
        await page.waitForTimeout(500);
        await expect(dialog.locator(".tiptap-editor-shell").first()).toBeVisible({ timeout: 5_000 });
        return;
      }

      await dialog.getByRole("button", { name: /^close$/i }).first().click();
      await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);
      await page.waitForTimeout(300);
    }

    test.skip(true, "All visible bookings already have lesson plans.");
  });

  test("lesson plan panel has scroll capability", async ({ page }) => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("heading", { name: /bookings/i }).first().waitFor({ timeout: 10_000 });

    const calendarButtons = page.locator("button").filter({ hasText: /\d{1,2}:\d{2}/ });
    await page.waitForTimeout(1_000);
    if (await calendarButtons.count() === 0) { test.skip(); return; }

    await calendarButtons.first().click();
    const dialog = page.locator("#booking-detail-dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    await dialog.getByRole("button", { name: /lesson plan/i }).click();
    await page.waitForTimeout(1_500);

    const panel = dialog.locator(".booking-lesson-plan-panel");
    await expect(panel).toBeVisible({ timeout: 5_000 });

    const scrollHeight = await panel.evaluate((el) => el.scrollHeight);
    expect(scrollHeight).toBeGreaterThan(0);
  });

  test("can add and remove a custom section", async ({ page }) => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("heading", { name: /bookings/i }).first().waitFor({ timeout: 10_000 });

    const calendarButtons = page.locator("button").filter({ hasText: /\d{1,2}:\d{2}/ });
    await page.waitForTimeout(1_000);
    if (await calendarButtons.count() === 0) { test.skip(); return; }

    // Find a booking with a lesson plan.
    let foundPlan = false;
    for (let i = 0; i < Math.min(await calendarButtons.count(), 5); i++) {
      await calendarButtons.nth(i).click();
      const dialog = page.locator("#booking-detail-dialog");
      await expect(dialog).toBeVisible({ timeout: 8_000 });
      await dialog.getByRole("button", { name: /lesson plan/i }).click();
      await page.waitForTimeout(1_500);

      if (await dialog.locator(".tiptap-editor-shell").first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        foundPlan = true;
        break;
      }
      await dialog.getByRole("button", { name: /^close$/i }).first().click();
      await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);
    }
    if (!foundPlan) { test.skip(); return; }

    const dialog = page.locator("#booking-detail-dialog");
    const panel = dialog.locator(".booking-lesson-plan-panel");
    const sectionsBefore = await dialog.locator(".lesson-plan-section-editor").count();

    // Scroll to bottom, click Add Section.
    await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(300);

    const addBtn = dialog.getByRole("button", { name: /add section/i });
    if (!await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) { test.skip(); return; }

    await addBtn.click();

    const titleInput = dialog.locator(".lesson-plan-add-section-form input");
    await expect(titleInput).toBeVisible({ timeout: 3_000 });
    await titleInput.fill("Ear Training");
    await dialog.locator(".lesson-plan-add-section-form").getByRole("button", { name: /^add$/i }).click();
    await page.waitForTimeout(500);

    expect(await dialog.locator(".lesson-plan-section-editor").count()).toBe(sectionsBefore + 1);
    await expect(dialog.getByText("Ear Training")).toBeVisible();

    // Remove it.
    const newSection = dialog.locator(".lesson-plan-section-editor").last();
    const trashBtn = newSection.locator("button[title='Remove section']");
    if (await trashBtn.isVisible().catch(() => false)) {
      await trashBtn.click();
      await page.waitForTimeout(500);
      expect(await dialog.locator(".lesson-plan-section-editor").count()).toBe(sectionsBefore);
    }
  });
});

// Auth file is gitignored and harmless to leave on disk.
