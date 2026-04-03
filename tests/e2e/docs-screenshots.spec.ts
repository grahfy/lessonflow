import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const outputDir = path.resolve(process.cwd(), "Documentation/assets");
const defaultAdminEmail = "owner@example.com";
const defaultAdminPassword = "DocsDemoAdmin!23";
const defaultStudentName = "Alex Student";
const defaultStudentPostcode = "3000";
const defaultStudentPassword = "StudentDemo!23";
const seenDeployCommitStorageKey = "mgs_admin_seen_deploy_commit";

const pendingUpdateCommits = [
  {
    sha: "abc1234def5678abc1234def5678abc1234def56",
    message: "feat: improve teacher assignment visibility across bookings",
    author: "Dean Thomson",
    date: "2026-03-18"
  },
  {
    sha: "1234def5678abc1234def5678abc1234def5678ab",
    message: "fix: harden portal materials view for seeded demos",
    author: "Dean Thomson",
    date: "2026-03-17"
  }
] as const;

const latestDeployUpdate = {
  branch: "main",
  release: "1.2.0",
  appliedAt: "2026-03-18T09:30:00.000Z",
  commit: "deployed1234567890abcdef1234567890abcdef1234",
  shortCommit: "deployed",
  previousCommit: "previous1234567890abcdef1234567890abcdef12",
  commits: [
    {
      hash: "deployed1234567890abcdef1234567890abcdef1234",
      shortHash: "deployed",
      authorName: "Dean Thomson",
      authoredAt: "2026-03-18T08:55:00.000Z",
      subject: "feat: improve teacher assignment visibility across bookings",
      body: "Clarifies the active owner on booking, customer, and teacher workflow surfaces."
    },
    {
      hash: "commit234567890abcdef1234567890abcdef123456",
      shortHash: "commit23",
      authorName: "Dean Thomson",
      authoredAt: "2026-03-17T16:20:00.000Z",
      subject: "fix: harden portal materials view for seeded demos",
      body: ""
    }
  ]
} as const;

const deployHistoryUpdates = [
  latestDeployUpdate,
  {
    branch: "main",
    release: "1.1.9",
    appliedAt: "2026-03-15T02:15:00.000Z",
    commit: "history1234567890abcdef1234567890abcdef123",
    shortCommit: "history1",
    previousCommit: "history0000000000000000000000000000000000",
    commits: [
      {
        hash: "history1234567890abcdef1234567890abcdef123",
        shortHash: "history1",
        authorName: "Dean Thomson",
        authoredAt: "2026-03-15T01:40:00.000Z",
        subject: "fix: restore overdue invoice reporting totals",
        body: ""
      }
    ]
  }
] as const;

const customerEmailAlertStatusStub = {
  alertsEnabled: true,
  providerPreference: "auto",
  activeProvider: "gmail",
  gmail: {
    status: "connected",
    message: "Connected and ready to check unread customer email.",
    email: "owner@example.com"
  },
  imap: {
    status: "not_configured",
    message: "IMAP is not configured for this demo dataset."
  }
} as const;

const customerEmailAlertSummaryStub = {
  state: "ready",
  provider: "gmail",
  unreadCount: 2,
  matchedCustomers: [
    {
      id: "docs-demo-customer-alex",
      fullName: "Alex Student",
      email: "alex.student@example.com",
      messageCount: 2
    }
  ],
  messages: [
    {
      messageId: "gmail-demo-1",
      customerId: "docs-demo-customer-alex",
      customerName: "Alex Student",
      customerEmail: "alex.student@example.com",
      senderEmail: "alex.student@example.com",
      subject: "Can we shift next week's lesson time?",
      snippet: "I can still do Tuesday, but I need to move slightly later if possible.",
      receivedAt: "2026-03-20T08:15:00.000Z"
    },
    {
      messageId: "gmail-demo-2",
      customerId: "docs-demo-customer-alex",
      customerName: "Alex Student",
      customerEmail: "alex.student@example.com",
      senderEmail: "alex.student@example.com",
      subject: "Portal material download issue",
      snippet: "The PDF opens, but the audio attachment is not appearing in the portal.",
      receivedAt: "2026-03-20T06:40:00.000Z"
    }
  ],
  checkedAt: "2026-03-20T08:20:00.000Z"
} as const;

