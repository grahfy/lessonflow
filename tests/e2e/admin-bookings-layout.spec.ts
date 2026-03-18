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

  const payload = {
    email,
    password,
    website: "",
    ...captchaPayload
  };

  let response;
  try {
    response = await page.request.post("/api/admin/login", {
      data: payload
    });
  } catch (error) {
    if (!String(error).includes("ECONNRESET")) {
      throw error;
    }

    await page.waitForTimeout(500);
    response = await page.request.post("/api/admin/login", {
      data: payload
    });
  }

  expect(response.ok(), "Admin login via API should succeed for bookings layout e2e.").toBeTruthy();
}

async function getBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a visible bounding box.`).not.toBeNull();
  return box!;
}

test.describe("admin bookings desktop layout", () => {
  test.use({ viewport: { width: 1440, height: 980 } });

  test("month view keeps the toolbar fixed and exposes the bottom row via the calendar scroll region", async ({ page }) => {
    await loginAdmin(page);

    await gotoWithRetry(page, "/admin/bookings?view=month&date=2026-03-01");
    await page.getByRole("heading", { name: /bookings/i }).first().waitFor({ timeout: 12_000 });
    await waitForPageSettle(page);

    const toolbar = page.locator(".admin-range-card").first();
    const scrollRegion = page.locator(".admin-bookings-calendar-scroll").first();
    const monthGrid = page.locator(".calendar-grid.is-month").first();
    const lastMonthRowCell = monthGrid.locator(".calendar-day").nth(35);

    await expect(toolbar).toBeVisible();
    await expect(scrollRegion).toBeVisible();
    await expect(monthGrid).toBeVisible();

    const initialWindowScrollY = await page.evaluate(() => window.scrollY);
    const toolbarBefore = await getBox(toolbar, "Bookings toolbar");
    const scrollMetricsBefore = await scrollRegion.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop
    }));

    await lastMonthRowCell.scrollIntoViewIfNeeded();
    await expect(lastMonthRowCell).toBeVisible();

    const toolbarAfter = await getBox(toolbar, "Bookings toolbar after calendar scroll");
    const scrollRegionBox = await getBox(scrollRegion, "Bookings calendar scroll region");
    const targetCellBox = await getBox(lastMonthRowCell, "Last month-row calendar cell");
    const scrollMetricsAfter = await scrollRegion.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop
    }));
    const finalWindowScrollY = await page.evaluate(() => window.scrollY);

    expect(
      Math.abs(toolbarAfter.y - toolbarBefore.y),
      "Toolbar should stay fixed while the calendar region scrolls."
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(finalWindowScrollY - initialWindowScrollY),
      "Scrolling the bookings calendar should not scroll the outer page."
    ).toBeLessThanOrEqual(1);
    expect(
      targetCellBox.y,
      "Bottom month row should remain inside the calendar scroll region."
    ).toBeGreaterThanOrEqual(scrollRegionBox.y - 1);
    expect(
      targetCellBox.y + targetCellBox.height,
      "Bottom month row should not be clipped below the calendar scroll region."
    ).toBeLessThanOrEqual(scrollRegionBox.y + scrollRegionBox.height + 1);

    if (scrollMetricsBefore.scrollHeight > scrollMetricsBefore.clientHeight + 1) {
      expect(
        scrollMetricsAfter.scrollTop,
        "Scrollable month layouts should advance the dedicated calendar scroll region."
      ).toBeGreaterThan(scrollMetricsBefore.scrollTop);
    }
  });
});
