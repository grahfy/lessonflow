import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAdminViaApi } from "./auth-helpers";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "owner@example.com";
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "DocsDemoAdmin!23";

function uniqueSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function createCustomerFixture(page: Page, suffix: string): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
}> {
  const firstName = `Layout${suffix}`;
  const lastName = "Viewport";
  const fullName = `${firstName} ${lastName}`;
  const email = `layout-${suffix}@example.com`;
  const phone = `04${suffix.replace(/\D/g, "").padEnd(8, "7").slice(0, 8)}`;

  const response = await page.request.post("/api/admin/customers", {
    data: {
      firstName,
      lastName,
      fullName,
      email,
      phone,
      skillLevel: "intermediate"
    }
  });

  const body = await response.json();
  expect(response.ok(), `Customer fixture create should succeed. ${JSON.stringify(body)}`).toBeTruthy();

  return {
    id: String(body.customer.id),
    firstName,
    lastName,
    fullName,
    email,
    phone
  };
}

async function createBookingFixture(
  page: Page,
  input: { customerId: string; firstName: string; lastName: string; email: string; phone: string }
): Promise<void> {
  const response = await page.request.post("/api/admin/bookings", {
    data: {
      customerId: input.customerId,
      matchResolution: "use_existing",
      firstName: input.firstName,
      lastName: input.lastName,
      name: `${input.firstName} ${input.lastName}`,
      email: input.email,
      phone: input.phone,
      unitNumber: "2",
      houseNumber: "66",
      streetName: "High",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "intermediate",
      lessonDuration: "min60",
      requestedStartAt: "2026-04-16T01:00:00.000Z",
      isRecurring: false
    }
  });

  const body = await response.json();
  expect(response.ok(), `Booking fixture create should succeed. ${JSON.stringify(body)}`).toBeTruthy();
}

async function createInvoiceFixture(
  page: Page,
  input: { customerId: string; firstName: string; lastName: string; fullName: string; email: string; phone: string }
): Promise<{ invoiceNumber: string }> {
  const response = await page.request.post("/api/admin/invoices", {
    data: {
      customerId: input.customerId,
      customerFirstName: input.firstName,
      customerLastName: input.lastName,
      customerName: input.fullName,
      customerEmail: input.email,
      customerPhone: input.phone,
      customerAddress: "66 High Street, Northcote VIC 3070",
      taxMode: "taxable",
      dueAt: "2026-04-20T01:00:00.000Z",
      lineItems: [
        {
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 9000,
          taxMode: "taxable",
          sortOrder: 0
        },
        {
          kind: "custom",
          description: "Workbook",
          quantity: 1,
          unitPriceCents: 2000,
          taxMode: "taxable",
          sortOrder: 1
        }
      ]
    }
  });

  const body = await response.json();
  expect(response.ok(), `Invoice fixture create should succeed. ${JSON.stringify(body)}`).toBeTruthy();

  return {
    invoiceNumber: String(body.invoice.invoiceNumber)
  };
}