/** Resolves screenshot output into the docs asset directory used by the manual. */
function docsScreenshotPath(fileName: string) {
  return path.join(outputDir, fileName);
}

/**
 * Disables motion and transient overlays so screenshot output stays stable
 * across runs, especially in local dev where entrance animations can drift.
 */
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

/** Closes the deployment updates modal when it appears during authenticated runs. */
async function dismissDeployUpdatesModal(page: import("@playwright/test").Page) {
  const modal = page.getByRole("dialog", { name: /deployment updates/i });
  if (!(await modal.isVisible().catch(() => false))) {
    return;
  }

  await modal.getByRole("button", { name: /^close$/i }).click({ force: true }).catch(async () => {
    await page.keyboard.press("Escape").catch(() => null);
  });
  await modal.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);
}

/** Saves a full-page screenshot into the documentation asset tree. */
async function saveShot(page: import("@playwright/test").Page, fileName: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: docsScreenshotPath(fileName), fullPage: true });
}

/** Saves a screenshot of a specific dialog/locator for focused manual images. */
async function saveLocatorShot(locator: import("@playwright/test").Locator, fileName: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  await locator.screenshot({ path: docsScreenshotPath(fileName) });
}

/** Keeps dialog shells visually stable as tab content changes. */
async function expectStableDialogBounds(
  locator: import("@playwright/test").Locator,
  baseline: { width: number; height: number },
  label: string
) {
  const box = await locator.boundingBox();
  expect(box, `${label} dialog should be visible`).not.toBeNull();
  if (!box) {
    return;
  }

  expect(Math.abs(box.width - baseline.width), `${label} dialog width should stay stable across tabs`).toBeLessThanOrEqual(2);
  expect(Math.abs(box.height - baseline.height), `${label} dialog height should stay stable across tabs`).toBeLessThanOrEqual(16);
}

/** Waits for network quiet without failing the capture on slow dev-only polling. */
async function waitForPageSettle(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => null);
}

/**
 * Retries one navigation when the Next.js dev server aborts the first load
 * during compile/hot-reload churn.
 */
async function gotoWithRetry(page: import("@playwright/test").Page, urlPath: string) {
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

/**
 * Solves the test captcha by reading the generated SVG text directly from the
 * app's API response instead of attempting OCR in Playwright.
 */
async function createCaptchaPayload(request: import("@playwright/test").APIRequestContext) {
  const captchaResponse = await request.get("/api/captcha");
  if (!captchaResponse.ok()) {
    return null;
  }

  const captcha = (await captchaResponse.json()) as {
    token?: string;
    imageDataUrl?: string;
  } | null;

  const token = String(captcha?.token || "").trim();
  const imageDataUrl = String(captcha?.imageDataUrl || "");
  if (!token || !imageDataUrl.startsWith("data:image/svg+xml;base64,")) {
    return null;
  }

  const svg = Buffer.from(imageDataUrl.split(",")[1] || "", "base64").toString("utf8");
  const answer = Array.from(svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g))
    .map((match) => match[1])
    .join("")
    .trim();

  if (!answer) {
    return null;
  }

  return { captchaToken: token, captchaAnswer: answer };
}

/** Logs in through the real admin API when docs screenshot credentials exist. */
async function loginAdmin(page: import("@playwright/test").Page): Promise<boolean> {
  const email = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || defaultAdminEmail;
  const password = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || defaultAdminPassword;

  const captchaPayload = await createCaptchaPayload(page.request);
  if (!captchaPayload) {
    return false;
  }

  const loginResponse = await page.request.post("/api/admin/login", {
    data: {
      email,
      password,
      website: "",
      ...captchaPayload
    }
  });
  if (!loginResponse.ok()) {
    return false;
  }

  await gotoWithRetry(page, "/admin/bookings");
  await waitForPageSettle(page);
  await stabilizePage(page);
  await dismissDeployUpdatesModal(page);

  return /\/admin\/(bookings|invoices|reports|settings|manual)/.test(page.url());
}

