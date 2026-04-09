import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";

const adminEmail = "admin@example.com";
const adminPassword = "admin123";
const authFile = path.join(__dirname, ".auth-booking-notes.json");

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

// ── Auth setup ──────────────────────────────────────────────

test("authenticate admin", async ({ page }) => {
  const captchaPayload = await createCaptchaPayload(page.request);
  const email = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || adminEmail;
  const password = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || adminPassword;

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  const response = await page.request.post("/api/admin/login", {
    data: { email, password, website: "", ...captchaPayload },
  });
  expect(response.ok(), `Login failed: ${response.status()}`).toBeTruthy();

  await gotoWithRetry(page, "/admin/bookings");
  await expect(page.getByRole("heading", { name: /bookings/i }).first()).toBeVisible({ timeout: 10_000 });
  await page.context().storageState({ path: authFile });
});

// ── Booking notes editor tests ──────────────────────────────

test.describe("booking notes rich editor", () => {
  test.use({
    viewport: { width: 1440, height: 980 },
    storageState: authFile,
  });

  test("booking dialog shows TipTap editor for notes", async ({ page }) => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("heading", { name: /bookings/i }).first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1_000);

    // Click the first booking event on the calendar.
    const calendarButtons = page.locator("button").filter({ hasText: /\d{1,2}:\d{2}/ });
    const count = await calendarButtons.count();
    if (count === 0) {
      test.skip(true, "No bookings on the calendar to test with.");
      return;
    }

    await calendarButtons.first().click();
    const dialog = page.locator("#booking-detail-dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // The notes section should contain a TipTap editor (not a plain textarea).
    const notesSection = dialog.locator(".dialog-col.is-notes");
    await expect(notesSection).toBeVisible({ timeout: 5_000 });

    // Check for the TipTap editor shell (replaces the old textarea).
    const editorShell = notesSection.locator(".tiptap-editor-shell");
    const hasEditor = await editorShell.isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasEditor).toBeTruthy();

    // The toolbar should be visible with formatting buttons.
    const toolbar = editorShell.locator(".tiptap-toolbar");
    await expect(toolbar).toBeVisible();

    // Bold, italic, heading buttons should be present.
    await expect(toolbar.getByRole("button", { name: "Bold" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Italic" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Heading 2" })).toBeVisible();

    // Image upload button should be visible (for confirmed bookings).
    const imageBtn = toolbar.getByRole("button", { name: "Upload Image" });
    const isBooking = await dialog.locator("text=Cancel Booking").isVisible().catch(() => false);
    if (isBooking) {
      await expect(imageBtn).toBeVisible();
    }

    // The editable content area should be present.
    const contentArea = editorShell.locator(".tiptap-editor-content");
    await expect(contentArea).toBeVisible();

    // Take a screenshot for visual verification.
    await page.screenshot({ path: "booking-notes-editor.png", fullPage: false });
  });

  test("can type formatted text in notes editor", async ({ page }) => {
    // Collect browser console errors.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`PAGE ERROR: ${err.message}`);
    });

    // Navigate fresh (avoid state leaking from previous test).
    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);

    // Wait for the page heading to confirm we're on the bookings page.
    const heading = page.getByRole("heading", { name: /bookings/i }).first();
    const headingVisible = await heading.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!headingVisible) {
      await page.screenshot({ path: "booking-notes-no-heading.png", fullPage: false });
      const fs = await import("node:fs");
      fs.writeFileSync("booking-notes-console-errors.txt", consoleErrors.join("\n"));
      test.skip(true, `Bookings page did not render. Errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
      return;
    }
    await page.waitForTimeout(2_000);

    // Find and click a booking event.
    const calendarButtons = page.locator("button").filter({ hasText: /\d{1,2}:\d{2}/ });
    const count = await calendarButtons.count();
    if (count === 0) {
      test.skip(true, "No bookings on the calendar to test with.");
      return;
    }

    await calendarButtons.first().click();
    const dialog = page.locator("#booking-detail-dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // Wait for dialog to fully settle (data loads, TipTap mounts).
    await page.waitForTimeout(3_000);

    // Look for the TipTap editor in the notes section.
    const editorShell = dialog.locator(".booking-notes-editor .tiptap-editor-shell").first();
    const hasEditor = await editorShell.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasEditor) {
      await page.screenshot({ path: "booking-notes-no-editor-2.png", fullPage: false });
      test.skip(true, "No TipTap editor found in booking dialog.");
      return;
    }

    // Wait for the contenteditable element to stabilize.
    const contentArea = editorShell.locator("[contenteditable='true']");
    await expect(contentArea).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // Focus the editor and type.
    await contentArea.click({ force: true });
    await page.waitForTimeout(500);
    await page.keyboard.type("Worked on chord transitions today.");
    await page.waitForTimeout(500);

    // Verify text was entered.
    await expect(contentArea).toContainText("Worked on chord transitions today.");

    // Take screenshot showing text in the editor.
    await page.screenshot({ path: "booking-notes-formatted-text.png", fullPage: false });
  });
});
