import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const outputDir = path.resolve(process.cwd(), "Documentation/assets");

function docsScreenshotPath(fileName: string) {
  return path.join(outputDir, fileName);
}

async function stabilizePage(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }
    `
  }).catch(() => null);
  await page.waitForTimeout(300);
}

async function saveShot(page: import("@playwright/test").Page, fileName: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: docsScreenshotPath(fileName), fullPage: true });
}

async function saveLocatorShot(locator: import("@playwright/test").Locator, fileName: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  await locator.screenshot({ path: docsScreenshotPath(fileName) });
}

async function gotoWithRetry(page: import("@playwright/test").Page, urlPath: string) {
  try {
    return await page.goto(urlPath, { waitUntil: "domcontentloaded" });
  } catch (error) {
    // Next.js dev mode can abort the first navigation while compiling/reloading.
    if (String(error).includes("ERR_ABORTED")) {
      await page.waitForTimeout(500);
      return await page.goto(urlPath, { waitUntil: "domcontentloaded" });
    }
    throw error;
  }
}

async function loginAdminIfConfigured(page: import("@playwright/test").Page): Promise<boolean> {
  const email = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL;
  const password = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD;
  if (!email || !password) return false;

  const response = await gotoWithRetry(page, "/admin/login");
  await stabilizePage(page);
  if (!response || (response.status() >= 500 && response.status() < 600)) {
    return false;
  }

  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"], input[type="text"]').first();
  const submitButton = page.getByRole("button", { name: /sign in/i }).first();

  await emailInput.fill(email);
  await passwordInput.fill(password);
  const captchaLabel = await page.locator('label[for="admin-captcha"]').first().textContent();
  const answer = solveCaptchaFromLabel(String(captchaLabel || ""));
  if (!answer) {
    return false;
  }
  await page.locator("#admin-captcha").fill(answer);
  await submitButton.click();
  await page.waitForLoadState("networkidle").catch(() => null);

  return /\/admin\/(bookings|invoices|reports|settings|manual)/.test(page.url());
}

function solveCaptchaFromLabel(text: string): string | null {
  const match = text.match(/(\d+)\s*([+\-])\s*(\d+)/);
  if (!match) return null;
  const left = Number(match[1]);
  const op = match[2];
  const right = Number(match[3]);
  return `${op === "+" ? left + right : left - right}`;
}

async function captureStudentPortalIfConfigured(page: import("@playwright/test").Page): Promise<boolean> {
  const fullName = process.env.DOCS_SCREENSHOTS_STUDENT_FULL_NAME;
  const postcode = process.env.DOCS_SCREENSHOTS_STUDENT_POSTCODE;
  const password = process.env.DOCS_SCREENSHOTS_STUDENT_PASSWORD;
  if (!fullName || !postcode || !password) return false;

  const response = await gotoWithRetry(page, "/student/login");
  if (!response || (response.status() >= 500 && response.status() < 600)) {
    return false;
  }
  await stabilizePage(page);

  await page.locator('input[name="fullName"]').fill(fullName);
  await page.locator('input[name="postcode"]').fill(postcode);
  await page.locator('input[name="password"]').fill(password);
  const captchaLabel = await page.locator('label[for="student-captcha"]').first().textContent();
  const answer = solveCaptchaFromLabel(String(captchaLabel || ""));
  if (!answer) return false;
  await page.locator('#student-captcha').fill(answer);
  await page.getByRole("button", { name: /sign in to portal/i }).click();
  await page.waitForLoadState("networkidle").catch(() => null);
  await stabilizePage(page);

  if (!/\/student\/portal/.test(page.url())) {
    return false;
  }

  await saveShot(page, "student-portal-page.png");
  return true;
}

test.describe("documentation screenshots", () => {
  test("capture public and admin manual screenshots", async ({ page }) => {
    test.setTimeout(120_000);

    const captures: Array<{ path: string; file: string; optional?: boolean }> = [
      { path: "/book", file: "public-book-page.png" },
      { path: "/contact", file: "public-contact-page.png" },
      { path: "/student/login", file: "student-login-page.png" },
      { path: "/admin/login", file: "admin-login-page.png", optional: true }
    ];

    for (const capture of captures) {
      const response = await gotoWithRetry(page, capture.path);
      if (capture.optional && response && response.status() >= 500) {
        test.info().annotations.push({
          type: "note",
          description: `Skipped ${capture.file} because ${capture.path} returned ${response.status()} (likely missing local MySQL DATABASE_URL).`
        });
        continue;
      }
      await page.waitForLoadState("networkidle").catch(() => null);
      await stabilizePage(page);
      await saveShot(page, capture.file);
    }

    const studentPortalCaptured = await captureStudentPortalIfConfigured(page);
    if (!studentPortalCaptured) {
      test.info().annotations.push({
        type: "note",
        description: "Student portal screenshot not captured (student demo credentials not configured or portal login failed)."
      });
    }

    const loggedIn = await loginAdminIfConfigured(page);
    if (!loggedIn) {
      test.info().annotations.push({
        type: "note",
        description: "DOCS_SCREENSHOTS_ADMIN_EMAIL/PASSWORD not configured; skipped authenticated admin captures."
      });
      return;
    }

    const adminCaptures: Array<{ path: string; file: string; waitFor?: string }> = [
      { path: "/admin/manual", file: "admin-manual-page.png", waitFor: "Admin Manual" },
      { path: "/admin/reports", file: "admin-reports-dashboard.png", waitFor: "Reports Console" },
      { path: "/admin/settings", file: "admin-settings-page.png", waitFor: "Admin Configuration" },
      { path: "/admin/invoices", file: "invoice-console-list-and-filters.png", waitFor: "Invoice Console" },
      { path: "/admin/bookings", file: "booking-calendar-week-view.png", waitFor: "Add Manual Booking" }
    ];

    for (const capture of adminCaptures) {
      await gotoWithRetry(page, capture.path);
      if (capture.waitFor) {
        await page.getByText(capture.waitFor, { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => null);
      }
      await page.waitForLoadState("networkidle").catch(() => null);
      await stabilizePage(page);
      await saveShot(page, capture.file);
    }

    // Booking console dialog-level captures.
    await gotoWithRetry(page, "/admin/bookings");
    await page.getByText("Add Manual Booking", { exact: false }).first().waitFor({ timeout: 10_000 });
    await page.waitForLoadState("networkidle").catch(() => null);
    await stabilizePage(page);

    await page.getByRole("button", { name: "Add Manual Booking" }).click();
    const manualDialog = page.locator('[aria-labelledby="manual-dialog-title"]').first();
    await manualDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(manualDialog, "manual-booking-dialog-customer-step.png");
    await page.getByRole("button", { name: "Close" }).filter({ has: page.locator('[aria-labelledby="manual-dialog-title"]') }).first().click().catch(async () => {
      await page.keyboard.press("Escape").catch(() => null);
    });
    await page.locator('[aria-labelledby="manual-dialog-title"]').first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    await page.getByRole("button", { name: "Customers" }).click();
    const customersDialog = page.locator('[aria-labelledby="customers-dialog-title"]').first();
    await customersDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(customersDialog, "customer-directory-list.png");

    await customersDialog.getByRole("button", { name: "Create New Customer" }).click();
    const customerEditorDialog = page.locator('[aria-labelledby="customer-editor-dialog-title"]').first();
    await customerEditorDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(customerEditorDialog, "customer-editor-create.png");
    await page.keyboard.press("Escape").catch(() => null);
    await customerEditorDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);
    await page.keyboard.press("Escape").catch(() => null);
    await customersDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    const bookingEvent = page.locator(".calendar-event.event-green, .calendar-event").first();
    await bookingEvent.waitFor({ timeout: 10_000 });
    await bookingEvent.click();
    const bookingDialog = page.locator('[aria-labelledby="booking-dialog-title"]').first();
    await bookingDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(bookingDialog, "booking-detail-dialog-notes-and-actions.png");

    await bookingDialog.getByRole("button", { name: "Create invoice" }).click();
    const bookingInvoiceDialog = page.locator('[aria-labelledby="invoice-dialog-title"]').first();
    await bookingInvoiceDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(bookingInvoiceDialog, "booking-create-invoice-dialog.png");
    await page.keyboard.press("Escape").catch(() => null);
    await bookingInvoiceDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);
    await page.keyboard.press("Escape").catch(() => null);
    await bookingDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    // Invoice console dialog-level captures.
    await gotoWithRetry(page, "/admin/invoices");
    await page.getByText("Invoice Console", { exact: false }).first().waitFor({ timeout: 10_000 });
    await page.waitForLoadState("networkidle").catch(() => null);
    await stabilizePage(page);

    await page.getByRole("button", { name: "Create Invoice" }).click();
    const invoiceCreateDialog = page
      .locator(".dialog-panel.dialog-panel-wide")
      .filter({ has: page.getByRole("heading", { name: "Create Invoice" }) })
      .first();
    await invoiceCreateDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(invoiceCreateDialog, "invoice-create-dialog.png");
    await invoiceCreateDialog.getByRole("button", { name: "Close" }).click().catch(async () => {
      await page.keyboard.press("Escape").catch(() => null);
    });
    await invoiceCreateDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    await page.getByRole("button", { name: "View" }).first().click();
    const invoiceDetailDialog = page
      .locator(".dialog-panel.dialog-panel-wide")
      .filter({ has: page.locator(".invoice-total-stack") })
      .first();
    await invoiceDetailDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(invoiceDetailDialog, "invoice-detail-send-and-download-pdf.png");
    await invoiceDetailDialog.getByRole("button", { name: "Close" }).click().catch(async () => {
      await page.keyboard.press("Escape").catch(() => null);
    });
    await invoiceDetailDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    await page.locator(".invoice-toolbar select").nth(1).selectOption("overdue_1_30");
    await page.locator('.invoice-toolbar input[type="checkbox"]').check();
    await page.waitForLoadState("networkidle").catch(() => null);
    await stabilizePage(page);
    await saveShot(page, "invoice-filters-outstanding-aging.png");
  });
});