/** Captures the student portal dashboard and materials library using demo credentials. */
async function captureStudentPortal(page: import("@playwright/test").Page): Promise<boolean> {
  const fullName = process.env.DOCS_SCREENSHOTS_STUDENT_FULL_NAME || defaultStudentName;
  const postcode = process.env.DOCS_SCREENSHOTS_STUDENT_POSTCODE || defaultStudentPostcode;
  const password = process.env.DOCS_SCREENSHOTS_STUDENT_PASSWORD || defaultStudentPassword;

  const captchaPayload = await createCaptchaPayload(page.request);
  if (!captchaPayload) {
    return false;
  }

  const loginResponse = await page.request.post("/api/student/login", {
    data: {
      fullName,
      postcode,
      password,
      website: "",
      ...captchaPayload
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
  const lessonPlanSummary = page.locator('[class*="lesson-plan-summary"]').first();
  if (await lessonPlanSummary.isVisible().catch(() => false)) {
    await saveLocatorShot(lessonPlanSummary, "student-portal-lesson-plan-summary.png");
  }

  await gotoWithRetry(page, "/student/materials");
  await waitForPageSettle(page);
  await stabilizePage(page);
  await page.getByText(/all learning materials/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await saveShot(page, "student-portal-materials-view.png");
  return true;
}

async function closeDialog(dialog: import("@playwright/test").Locator, page: import("@playwright/test").Page) {
  await dialog.getByRole("button", { name: /^(close|cancel)$/i }).first().click().catch(async () => {
    await page.keyboard.press("Escape").catch(() => null);
  });
  await dialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => null);
}

async function captureTeacherScreenshots(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/admin/teachers");
  await page.getByRole("heading", { name: /^teachers$/i }).waitFor({ timeout: 10_000 });
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "teachers-workspace-page.png");

  await saveLocatorShot(page.locator(".teacher-directory-card").first(), "teachers-directory-list.png");
  await saveLocatorShot(page.locator(".teacher-profile-card").first(), "teacher-profile-editor-basics.png");
}

async function captureLessonPlanScreenshots(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/admin/lesson-plans");
  await page.getByRole("heading", { name: /^lesson plans$/i }).waitFor({ timeout: 10_000 });
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "lesson-plan-library-page.png");
}

async function captureCustomerScreenshots(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/admin/customers");
  await page.getByRole("heading", { name: /customers/i }).first().waitFor({ timeout: 10_000 });
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "customer-directory-list.png");

  await page.getByRole("button", { name: /new customer/i }).first().click();
  const customerDialog = page
    .locator(".dialog-panel")
    .filter({ has: page.getByRole("heading", { name: /customer details/i }) })
    .first();
  await customerDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  await saveLocatorShot(customerDialog, "customer-editor-create.png");
  await closeDialog(customerDialog, page);

  await page.locator(".customer-table-row").first().click();
  await customerDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  const customerDialogBox = await customerDialog.boundingBox();
  expect(customerDialogBox, "Customer dialog should expose stable bounds for tab checks").not.toBeNull();
  await saveLocatorShot(
    customerDialog.locator(".customer-tab-section.customer-profile-panel").first(),
    "customer-profile-assigned-teacher.png"
  );
  await saveLocatorShot(customerDialog.locator(".customer-portal-card").first(), "customer-portal-credential-panel.png");

  await customerDialog.getByRole("button", { name: /communication/i }).click();
  await customerDialog.getByText(/email history/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  if (customerDialogBox) {
    await expectStableDialogBounds(customerDialog, customerDialogBox, "Customer details");
  }
  await saveLocatorShot(customerDialog, "customer-email-history-panel.png");

  await customerDialog.getByRole("button", { name: /learning materials/i }).click();
  await customerDialog.getByText(/upload new/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  if (customerDialogBox) {
    await expectStableDialogBounds(customerDialog, customerDialogBox, "Customer details");
  }
  await saveLocatorShot(customerDialog, "customer-materials-list-upload-panel.png");
  await closeDialog(customerDialog, page);

  await gotoWithRetry(page, "/admin/customers?emailAlert=customer-email");
  await page.getByText(/unread customer email alerts/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveLocatorShot(page.locator(".customer-email-alert-summary-card").first(), "customer-email-alert-summary.png");
}

async function captureBookingScreenshots(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/admin/bookings");
  await page.getByRole("button", { name: /add manual booking/i }).first().waitFor({ timeout: 10_000 });
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "booking-calendar-week-view.png");

  await page.getByRole("button", { name: /add manual booking/i }).click();
  const manualDialog = page
    .locator(".dialog-panel.dialog-panel-wide")
    .filter({ has: page.getByRole("heading", { name: /add manual booking/i }) })
    .first();
  await manualDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  await saveLocatorShot(manualDialog, "manual-booking-dialog-customer-step.png");
  await closeDialog(manualDialog, page);

  const bookingEvent = page.locator(".calendar-event.event-green, .calendar-event").first();
  await bookingEvent.waitFor({ timeout: 10_000 });
  await bookingEvent.click();
  const bookingDialog = page
    .locator(".dialog-panel.dialog-panel-wide")
    .filter({ has: page.getByRole("heading", { name: /edit booking/i }) })
    .first();
  await bookingDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  const bookingDialogBox = await bookingDialog.boundingBox();
  expect(bookingDialogBox, "Booking dialog should expose stable bounds for tab checks").not.toBeNull();
  await saveLocatorShot(bookingDialog, "booking-detail-dialog-notes-and-actions.png");
  await saveLocatorShot(bookingDialog.locator(".dialog-col").first(), "booking-assigned-teacher-dialog.png");

  await bookingDialog.getByRole("button", { name: /communication/i }).click();
  await bookingDialog.getByText(/email history/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  if (bookingDialogBox) {
    await expectStableDialogBounds(bookingDialog, bookingDialogBox, "Booking details");
  }
  await saveLocatorShot(bookingDialog, "booking-email-panel.png");

  await bookingDialog.getByRole("button", { name: /learning materials/i }).click();
  await bookingDialog.getByText(/upload new/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  if (bookingDialogBox) {
    await expectStableDialogBounds(bookingDialog, bookingDialogBox, "Booking details");
  }

  await bookingDialog.getByRole("button", { name: /lesson plan/i }).click();
  await bookingDialog.getByText(/booking lesson plan|create from scratch/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  if (bookingDialogBox) {
    await expectStableDialogBounds(bookingDialog, bookingDialogBox, "Booking details");
  }
  await saveLocatorShot(bookingDialog, "booking-lesson-plan-tab.png");

  await bookingDialog.getByRole("button", { name: /^appointment$/i }).click();
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
    await closeDialog(bookingInvoiceDialog, page);
  } else {
    await saveShot(page, "booking-create-invoice-dialog.png");
  }
}

async function captureInvoiceScreenshots(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/admin/invoices");
  await page.getByText(/invoices/i).first().waitFor({ timeout: 10_000 });
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "invoice-console-list-and-filters.png");

  await page.getByRole("button", { name: /new invoice/i }).click();
  const invoiceCreateDialog = page.getByRole("dialog", { name: /new invoice/i }).first();
  await invoiceCreateDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  await saveLocatorShot(invoiceCreateDialog, "invoice-create-dialog.png");
  await closeDialog(invoiceCreateDialog, page);

  await page.getByRole("button", { name: /^open$/i }).first().click();
  const invoiceDetailDialog = page
    .locator(".dialog-panel.dialog-panel-wide")
    .filter({ has: page.getByRole("heading", { name: /^invoice /i }) })
    .first();
  await invoiceDetailDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  await saveLocatorShot(invoiceDetailDialog, "invoice-detail-send-and-download-pdf.png");
  await closeDialog(invoiceDetailDialog, page);

  const outstandingOnlyToggle = page.getByLabel(/overdue/i).first();
  if (!(await outstandingOnlyToggle.isChecked().catch(() => false))) {
    await outstandingOnlyToggle.check({ force: true });
  }
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "invoice-filters-outstanding-aging.png");
}

async function captureReportScreenshots(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/admin/reports");
  await page.getByText(/reports console/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "admin-reports-dashboard.png");
  await saveLocatorShot(page.locator(".report-custom-range-field").first(), "reports-custom-range-controls.png");
}

async function captureSettingsScreenshots(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/admin/settings");
  await page.getByText(/admin configuration/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "admin-settings-page.png");

  const tabShots: Array<{ label: RegExp; fileName: string; waitForText: RegExp }> = [
    { label: /^pages$/i, fileName: "settings-pages-tab.png", waitForText: /page path|section key/i },
    { label: /^emails$/i, fileName: "settings-emails-tab.png", waitForText: /email templates|signature/i },
    { label: /^invoices$/i, fileName: "settings-invoices-tab.png", waitForText: /invoice branding|invoice template|payment terms/i },
    { label: /^products$/i, fileName: "settings-products-tab.png", waitForText: /product|preset/i },
    { label: /^lesson info \/ prices$/i, fileName: "settings-lesson-pricing-tab.png", waitForText: /save lesson pricing|duration \(minutes\)/i },
    { label: /^system$/i, fileName: "settings-system-tab.png", waitForText: /admin password management|email delivery|security/i }
  ];

  for (const tabShot of tabShots) {
    await page.getByRole("tab", { name: tabShot.label }).click();
    await page.getByText(tabShot.waitForText).first().waitFor({ timeout: 10_000 }).catch(() => null);
    await waitForPageSettle(page);
    await stabilizePage(page);
    await saveShot(page, tabShot.fileName);
  }
}

async function installCustomerEmailAlertApiStubs(page: import("@playwright/test").Page) {
  await page.route("**/api/admin/customer-email-alerts/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(customerEmailAlertStatusStub)
    });
  });

  await page.route("**/api/admin/customer-email-alerts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(customerEmailAlertSummaryStub)
    });
  });
}

