import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loginAdminViaApi } from "./auth-helpers";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || "owner@example.com";
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || "DocsDemoAdmin!23";

/**
 * Runs an axe-core scan and asserts there are no serious/critical violations.
 *
 * RATIONALE: Phase 4 scopes automated a11y enforcement to the high-severity
 * tiers so the gate is meaningful without churning on minor/moderate noise that
 * predates this phase. Violations are surfaced with their node targets so a
 * regression is debuggable from the failure message alone.
 */
async function expectNoSeriousAxeViolations(page: Page, label: string, selector?: string): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (selector) {
    builder = builder.include(selector);
  }

  const results = await builder.analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical"
  );

  const summary = blocking
    .map((violation) => {
      const nodes = violation.nodes.map((node) => node.target.join(" ")).slice(0, 4).join(", ");
      return `[${violation.impact}] ${violation.id} (${violation.help}) -> ${nodes}`;
    })
    .join("\n");

  expect(blocking, `${label} should have no serious/critical axe violations:\n${summary}`).toEqual([]);
}

/** Dismisses the seeded deployment-updates dialog so it does not skew scans. */
async function dismissDeployUpdatesDialog(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /deployment updates/i });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /^close$/i }).click({ force: true }).catch(() => null);
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);
  }
}

test.describe("axe-core accessibility scans", () => {
  test("authenticated admin surfaces have no serious/critical violations", async ({ page }) => {
    await loginAdminViaApi(page, {
      email: adminEmail,
      password: adminPassword,
      forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    });

    await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /dashboard|overview/i }).first().waitFor({ timeout: 12_000 });
    await dismissDeployUpdatesDialog(page);
    await page.waitForLoadState("networkidle").catch(() => null);
    await expectNoSeriousAxeViolations(page, "/admin/dashboard");

    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /bookings/i }).first().waitFor({ timeout: 12_000 });
    await dismissDeployUpdatesDialog(page);
    await page.waitForLoadState("networkidle").catch(() => null);
    await expectNoSeriousAxeViolations(page, "/admin/bookings");
  });

  test("public pages have no serious/critical violations", async ({ page }) => {
    await page.goto("/lessons", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 12_000 });
    await page.waitForLoadState("networkidle").catch(() => null);
    await expectNoSeriousAxeViolations(page, "/lessons");

    await page.goto("/vouchers", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 12_000 });
    await page.waitForLoadState("networkidle").catch(() => null);
    await expectNoSeriousAxeViolations(page, "/vouchers");
  });

  test("mobile nav drawer open state has no serious/critical violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAdminViaApi(page, {
      email: adminEmail,
      password: adminPassword,
      forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    });

    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /bookings/i }).first().waitFor({ timeout: 12_000 });
    await dismissDeployUpdatesDialog(page);
    await page.waitForLoadState("networkidle").catch(() => null);

    const toggle = page.getByRole("button", { name: /^menu$/i }).first();
    await toggle.evaluate((button) => (button as HTMLButtonElement).click());
    const navPanel = page.locator("#admin-header-menu-panel");
    await expect(navPanel).toHaveClass(/is-open/);

    // Scope the scan to the open drawer so the assertion targets the new overlay
    // semantics (role=dialog, aria-modal, focus order) rather than the page body.
    await expectNoSeriousAxeViolations(page, "mobile nav drawer open", "#admin-header-menu-panel");
  });
});
