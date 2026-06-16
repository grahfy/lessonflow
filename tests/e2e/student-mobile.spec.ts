import { expect, test, type Page } from "@playwright/test";

import { loginStudentViaApi } from "./auth-helpers";

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

async function waitForStudentPage(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => null);
}

test.describe("student mobile responsiveness", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("authenticated portal and materials routes remain usable on mobile", async ({ page }) => {
    test.setTimeout(180_000);

    await loginStudentViaApi(page);

    await page.goto("/student/portal", { waitUntil: "domcontentloaded" });
    await waitForStudentPage(page);
    expect(page.url()).toContain("/student/portal");
    await assertNoHorizontalOverflow(page, "/student/portal");
    await page.locator('a[href="/student/materials"]').first().waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('button:has-text("Sign out")').first().waitFor({ state: "visible", timeout: 5_000 });
    await page.locator("text=Book or cancel a lesson").first().waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('[class*="upcoming-viewport"]').first().waitFor({ state: "visible", timeout: 5_000 });

    const lessonPlanSummary = page.locator('[class*="lesson-plan-summary"]').first();
    if (await lessonPlanSummary.isVisible().catch(() => false)) {
      await expect(lessonPlanSummary).toBeVisible();
    }

    await page.goto("/student/login", { waitUntil: "domcontentloaded" });
    await waitForStudentPage(page);
    expect(page.url()).toContain("/student/portal");

    await page.locator('a[href="/student/materials"]').first().click();
    await waitForStudentPage(page);
    expect(page.url()).toContain("/student/materials");
    await assertNoHorizontalOverflow(page, "/student/materials");
    await page.locator("text=Learning materials").first().waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('a[href="/student/portal"]').first().waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('button:has-text("Sign out")').first().waitFor({ state: "visible", timeout: 5_000 });

    const driveTableDisplay = await page.locator('[class*="drive-table"]').first().evaluate((node) => {
      return window.getComputedStyle(node).display;
    });
    const driveTableHeadDisplay = await page.locator('[class*="drive-table"] thead').first().evaluate((node) => {
      return window.getComputedStyle(node).display;
    });
    expect(driveTableDisplay).toBe("block");
    expect(driveTableHeadDisplay).toBe("none");

    const materialRows = page.locator('[class*="drive-table"] tbody tr');
    await materialRows.first().waitFor({ state: "visible", timeout: 5_000 });
    await page.locator('a:has-text("Download")').first().waitFor({ state: "visible", timeout: 5_000 });

    const previewLinkCount = await page.locator('a:has-text("Preview")').count();
    const audioControlCount = await page.locator("audio").count();
    expect(previewLinkCount + audioControlCount).toBeGreaterThan(0);

    await page.locator('a[href="/student/portal"]').first().click();
    await waitForStudentPage(page);
    expect(page.url()).toContain("/student/portal");

    await page.locator('button:has-text("Sign out")').first().click();
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => null);
    expect(page.url()).toContain("/student/login");
    await page.locator('button:has-text("Sign in to portal")').first().waitFor({ state: "visible", timeout: 5_000 });
  });
});