async function removeCustomerEmailAlertApiStubs(page: import("@playwright/test").Page) {
  await page.unroute("**/api/admin/customer-email-alerts/status");
  await page.unroute("**/api/admin/customer-email-alerts");
}

async function captureLogsScreenshots(page: import("@playwright/test").Page) {
  await gotoWithRetry(page, "/admin/system-logs");
  await page.getByRole("heading", { name: /system logs/i }).waitFor({ timeout: 10_000 });
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "system-logs-page.png");

  await page.getByRole("button", { name: /report issue/i }).click();
  const bugDialog = page.getByRole("dialog", { name: /report technical issue/i }).first();
  await bugDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  await saveLocatorShot(bugDialog, "system-log-report-dialog.png");
  await closeDialog(bugDialog, page);
}

async function installUpdateApiStubs(page: import("@playwright/test").Page) {
  await page.route("**/api/admin/updates/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        updateAvailable: true,
        pendingCommits: pendingUpdateCommits,
        webTriggerConfigured: true,
        webTriggerMessage: ""
      })
    });
  });

  await page.route("**/api/admin/deploy-updates/latest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(latestDeployUpdate)
    });
  });

  await page.route("**/api/admin/deploy-updates/history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ updates: deployHistoryUpdates })
    });
  });
}

async function captureUpdateScreenshots(page: import("@playwright/test").Page) {
  await installUpdateApiStubs(page);
  await page.evaluate((seenCommit) => {
    window.localStorage.setItem("mgs_admin_seen_deploy_commit", seenCommit);
  }, latestDeployUpdate.commit);

  await gotoWithRetry(page, "/admin/bookings");
  await page.getByRole("button", { name: /view changes/i }).waitFor({ timeout: 10_000 });
  await waitForPageSettle(page);
  await stabilizePage(page);

  await page.getByRole("button", { name: /view changes/i }).click();
  const pendingChangesDialog = page.getByRole("dialog", { name: /available repository updates/i });
  await pendingChangesDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  await saveLocatorShot(pendingChangesDialog, "pending-changes-modal.png");
  await closeDialog(pendingChangesDialog, page);

  const menuToggle = page.getByRole("button", { name: /^menu$/i });
  if (await menuToggle.isVisible().catch(() => false)) {
    await menuToggle.click();
  }

  await page.locator("button").filter({ hasText: /^Updates$/i }).first().click();
  const deployUpdatesDialog = page.getByRole("dialog", { name: /deployment updates/i });
  await deployUpdatesDialog.waitFor({ timeout: 10_000 });
  await stabilizePage(page);
  await saveLocatorShot(deployUpdatesDialog, "deployment-updates-latest-tab.png");

  await deployUpdatesDialog.getByRole("button", { name: /^history$/i }).click();
  await deployUpdatesDialog.getByText(/no deployment history found|branch/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveLocatorShot(deployUpdatesDialog, "deployment-updates-history-tab.png");
  await closeDialog(deployUpdatesDialog, page);

  await gotoWithRetry(page, "/admin/about");
  await page.getByText(/about lessonflow/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "admin-about-page.png");

  await page.addInitScript(() => {
    class FakeEventSource {
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readonly url: string;
      readonly withCredentials = false;
      private readonly listeners = new Map<string, Array<(event: Event) => void>>();

      constructor(url: string) {
        this.url = url;
        window.setTimeout(() => {
          this.onopen?.(new Event("open"));
          this.onmessage?.(new MessageEvent("message", { data: JSON.stringify("Pulling latest repository changes...") }));
          this.onmessage?.(new MessageEvent("message", { data: JSON.stringify("Building Next.js application") }));
          this.onmessage?.(new MessageEvent("message", { data: JSON.stringify("Generating static pages (18/24)") }));
          this.onmessage?.(new MessageEvent("message", { data: JSON.stringify("Restarting systemd service") }));
        }, 50);
      }

      addEventListener(type: string, listener: (event: Event) => void) {
        const existing = this.listeners.get(type) || [];
        existing.push(listener);
        this.listeners.set(type, existing);
      }

      removeEventListener(type: string, listener: (event: Event) => void) {
        const existing = this.listeners.get(type) || [];
        this.listeners.set(type, existing.filter((entry) => entry !== listener));
      }

      close() {}
    }

    Object.defineProperty(window, "EventSource", {
      configurable: true,
      writable: true,
      value: FakeEventSource
    });
  });

  await gotoWithRetry(page, "/admin/updates/progress");
  await page.getByText(/system update in progress/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await page.getByText(/building next\.js application/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
  await waitForPageSettle(page);
  await stabilizePage(page);
  await saveShot(page, "update-progress-page.png");
}

test.describe("documentation screenshots", () => {
  test("capture public and admin manual screenshots", async ({ page }) => {
    test.setTimeout(300_000);

    const publicCaptures: Array<{ path: string; file: string; optional?: boolean }> = [
      { path: "/book", file: "public-book-page.png" },
      { path: "/contact", file: "public-contact-page.png" },
      { path: "/student/login", file: "student-login-page.png" },
      { path: "/admin/login", file: "admin-login-page.png", optional: true }
    ];

    for (const capture of publicCaptures) {
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

    const studentPortalCaptured = await captureStudentPortal(page);
    if (!studentPortalCaptured) {
      test.info().annotations.push({
        type: "note",
        description: "Student portal screenshots not captured (demo credentials unavailable or portal login failed)."
      });
    }

    const loggedIn = await loginAdmin(page);
    if (!loggedIn) {
      test.info().annotations.push({
        type: "note",
        description: "Admin docs screenshots skipped because seeded/default admin credentials were unavailable or login failed."
      });
      return;
    }

    const overviewCaptures: Array<{ path: string; file: string; waitFor?: RegExp }> = [
      { path: "/admin/manual", file: "admin-manual-page.png", waitFor: /operations manual/i }
    ];

    for (const capture of overviewCaptures) {
      await gotoWithRetry(page, capture.path);
      await dismissDeployUpdatesModal(page);
      if (capture.waitFor) {
        await page.getByText(capture.waitFor).first().waitFor({ timeout: 10_000 }).catch(() => null);
      }
      await waitForPageSettle(page);
      await stabilizePage(page);
      await saveShot(page, capture.file);
    }

    await captureTeacherScreenshots(page);
    await captureLessonPlanScreenshots(page);
    await captureBookingScreenshots(page);
    await captureInvoiceScreenshots(page);
    await captureReportScreenshots(page);
    await installCustomerEmailAlertApiStubs(page);
    await captureCustomerScreenshots(page);
    await captureSettingsScreenshots(page);
    await removeCustomerEmailAlertApiStubs(page);
    await captureLogsScreenshots(page);
    await captureUpdateScreenshots(page);
  });
});