async function getBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a bounding box.`).not.toBeNull();
  return box!;
}

async function closeBlockingAdminDialogs(page: Page): Promise<void> {
  const deployUpdatesDialog = page.getByRole("dialog", { name: /deployment updates/i });
  if (await deployUpdatesDialog.isVisible().catch(() => false)) {
    await deployUpdatesDialog.getByRole("button", { name: /^close$/i }).click();
    await deployUpdatesDialog.waitFor({ state: "hidden", timeout: 10_000 });
  }
}

test.describe("admin detail dialog layout", () => {
  test.use({ viewport: { width: 960, height: 768 } });

  test("booking detail appointment tab fits inside the modal body without inner vertical scrolling", async ({ page }) => {
    const suffix = uniqueSuffix();

    await page.setViewportSize({ width: 1365, height: 768 });
    await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
    const customer = await createCustomerFixture(page, suffix);
    await createBookingFixture(page, {
      customerId: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone
    });

    await page.goto("/admin/bookings?view=week&date=2026-04-13", { waitUntil: "networkidle" });
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: new RegExp(customer.lastName, "i") }).first().click();

    const dialog = page.locator("#booking-detail-dialog");
    await expect(dialog).toBeVisible();

    const metrics = await dialog.evaluate((node) => {
      const body = node.querySelector(".dialog-body-scroll") as HTMLElement | null;
      const panel = node.querySelector(".booking-appointment-panel") as HTMLElement | null;
      const footer = node.querySelector(".dialog-footer") as HTMLElement | null;

      return {
        body: body ? { clientHeight: body.clientHeight, scrollHeight: body.scrollHeight } : null,
        panel: panel ? { clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight } : null,
        footerTop: footer ? footer.getBoundingClientRect().top : null,
        panelBottom: panel ? panel.getBoundingClientRect().bottom : null
      };
    });

    expect(metrics.body).not.toBeNull();
    expect(metrics.panel).not.toBeNull();
    expect((metrics.body?.scrollHeight ?? 0) - (metrics.body?.clientHeight ?? 0)).toBeLessThanOrEqual(2);
    expect((metrics.panel?.scrollHeight ?? 0) - (metrics.panel?.clientHeight ?? 0)).toBeLessThanOrEqual(2);
    expect((metrics.panelBottom ?? 0) - (metrics.footerTop ?? 0)).toBeLessThanOrEqual(1);
  });

  test("customer lesson history keeps the same modal height envelope as the profile tab", async ({ page }) => {
    const suffix = uniqueSuffix();

    await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
    const customer = await createCustomerFixture(page, suffix);
    await createBookingFixture(page, {
      customerId: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone
    });

    await page.goto(`/admin/customers?q=${encodeURIComponent(customer.email)}`, { waitUntil: "networkidle" });
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: new RegExp(`Open customer ${customer.lastName}`, "i") }).first().click();

    const dialog = page.locator("#customer-dialog");
    await expect(dialog).toBeVisible();

    const profilePanel = dialog.locator(".customer-dialog-panel").first();
    await expect(profilePanel).toBeVisible();
    const profileBox = await getBox(profilePanel, "Customer profile panel");

    await dialog.getByRole("button", { name: /lesson history/i }).click();
    const historyPanel = dialog.locator(".customer-booking-history-panel").first();
    await expect(historyPanel).toBeVisible();
    const historyBox = await getBox(historyPanel, "Customer history panel");

    expect(Math.abs(historyBox.height - profileBox.height)).toBeLessThanOrEqual(2);
  });

  test("invoice detail uses the dialog body as its vertical scroll region and keeps the footer visible", async ({ page }) => {
    const suffix = uniqueSuffix();

    await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
    const customer = await createCustomerFixture(page, suffix);
    const invoice = await createInvoiceFixture(page, {
      customerId: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone
    });

    await page.goto(`/admin/invoices?q=${encodeURIComponent(invoice.invoiceNumber)}`, { waitUntil: "networkidle" });
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: new RegExp(invoice.invoiceNumber) }).first().click();

    const dialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: new RegExp(invoice.invoiceNumber) }) }).first();
    await expect(dialog).toBeVisible();

    const metrics = await dialog.evaluate((node) => {
      const body = node.querySelector(".dialog-body-scroll") as HTMLElement | null;
      const invoiceBody = node.querySelector(".invoice-dialog-body") as HTMLElement | null;
      const footer = node.querySelector(".dialog-footer") as HTMLElement | null;

      return {
        body: body ? { clientHeight: body.clientHeight, scrollHeight: body.scrollHeight } : null,
        invoiceBody: invoiceBody
          ? {
              clientHeight: invoiceBody.clientHeight,
              scrollHeight: invoiceBody.scrollHeight,
              overflowY: getComputedStyle(invoiceBody).overflowY
            }
          : null,
        invoiceBodyBottom: invoiceBody ? invoiceBody.getBoundingClientRect().bottom : null,
        footerTop: footer ? footer.getBoundingClientRect().top : null
      };
    });

    expect(metrics.body).not.toBeNull();
    expect(metrics.invoiceBody).not.toBeNull();
    expect((metrics.body?.scrollHeight ?? 0) - (metrics.body?.clientHeight ?? 0)).toBeLessThanOrEqual(2);
    expect(metrics.invoiceBody?.overflowY).toBe("auto");
    expect((metrics.invoiceBody?.scrollHeight ?? 0) - (metrics.invoiceBody?.clientHeight ?? 0)).toBeGreaterThan(0);
    expect((metrics.invoiceBodyBottom ?? 0) - (metrics.footerTop ?? 0)).toBeLessThanOrEqual(1);
  });
});
