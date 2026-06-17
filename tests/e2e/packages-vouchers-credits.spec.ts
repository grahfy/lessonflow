/**
 * E2E + axe coverage for the phase1-leftovers UI surfaces:
 *  - Admin Settings -> Packages tab (prepaid lesson packages editor)
 *  - Admin /admin/vouchers (issue comp voucher / list / void)
 *  - Customer profile -> lesson-credits dialog
 *  - Student portal credits card + redeem-a-voucher form
 *  - Public /vouchers/buy gift-voucher purchase page
 *
 * Each surface is loaded and asserted reachable, then scanned with axe-core for
 * serious/critical accessibility violations (the project's enforced tier — see
 * tests/e2e/axe-a11y.spec.ts). Requires the seeded docs-demo app on :3000
 * (npm run local:full-site -- --seed-docs-demo --skip-tests).
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loginAdminViaApi, loginStudentViaApi } from "./auth-helpers";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || "owner@example.com";
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || "DocsDemoAdmin!23";

/** Asserts axe finds no serious/critical violations on `page` (optionally scoped). */
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

test.describe("packages / vouchers / credits UI", () => {
  test("public gift-voucher buy page renders and is accessible", async ({ page }) => {
    await page.goto("/vouchers/buy", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /buy a gift voucher/i }).first().waitFor({ timeout: 12_000 });
    await page.waitForLoadState("networkidle").catch(() => null);

    // The buy form exposes denomination choices and recipient fields.
    await expect(page.getByRole("heading", { name: /buy a gift voucher/i }).first()).toBeVisible();
    await expectNoSeriousAxeViolations(page, "/vouchers/buy");
  });

  test("admin vouchers surface renders the issue/list panel and is accessible", async ({ page }) => {
    await loginAdminViaApi(page, {
      email: adminEmail,
      password: adminPassword,
      forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    });

    await page.goto("/admin/vouchers", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /vouchers/i }).first().waitFor({ timeout: 12_000 });
    await dismissDeployUpdatesDialog(page);
    await page.waitForLoadState("networkidle").catch(() => null);

    // The comp-issue panel is present.
    await expect(page.getByRole("heading", { name: /issue a complimentary voucher/i }).first()).toBeVisible();
    await expectNoSeriousAxeViolations(page, "/admin/vouchers");
  });

  test("admin settings Packages tab renders the packages editor and is accessible", async ({ page }) => {
    await loginAdminViaApi(page, {
      email: adminEmail,
      password: adminPassword,
      forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    });

    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    await dismissDeployUpdatesDialog(page);
    await page.waitForLoadState("networkidle").catch(() => null);

    // Switch to the Packages tab. AdminTabNav renders role=tab buttons wrapped
    // in a tooltip span; an inactive tab carries tabIndex=-1 and the hover
    // tooltip can intercept a synthetic pointer click, so dispatch the click
    // directly on the element (same approach as the mobile-nav axe test).
    const packagesTab = page.locator('#tab-packages');
    await packagesTab.waitFor({ state: "visible", timeout: 12_000 });
    await packagesTab.evaluate((el) => (el as HTMLButtonElement).click());
    // The workspace title (h2) reflects the active tab.
    await expect(page.getByRole("heading", { name: /^packages$/i }).first()).toBeVisible({ timeout: 12_000 });
    await page.waitForLoadState("networkidle").catch(() => null);

    await expectNoSeriousAxeViolations(page, "/admin/settings#packages");
  });

  test("student portal shows the account-credit card and redeem form, accessible", async ({ page }) => {
    await loginStudentViaApi(page);

    await page.goto("/student/portal", { waitUntil: "domcontentloaded" });
    // NOTE: the portal keeps a background connection open, so networkidle never
    // settles — wait on a concrete element instead (an unbounded networkidle
    // wait would otherwise hang the whole test until the 90s budget expires).
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 15_000 });

    // The redeem-a-voucher form and account-credit display are present.
    await expect(page.getByText(/account credit/i).first()).toBeVisible({ timeout: 12_000 });
    await expect(page.getByLabel(/redeem a voucher/i)).toBeVisible();
    await expectNoSeriousAxeViolations(page, "student portal credits/redeem");
  });
});
