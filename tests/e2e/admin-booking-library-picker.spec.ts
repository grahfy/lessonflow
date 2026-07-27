import { expect, test, type Page } from "@playwright/test";

import { createCaptchaPayload, loginAdminViaApi } from "./auth-helpers";

function suffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function createBookingFixture(page: Page, token: string) {
  const firstName = `Library${token}`;
  const lastName = "Picker";
  const email = `library-picker-${token}@example.com`;
  const phone = `04${token.replace(/\D/g, "").padEnd(8, "7").slice(0, 8)}`;
  const day = 10 + Math.floor(Math.random() * 5);
  const hour = 9 + Math.floor(Math.random() * 7);
  const customerResponse = await page.request.post("/api/admin/customers", {
    data: {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      phone,
      skillLevel: "intermediate",
      houseNumber: "10",
      streetName: "Main",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070"
    }
  });
  expect(customerResponse.ok()).toBeTruthy();
  const customer = (await customerResponse.json()).customer as { id: string };

  const bookingResponse = await page.request.post("/api/admin/bookings", {
    data: {
      customerId: customer.id,
      matchResolution: "use_existing",
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email,
      phone,
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
      requestedStartAt: `2026-08-${day}T${String(hour).padStart(2, "0")}:00:00.000Z`,
      isRecurring: false
    }
  });
  const bookingBody = await bookingResponse.json();
  expect(bookingResponse.ok(), `Booking fixture create: ${JSON.stringify(bookingBody)}`).toBeTruthy();
  return { lastName, weekDate: "2026-08-10" };
}

async function createLibraryFixture(page: Page, token: string): Promise<{ title: string }> {
  const title = `Picker resource ${token}`;
  const captcha = await createCaptchaPayload(page.request, "Library fixture upload");
  const response = await page.request.post("/api/admin/library", {
    multipart: {
      title,
      captchaToken: captcha.captchaToken,
      captchaAnswer: captcha.captchaAnswer,
      file: {
        name: `picker-resource-${token}.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.from("Visual picker fixture")
      }
    }
  });
  const body = await response.json();
  expect(response.ok(), `Library fixture create: ${JSON.stringify(body)}`).toBeTruthy();
  return { title };
}

async function closeDeploymentUpdates(page: Page): Promise<void> {
  const updates = page.getByRole("dialog", { name: /deployment updates/i });
  if (await updates.isVisible().catch(() => false)) {
    await updates.getByRole("button", { name: /^close$/i }).click();
    await updates.waitFor({ state: "hidden" });
  }
}

test("opens the booking Library picker and captures its desktop layout", async ({ page }, testInfo) => {
  const token = suffix();
  await loginAdminViaApi(page, { forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}` });
  const fixture = await createBookingFixture(page, token);
  const library = await createLibraryFixture(page, token);

  await page.goto(`/admin/bookings?view=week&date=${fixture.weekDate}`, { waitUntil: "networkidle" });
  await closeDeploymentUpdates(page);
  await page.getByRole("button", { name: new RegExp(fixture.lastName, "i") }).first().click();

  const bookingDialog = page.locator("#booking-detail-dialog");
  await expect(bookingDialog).toBeVisible();
  await bookingDialog.getByRole("button", { name: /learning materials/i }).click();
  await expect(bookingDialog.getByRole("button", { name: /select from library/i })).toBeVisible();
  await bookingDialog.getByRole("button", { name: /select from library/i }).click();

  const picker = page.getByRole("dialog", { name: /select from library/i });
  await expect(picker).toBeVisible();
  await expect(picker.getByPlaceholder(/search library files/i)).toBeVisible();
  await expect(picker.getByText(library.title)).toBeVisible();
  await picker.getByRole("button", { name: new RegExp(library.title, "i") }).click();
  await picker.screenshot({ path: testInfo.outputPath("booking-library-picker.png") });
  await picker.getByRole("button", { name: /attach 1 file/i }).click();
  await expect(picker).toBeHidden();
  await expect(bookingDialog.getByText(library.title)).toBeVisible();
});
