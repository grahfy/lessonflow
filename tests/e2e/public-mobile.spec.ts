import { expect, test, type Locator, type Page } from "@playwright/test";

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth - window.innerWidth
  }));

  expect(
    metrics.overflow,
    `${label} overflowed by ${metrics.overflow}px (document ${metrics.documentWidth}px vs viewport ${metrics.viewportWidth}px)`
  ).toBeLessThanOrEqual(1);
}

async function readGridColumnCount(locator: Locator): Promise<number> {
  return locator.evaluate((node) => {
    const template = window.getComputedStyle(node).gridTemplateColumns.trim();
    if (!template || template === "none") {
      return 0;
    }

    return template.split(" ").length;
  });
}

test.describe("public route mobile responsiveness", () => {
  test.use({ viewport: { width: 320, height: 844 } });

  test("public and auth entry routes stay usable on narrow phones", async ({ page }) => {
    const routes = [
      "/",
      "/lessons",
      "/teacher",
      "/videos",
      "/vouchers",
      "/contact",
      "/book",
      "/terms",
      "/privacy",
      "/terms-of-service",
      "/student/login",
      "/admin/login",
      "/this-route-does-not-exist"
    ];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => null);
      await assertNoHorizontalOverflow(page, route);
    }

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => null);
    await expect(page.locator("main.view").first()).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator(".site-nav a")).toHaveCount(8);
    expect(await readGridColumnCount(page.locator(".site-nav").first())).toBe(1);
    const footerDirection = await page.locator(".site-footer").evaluate((node) => window.getComputedStyle(node).flexDirection);
    expect(footerDirection).toBe("column");

    await page.goto("/book", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /request booking/i }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: /request booking/i })).toBeVisible();
    await expect(page.locator(".captcha-controls-row .btn").first()).toBeVisible();
    await assertNoHorizontalOverflow(page, "/book form controls");

    await page.goto("/contact", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /send message/i }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: /send message/i })).toBeVisible();
    await assertNoHorizontalOverflow(page, "/contact form controls");

    await page.goto("/student/login", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => null);
    await expect(page.getByRole("button", { name: /sign in to portal/i })).toBeVisible();
    expect(await readGridColumnCount(page.locator(".student-login-credentials-row").first())).toBe(1);
    await assertNoHorizontalOverflow(page, "/student/login credentials");

    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => null);
    await expect(page.getByRole("heading", { name: /booking console login/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
    await assertNoHorizontalOverflow(page, "/admin/login");

    await page.goto("/this-route-does-not-exist", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => null);
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /back to/i })).toBeVisible();
    await assertNoHorizontalOverflow(page, "not-found route");
  });
});
