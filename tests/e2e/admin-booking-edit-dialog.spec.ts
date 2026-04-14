import { expect, test, type Page } from "@playwright/test";

import { loginAdminViaApi } from "./auth-helpers";

function uniqueSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function createCustomerFixture(page: Page, suffix: string) {
  const firstName = `Edit${suffix}`;
  const lastName = "Dialog";
  const email = `edit-${suffix}@example.com`;
  const phone = `04${suffix.replace(/\D/g, "").padEnd(8, "7").slice(0, 8)}`;

  const response = await page.request.post("/api/admin/customers", {
    data: {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      phone,
      skillLevel: "intermediate"
    }
  });
  const body = await response.json();
  expect(response.ok(), `Customer fixture create: ${JSON.stringify(body)}`).toBeTruthy();
  return { id: String(body.customer.id), firstName, lastName, email, phone };
}

async function createBookingFixture(
  page: Page,
  input: { customerId: string; firstName: string; lastName: string; email: string; phone: string }
) {
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
  expect(response.ok(), `Booking fixture create: ${JSON.stringify(body)}`).toBeTruthy();
}

async function closeBlockingDialogs(page: Page): Promise<void> {
  const deployUpdates = page.getByRole("dialog", { name: /deployment updates/i });
  if (await deployUpdates.isVisible().catch(() => false)) {
    await deployUpdates.getByRole("button", { name: /^close$/i }).click();
    await deployUpdates.waitFor({ state: "hidden", timeout: 10_000 });
  }
}

test.describe("admin booking edit dialog", () => {
  test.use({ viewport: { width: 1365, height: 768 } });

  test("Move Lesson Time and Cancel Booking are visible in the footer on the Appointment tab", async ({ page }) => {
    const suffix = uniqueSuffix();

    await loginAdminViaApi(page);
    const customer = await createCustomerFixture(page, suffix);
    await createBookingFixture(page, {
      customerId: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone
    });

    await page.goto("/admin/bookings?view=week&date=2026-04-13", { waitUntil: "networkidle" });
    await closeBlockingDialogs(page);
    await page.getByRole("button", { name: new RegExp(customer.lastName, "i") }).first().click();

    const dialog = page.locator("#booking-detail-dialog");
    await expect(dialog).toBeVisible();

    const footer = dialog.locator(".dialog-footer");
    await expect(footer.getByRole("button", { name: /move lesson time/i })).toBeVisible();
    await expect(footer.getByRole("button", { name: /cancel booking/i })).toBeVisible();
    await expect(footer.getByRole("button", { name: /save changes/i })).toBeVisible();

    // No stray action row inside the notes column anymore.
    await expect(dialog.locator(".booking-notes-actions")).toHaveCount(0);
  });

  test("Save Changes after touching only notes succeeds without 'Invalid edit payload'", async ({ page }) => {
    const suffix = uniqueSuffix();

    await loginAdminViaApi(page);
    const customer = await createCustomerFixture(page, suffix);
    await createBookingFixture(page, {
      customerId: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone
    });

    await page.goto("/admin/bookings?view=week&date=2026-04-13", { waitUntil: "networkidle" });
    await closeBlockingDialogs(page);
    await page.getByRole("button", { name: new RegExp(customer.lastName, "i") }).first().click();

    const dialog = page.locator("#booking-detail-dialog");
    await expect(dialog).toBeVisible();

    // Type into the TipTap notes editor.
    const editor = dialog.locator(".booking-notes-editor [contenteditable='true']").first();
    await editor.click();
    await editor.type(`note-${suffix}`);

    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/admin/bookings/") &&
          resp.request().method() === "PATCH" &&
          !resp.url().endsWith("/requests")
      ),
      dialog.getByRole("button", { name: /save changes/i }).click()
    ]);

    expect(
      response.ok(),
      `PATCH booking edit should succeed, got ${response.status()} ${await response.text().catch(() => "")}`
    ).toBeTruthy();

    const responseBody = await response.json().catch(() => null);
    expect(responseBody).toMatchObject({ ok: true });

    // No error toast containing 'Invalid edit payload'.
    await expect(page.getByText(/invalid edit payload/i)).toHaveCount(0);
  });
});
