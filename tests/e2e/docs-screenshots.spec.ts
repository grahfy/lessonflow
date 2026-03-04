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

async function waitForPageSettle(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => null);
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

  // Prefer API login to avoid UI-captcha coupling in screenshot automation.
  const loginResponse = await page.request.post("/api/admin/login", {
    data: {
      email,
      password,
      website: ""
    }
  });
  if (!loginResponse.ok()) {
    return false;
  }

  await gotoWithRetry(page, "/admin/bookings");
  await waitForPageSettle(page);
  await stabilizePage(page);

  return /\/admin\/(bookings|invoices|reports|settings|manual)/.test(page.url());
}

async function captureStudentPortalIfConfigured(page: import("@playwright/test").Page): Promise<boolean> {
  const fullName = process.env.DOCS_SCREENSHOTS_STUDENT_FULL_NAME;
  const postcode = process.env.DOCS_SCREENSHOTS_STUDENT_POSTCODE;
  const password = process.env.DOCS_SCREENSHOTS_STUDENT_PASSWORD;
  if (!fullName || !postcode || !password) return false;

  const loginResponse = await page.request.post("/api/student/login", {
    data: {
      fullName,
      postcode,
      password,
      website: "",
      captchaToken: "docs-screenshot",
      captchaAnswer: "docs-screenshot"
    }
  });
  if (!loginResponse.ok()) {
    return false;
  }

  await gotoWithRetry(page, "/student/portal");
  await waitForPageSettle(page);
  await stabilizePage(page);

  if (!/\/student\/portal/.test(page.url())) {
    return false;
  }

  await saveShot(page, "student-portal-page.png");
  return true;
}

test.describe("documentation screenshots", () => {
  test("capture public and admin manual screenshots", async ({ page }) => {
    test.setTimeout(300_000);

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
      await waitForPageSettle(page);
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
      { path: "/admin/manual", file: "admin-manual-page.png", waitFor: "Operations Manual" },
      { path: "/admin/reports", file: "admin-reports-dashboard.png", waitFor: "Reports Console" },
      { path: "/admin/settings", file: "admin-settings-page.png", waitFor: "Admin Configuration" },
      { path: "/admin/invoices", file: "invoice-console-list-and-filters.png", waitFor: "Invoices" },
      { path: "/admin/bookings", file: "booking-calendar-week-view.png", waitFor: "Bookings" }
    ];

    for (const capture of adminCaptures) {
      await gotoWithRetry(page, capture.path);
      if (capture.waitFor) {
        await page.getByText(new RegExp(capture.waitFor, "i")).first().waitFor({ timeout: 10_000 }).catch(() => null);
      }
      await waitForPageSettle(page);
      await stabilizePage(page);
      await saveShot(page, capture.file);
    }

    // Booking console dialog-level captures.
    await gotoWithRetry(page, "/admin/bookings");
    await page.getByText(/add manual booking/i).first().waitFor({ timeout: 10_000 });
    await waitForPageSettle(page);
    await stabilizePage(page);

    await page.getByRole("button", { name: /add manual booking/i }).click();
    const manualDialog = page
      .locator(".dialog-panel.dialog-panel-wide")
      .filter({ has: page.getByRole("heading", { name: /add manual booking/i }) })
      .first();
    await manualDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(manualDialog, "manual-booking-dialog-customer-step.png");
    await manualDialog.getByRole("button", { name: /close/i }).first().click().catch(async () => {
      await page.keyboard.press("Escape").catch(() => null);
    });
    await manualDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    await gotoWithRetry(page, "/admin/customers");
    await page.getByRole("heading", { name: /customers/i }).first().waitFor({ timeout: 10_000 });
    await waitForPageSettle(page);
    await stabilizePage(page);
    await saveShot(page, "customer-directory-list.png");

    await page.getByRole("button", { name: /create new customer/i }).first().click();
    const customerEditorDialog = page
      .locator(".dialog-panel")
      .filter({ has: page.getByRole("heading", { name: /customer details/i }) })
      .first();
    await customerEditorDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(customerEditorDialog, "customer-editor-create.png");
    await customerEditorDialog.getByRole("button", { name: /close/i }).first().click().catch(async () => {
      await page.keyboard.press("Escape").catch(() => null);
    });
    await customerEditorDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await stabilizePage(page);
    const bookingEvent = page.locator(".calendar-event.event-green, .calendar-event").first();
    await bookingEvent.waitFor({ timeout: 10_000 });
    await bookingEvent.click();
    const bookingDialog = page
      .locator(".dialog-panel.dialog-panel-wide")
      .filter({ has: page.getByRole("heading", { name: /edit booking/i }) })
      .first();
    await bookingDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(bookingDialog, "booking-detail-dialog-notes-and-actions.png");

    await bookingDialog.getByRole("button", { name: /invoice/i }).click();
    await page.waitForURL(/\/admin\/invoices/i, { timeout: 15_000 }).catch(() => null);
    await waitForPageSettle(page);
    await stabilizePage(page);
    const bookingInvoiceDialog = page
      .locator(".dialog-panel.dialog-panel-wide")
      .filter({ has: page.getByRole("heading", { name: /invoice/i }) })
      .first();
    if (await bookingInvoiceDialog.isVisible().catch(() => false)) {
      await saveLocatorShot(bookingInvoiceDialog, "booking-create-invoice-dialog.png");
      await bookingInvoiceDialog.getByRole("button", { name: /close/i }).first().click().catch(async () => {
        await page.keyboard.press("Escape").catch(() => null);
      });
      await bookingInvoiceDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);
    } else {
      await saveShot(page, "booking-create-invoice-dialog.png");
    }

    // Invoice console dialog-level captures.
    await gotoWithRetry(page, "/admin/invoices");
    await page.getByText(/invoices/i).first().waitFor({ timeout: 10_000 });
    await waitForPageSettle(page);
    await stabilizePage(page);

    await page.getByRole("button", { name: /create invoice/i }).click();
    const invoiceCreateDialog = page
      .locator(".dialog-panel.dialog-panel-wide")
      .filter({ has: page.getByRole("heading", { name: /create new invoice|create invoice/i }) })
      .first();
    await invoiceCreateDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(invoiceCreateDialog, "invoice-create-dialog.png");
    await invoiceCreateDialog.getByRole("button", { name: "Close" }).click().catch(async () => {
      await page.keyboard.press("Escape").catch(() => null);
    });
    await invoiceCreateDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    await page.getByRole("button", { name: /edit/i }).first().click();
    const invoiceDetailDialog = page
      .locator(".dialog-panel.dialog-panel-wide")
      .filter({ has: page.getByRole("heading", { name: /^invoice /i }) })
      .first();
    await invoiceDetailDialog.waitFor({ timeout: 10_000 });
    await stabilizePage(page);
    await saveLocatorShot(invoiceDetailDialog, "invoice-detail-send-and-download-pdf.png");
    await invoiceDetailDialog.getByRole("button", { name: "Close" }).click().catch(async () => {
      await page.keyboard.press("Escape").catch(() => null);
    });
    await invoiceDetailDialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);

    await gotoWithRetry(page, "/admin/invoices");
    await waitForPageSettle(page);
    await stabilizePage(page);

    const outstandingOnlyToggle = page.getByLabel(/overdue only/i).first();
    if (!(await outstandingOnlyToggle.isChecked().catch(() => false))) {
      await outstandingOnlyToggle.check({ force: true });
    }
    await waitForPageSettle(page);
    await stabilizePage(page);
    await saveShot(page, "invoice-filters-outstanding-aging.png");
  });
});
