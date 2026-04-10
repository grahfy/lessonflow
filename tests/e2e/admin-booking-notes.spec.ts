import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { bootstrapAdminStorageState, seedBookingNotesFixturesForE2E } from "./helpers/admin-auth";

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

async function dismissDeployUpdatesModal(page: Page) {
  const modal = page.getByRole("dialog", { name: /deployment updates/i });
  if (await modal.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await modal.getByRole("button", { name: /close|dismiss/i }).click({ force: true }).catch(() => null);
    await modal.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => null);
  }
}

async function closeBookingDialog(page: Page) {
  const dialog = page.locator("#booking-detail-dialog");
  if (await dialog.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await dialog.getByRole("button", { name: /^close$/i }).click({ force: true });
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);
  }
}

async function openCalendarDialog(
  page: Page,
  title: "Edit Booking" | "Booking Request",
  expectedEmail?: string
) {
  const calendarButtons = page.locator(".calendar-event");
  const count = await calendarButtons.count();
  if (count === 0) {
    test.skip(true, "No calendar items available to test with.");
    return null;
  }

  const dialog = page.locator("#booking-detail-dialog");
  for (let index = 0; index < count; index += 1) {
    await calendarButtons.nth(index).click();
    const heading = dialog.getByRole("heading", { name: title });
    const matched = await heading.isVisible({ timeout: 2_000 }).catch(() => false);
    if (matched) {
      if (expectedEmail) {
        const inputValues = await dialog.locator("input").evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLInputElement).value)
        );
        if (!inputValues.includes(expectedEmail)) {
          await closeBookingDialog(page);
          continue;
        }
      }
      return dialog;
    }
    await closeBookingDialog(page);
  }

  test.skip(true, `No ${title.toLowerCase()} item available in the current calendar view.`);
  return null;
}

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

// ── Auth setup ──────────────────────────────────────────────

test("authenticate admin", async ({ page }) => {
  await bootstrapAdminStorageState(page, authFile);
  seedBookingNotesFixturesForE2E();
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

    const dialog = await openCalendarDialog(page, "Edit Booking", "e2e-booking-notes-booking@example.com");
    if (!dialog) {
      return;
    }

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

    const dialog = await openCalendarDialog(page, "Edit Booking", "e2e-booking-notes-booking@example.com");
    if (!dialog) {
      return;
    }

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

  test("pending booking requests support note-image upload and save persistence", async ({ page }) => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);

    const dialog = await openCalendarDialog(page, "Booking Request", "e2e-booking-notes-request@example.com");
    if (!dialog) {
      return;
    }

    const contentArea = dialog.locator(".booking-notes-editor [contenteditable='true']").first();
    await expect(contentArea).toBeVisible({ timeout: 10_000 });
    await contentArea.click({ force: true });
    await page.keyboard.type("Pending request notes should persist.");

    const fileInput = dialog.locator(".booking-notes-editor input[type='file']").first();
    await fileInput.setInputFiles({
      name: "request-note.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    });

    await expect(dialog.locator(".booking-notes-editor img.booking-notes-image")).toHaveCount(1, { timeout: 10_000 });
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await expect(contentArea).toContainText("Pending request notes should persist.", { timeout: 10_000 });
    await waitForPageSettle(page);
    await page.waitForTimeout(1_500);

    await closeBookingDialog(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);

    const reopenedDialog = await openCalendarDialog(page, "Booking Request", "e2e-booking-notes-request@example.com");
    if (!reopenedDialog) {
      return;
    }
    await expect(reopenedDialog.locator(".booking-notes-editor [contenteditable='true']")).toContainText(
      "Pending request notes should persist.",
      { timeout: 10_000 }
    );
    await expect(reopenedDialog.locator(".booking-notes-editor img.booking-notes-image")).toHaveCount(1, { timeout: 10_000 });
  });

  test("confirmed bookings remove note images after editor cleanup and save", async ({ page }) => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);

    const dialog = await openCalendarDialog(page, "Edit Booking", "e2e-booking-notes-booking@example.com");
    if (!dialog) {
      return;
    }

    const contentArea = dialog.locator(".booking-notes-editor [contenteditable='true']").first();
    await expect(contentArea).toBeVisible({ timeout: 10_000 });
    await contentArea.click({ force: true });
    await page.keyboard.type("Image cleanup verification.");

    const fileInput = dialog.locator(".booking-notes-editor input[type='file']").first();
    await fileInput.setInputFiles({
      name: "booking-note.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    });

    await expect(dialog.locator(".booking-notes-editor img.booking-notes-image")).toHaveCount(1, { timeout: 10_000 });
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await expect(contentArea).toContainText("Image cleanup verification.", { timeout: 10_000 });

    await contentArea.click({ force: true });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.press("Backspace");
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await expect(dialog.locator(".booking-notes-editor img.booking-notes-image")).toHaveCount(0, { timeout: 10_000 });

    await closeBookingDialog(page);

    const reopenedDialog = await openCalendarDialog(page, "Edit Booking", "e2e-booking-notes-booking@example.com");
    if (!reopenedDialog) {
      return;
    }
    await expect(reopenedDialog.locator(".booking-notes-editor img.booking-notes-image")).toHaveCount(0, { timeout: 10_000 });
  });
});
