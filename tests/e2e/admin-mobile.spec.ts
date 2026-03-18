import { expect, test, type Locator, type Page } from "@playwright/test";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL;
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD;

/** Authenticates through the real admin API to avoid brittle form interactions in setup. */
async function loginAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

  const response = await page.request.post("/api/admin/login", {
    data: {
      email,
      password,
      website: ""
    }
  });

  expect(response.ok(), "Admin login via API should succeed for mobile e2e checks.").toBeTruthy();
}

/** Fails when the current page layout exceeds the mobile viewport width. */
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

/** Ensures the dialog bounding box stays within the mobile viewport. */
async function assertDialogFitsViewport(page: Page, dialog: Locator, label: string): Promise<void> {
  const box = await dialog.boundingBox();
  expect(box, `${label} dialog should be visible`).not.toBeNull();
  if (!box) {
    return;
  }

  const viewport = page.viewportSize();
  expect(box.x, `${label} dialog should not render off-screen on the left`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} dialog should fit inside mobile viewport width`).toBeLessThanOrEqual((viewport?.width || 390) + 1);
}

/**
 * Finds visible descendants that protrude beyond the viewport so regressions
 * can be debugged from the failing node metadata.
 */
async function assertNoDialogContentOverflow(page: Page, dialog: Locator, label: string): Promise<void> {
  const offenders = await dialog.evaluate((dialogNode) => {
    const viewportWidth = window.innerWidth;

    return Array.from(dialogNode.querySelectorAll("*"))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const styles = window.getComputedStyle(node);
        const isVisible = styles.display !== "none" && styles.visibility !== "hidden" && rect.width > 0 && rect.height > 0;

        if (!isVisible) {
          return null;
        }

        if (rect.left < -1 || rect.right > viewportWidth + 1) {
          const className = node instanceof HTMLElement ? node.className : (node.getAttribute("class") ?? "");

          return {
            tag: node.tagName,
            className,
            left: rect.left,
            right: rect.right,
            width: rect.width
          };
        }

        return null;
      })
      .filter((item): item is { tag: string; className: string; left: number; right: number; width: number } => item !== null)
      .slice(0, 6);
  });

  expect(offenders, `${label} has off-screen content in mobile viewport`).toHaveLength(0);
}

test.describe("admin mobile responsiveness", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("admin routes and key dialogs remain usable on mobile", async ({ page }) => {
    if (!adminEmail || !adminPassword) {
      test.skip(true, "DOCS_SCREENSHOTS_ADMIN_EMAIL/PASSWORD are required for authenticated admin mobile e2e checks.");
    }

    await loginAdmin(page, adminEmail!, adminPassword!);

    const routes: Array<{ path: string; heading: RegExp }> = [
      { path: "/admin/bookings", heading: /bookings/i },
      { path: "/admin/customers", heading: /customers/i },
      { path: "/admin/invoices", heading: /invoices/i },
      { path: "/admin/reports", heading: /reports console/i },
      { path: "/admin/settings", heading: /admin configuration/i },
      { path: "/admin/manual", heading: /manual/i }
    ];

    for (const route of routes) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: route.heading }).first().waitFor({ timeout: 12_000 });
      // RATIONALE: Route-level overflow checks catch layout regressions before
      // drilling into the more specific dialog scenarios below.
      await assertNoHorizontalOverflow(page, route.path);
    }

    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    const menuToggle = page.getByRole("button", { name: /^menu$/i }).first();
    await expect(menuToggle).toBeVisible();
    await expect(menuToggle).toHaveAttribute("aria-controls", "admin-header-menu-panel");
    await assertNoHorizontalOverflow(page, "/admin/bookings header controls");

    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /add manual booking/i }).click();
    const manualDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /add manual booking/i }) }).first();
    await expect(manualDialog).toBeVisible();
    await assertDialogFitsViewport(page, manualDialog, "Manual booking");
    await assertNoDialogContentOverflow(page, manualDialog, "Manual booking");
    await assertNoHorizontalOverflow(page, "bookings manual dialog");
    await page.keyboard.press("Escape");

    await page.goto("/admin/customers", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /create new customer/i }).first().click();
    const customerDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /customer details/i }) }).first();
    await expect(customerDialog).toBeVisible();
    await assertDialogFitsViewport(page, customerDialog, "Customer create");
    await assertNoHorizontalOverflow(page, "customers create dialog");
    await page.keyboard.press("Escape");

    await page.goto("/admin/invoices", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /create invoice/i }).first().click();
    const invoiceDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /create new invoice/i }) }).first();
    await expect(invoiceDialog).toBeVisible();
    await assertDialogFitsViewport(page, invoiceDialog, "Invoice create");
    await assertNoHorizontalOverflow(page, "invoices create dialog");
    await page.keyboard.press("Escape");

    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    const saveButton = page.getByRole("button", { name: /save configuration/i }).first();
    await saveButton.scrollIntoViewIfNeeded();
    await expect(saveButton).toBeVisible();

    const canScrollSettings = await page.evaluate(() => {
      const start = window.scrollY;
      window.scrollTo(0, document.documentElement.scrollHeight);
      const end = window.scrollY;
      return {
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        start,
        end
      };
    });

    expect(
      canScrollSettings.scrollHeight,
      "Settings should be vertically scrollable on mobile when content exceeds viewport."
    ).toBeGreaterThanOrEqual(canScrollSettings.viewportHeight);
    expect(canScrollSettings.end, "Settings page should support downward scrolling on mobile.").toBeGreaterThanOrEqual(canScrollSettings.start);
    await assertNoHorizontalOverflow(page, "/admin/settings scroll state");

    // Verify Latest Updates and Sign Out are in the mobile menu.
    // NOTE: These controls moved behind the header sheet, so they need an
    // explicit regression assertion separate from page-overflow checks.
    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    const toggle = page.getByRole("button", { name: /^menu$/i }).first();
    await toggle.click();
    
    const navPanel = page.locator("#admin-header-menu-panel");
    await expect(navPanel).toBeVisible();
    
    const latestUpdatesBtn = navPanel.getByRole("button", { name: /latest updates/i });
    const signOutBtn = navPanel.getByRole("button", { name: /sign out/i });
    
    await expect(latestUpdatesBtn).toBeVisible();
    await expect(signOutBtn).toBeVisible();
  });
});

test.describe("admin intermediate-width header responsiveness", () => {
  test.use({ viewport: { width: 1100, height: 844 } });

  test("owner header collapses to the shared menu before awkward multi-row wrapping", async ({ page }) => {
    if (!adminEmail || !adminPassword) {
      test.skip(true, "DOCS_SCREENSHOTS_ADMIN_EMAIL/PASSWORD are required for authenticated admin mobile e2e checks.");
    }

    await loginAdmin(page, adminEmail!, adminPassword!);
    await page.goto("/admin/system-logs", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /system logs/i }).waitFor({ timeout: 12_000 });

    const menuToggle = page.getByRole("button", { name: /^menu$/i }).first();
    await expect(menuToggle).toBeVisible();
    await expect(menuToggle).toHaveAttribute("aria-controls", "admin-header-menu-panel");
    await assertNoHorizontalOverflow(page, "/admin/system-logs intermediate header");

    const navPanel = page.locator("#admin-header-menu-panel");
    await expect(navPanel).toBeHidden();

    await menuToggle.click();
    await expect(navPanel).toBeVisible();
    await expect(navPanel.getByRole("button", { name: /updates/i })).toBeVisible();
    await expect(navPanel.getByRole("button", { name: /sign out/i })).toBeVisible();
    await expect(navPanel.getByRole("button", { name: /settings/i })).toBeVisible();
    await assertNoHorizontalOverflow(page, "/admin/system-logs intermediate open menu");
  });
});
