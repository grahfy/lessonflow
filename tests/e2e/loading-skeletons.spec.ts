import { expect, test, type Page } from "@playwright/test";

import { loginAdminViaApi, loginStudentViaApi } from "./auth-helpers";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || "owner@example.com";
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || "DocsDemoAdmin!23";

/**
 * Disables animations so the shimmer does not interfere with screenshots /
 * timing. Mirrors the stabilizePage() helper from docs-screenshots.spec.ts.
 */
async function stabilizePage(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          scroll-behavior: auto !important;
        }
      `
    })
    .catch(() => null);
}

test.describe("loading skeletons replace spinner/text loading states", () => {
  test("student portal shows a skeleton before data, then renders content", async ({ page }) => {
    await loginStudentViaApi(page);

    // Hold the aggregated portal payload long enough to observe the skeleton,
    // then release it so the real content can replace the placeholder. This
    // makes the pre-load -> loaded transition deterministic on a fast dev server.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/student/portal", async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto("/student/portal", { waitUntil: "domcontentloaded" });

    // Skeleton region is present and announced to assistive tech while loading.
    const skeletonRegion = page.locator(".skeleton-region").first();
    await expect(skeletonRegion).toBeVisible();
    await expect(skeletonRegion).toHaveAttribute("role", "status");
    await expect(skeletonRegion).toHaveAttribute("aria-busy", "true");
    expect(await page.locator(".skeleton-block").count()).toBeGreaterThan(0);

    // Release the payload; the skeleton must be replaced by real content.
    release();
    await expect(skeletonRegion).toHaveCount(0, { timeout: 15_000 });
    await stabilizePage(page);
    // A real portal surface (the actions panel or upcoming lessons) is now shown.
    await expect(page.locator(".admin-card").first()).toBeVisible();
  });

  test("admin bookings calendar shows a skeleton before data, then renders content", async ({ page }) => {
    await loginAdminViaApi(page, {
      email: adminEmail,
      password: adminPassword,
      forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    });

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The bookings list payload drives the calendar skeleton. Hold it open to
    // observe the placeholder, then release to confirm content replaces it.
    await page.route("**/api/admin/bookings**", async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });

    const skeleton = page.locator(".admin-bookings-calendar-skeleton, .skeleton-region").first();
    await expect(skeleton).toBeVisible({ timeout: 15_000 });
    await expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(await page.locator(".skeleton-block").count()).toBeGreaterThan(0);

    release();
    // Skeleton goes away once bookings resolve (replaced by calendar/list/empty state).
    await expect(page.locator(".admin-bookings-calendar-skeleton")).toHaveCount(0, { timeout: 20_000 });
  });
});
