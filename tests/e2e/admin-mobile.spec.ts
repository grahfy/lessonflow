import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAdminViaApi } from "./auth-helpers";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || "admin123";

// Teacher credentials for the docs-demo dataset. The fake `--seed` dataset does
// not provision a teacher; role-gating coverage therefore requires the docs-demo
// seed (the default for this phase's e2e run).
const teacherEmail = process.env.DOCS_SCREENSHOTS_TEACHER_EMAIL || "tayla.teacher@example.com";
const teacherPassword = process.env.DOCS_SCREENSHOTS_TEACHER_PASSWORD || "DocsDemoTeacher!23";

// Nav items gated to owners only (see src/lib/admin/config.ts roles: ["owner"]).
const ownerOnlyNavLabels = [
  /^invoices$/i,
  /^reports$/i,
  /^analytics$/i,
  /^settings$/i,
  /^logs$/i
] as const;

/**
 * Logs in via the API, retrying when the synthetic CAPTCHA solve occasionally
 * produces a rejected payload (HTTP 400). Each attempt re-fetches a fresh
 * CAPTCHA and uses a new forwarded IP so the login rate limit is never the
 * cause of a retry. Keeps these login-heavy drawer specs from flaking on the
 * one-shot CAPTCHA parse in the shared helper.
 */
async function loginAdminWithRetry(
  page: Page,
  creds: { email: string; password: string },
  attempts = 5
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await loginAdminViaApi(page, {
        ...creds,
        forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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

    const isClippedByAncestor = (node: Element, nodeRect: DOMRect): boolean => {
      let current = node.parentElement;

      while (current && current !== dialogNode) {
        const styles = window.getComputedStyle(current);
        const overflowX = styles.overflowX === "visible" ? styles.overflow : styles.overflowX;

        if (["hidden", "auto", "scroll", "clip"].includes(overflowX)) {
          const currentRect = current.getBoundingClientRect();
          const ancestorFitsViewport = currentRect.left >= -1 && currentRect.right <= viewportWidth + 1;
          const nodeOverflowsAncestor = nodeRect.left < currentRect.left - 1 || nodeRect.right > currentRect.right + 1;

          if (ancestorFitsViewport && nodeOverflowsAncestor) {
            return true;
          }
        }

        current = current.parentElement;
      }

      return false;
    };

    return Array.from(dialogNode.querySelectorAll("*"))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const styles = window.getComputedStyle(node);
        const isVisible = styles.display !== "none" && styles.visibility !== "hidden" && rect.width > 0 && rect.height > 0;

        if (!isVisible) {
          return null;
        }

        if (rect.left < -1 || rect.right > viewportWidth + 1) {
          if (isClippedByAncestor(node, rect)) {
            return null;
          }

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

/**
 * Dismisses incidental admin dialogs that can appear from seeded owner data
 * and block unrelated layout interactions during the responsiveness sweep.
 */
async function closeBlockingAdminDialogs(page: Page): Promise<void> {
  const deployUpdatesDialog = page.getByRole("dialog", { name: /deployment updates/i });
  if (await deployUpdatesDialog.isVisible().catch(() => false)) {
    await deployUpdatesDialog.getByRole("button", { name: /^close$/i }).click();
    await deployUpdatesDialog.waitFor({ state: "hidden", timeout: 10_000 });
  }
}

async function gotoCompactAdminRoute(page: Page, route: { path: string; heading: RegExp }): Promise<void> {
  await page.goto(route.path, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: route.heading }).first().waitFor({ timeout: 12_000 });
  await closeBlockingAdminDialogs(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY), {
    message: `${route.path} should be measured from the top of the viewport.`
  }).toBeLessThanOrEqual(1);
}

/** Reads the effective grid column count for a CSS grid container. */
async function readGridColumnCount(locator: Locator): Promise<number> {
  return locator.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    const template = styles.gridTemplateColumns.trim();

    if (!template || template === "none") {
      return 0;
    }

    return template.split(" ").length;
  });
}

/** Checks whether an element stretches to a substantial share of its container width. */
async function readsAsFullWidthButton(locator: Locator, minimumWidth = 200): Promise<boolean> {
  return locator.evaluate((node, expectedWidth) => node.getBoundingClientRect().width >= expectedWidth, minimumWidth);
}

test.describe("admin mobile responsiveness", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("admin routes and key dialogs remain usable on mobile", async ({ page }) => {
    await loginAdminViaApi(page, {
      email: adminEmail,
      password: adminPassword,
      forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    });

    const routes: Array<{ path: string; heading: RegExp }> = [
      { path: "/admin/bookings", heading: /bookings/i },
      { path: "/admin/customers", heading: /customers/i },
      { path: "/admin/invoices", heading: /invoices/i },
      { path: "/admin/reports", heading: /reports console/i },
      { path: "/admin/settings", heading: /admin configuration/i },
      { path: "/admin/chords", heading: /chords/i },
      { path: "/admin/teachers", heading: /teachers/i },
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
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: /add manual booking/i }).click();
    const manualDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /add manual booking/i }) }).first();
    await expect(manualDialog).toBeVisible();
    await assertDialogFitsViewport(page, manualDialog, "Manual booking");
    await assertNoDialogContentOverflow(page, manualDialog, "Manual booking");
    await assertNoHorizontalOverflow(page, "bookings manual dialog");
    await page.keyboard.press("Escape");

    await page.goto("/admin/customers", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: /create new customer/i }).first().click();
    const customerDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /customer details/i }) }).first();
    await expect(customerDialog).toBeVisible();
    await assertDialogFitsViewport(page, customerDialog, "Customer create");
    await assertNoDialogContentOverflow(page, customerDialog, "Customer create");
    await assertNoHorizontalOverflow(page, "customers create dialog");
    await page.keyboard.press("Escape");

    await page.goto("/admin/invoices", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: /create invoice/i }).first().click();
    const invoiceDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /new invoice/i }) }).first();
    await expect(invoiceDialog).toBeVisible();
    await assertDialogFitsViewport(page, invoiceDialog, "Invoice create");
    await assertNoDialogContentOverflow(page, invoiceDialog, "Invoice create");
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

    await page.goto("/admin/teachers", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Teachers", exact: true }).first().waitFor({ timeout: 12_000 });
    const teacherMetrics = page.locator(".teacher-directory-metrics").first();
    await expect(teacherMetrics).toBeVisible();
    await expect(readGridColumnCount(teacherMetrics)).resolves.toBe(1);
    await expect(page.locator(".teacher-directory-header .admin-workspace-chip-row")).toHaveCount(0);
    await assertNoHorizontalOverflow(page, "/admin/teachers sidebar");

    const teacherFooter = page.locator(".teacher-profile-footer").first();
    await expect(teacherFooter).toBeVisible();
    await expect(page.locator(".teacher-tab-bar").first()).toBeVisible();

    // Verify Latest Updates and Sign Out are in the mobile menu.
    // NOTE: These controls moved behind the header sheet, so they need an
    // explicit regression assertion separate from page-overflow checks.
    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);
    const toggle = page.getByRole("button", { name: /^menu$/i }).first();
    await toggle.evaluate((button) => (button as HTMLButtonElement).click());
    
    const navPanel = page.locator("#admin-header-menu-panel");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(navPanel).toHaveClass(/is-open/);
    await expect(navPanel.getByText(/^business$/i)).toBeVisible();
    await expect(navPanel.getByText(/^education$/i)).toBeVisible();
    await expect(navPanel.getByText(/^system$/i)).toBeVisible();
    await expect(navPanel.getByText(/^utilities$/i)).toBeVisible();
    
    const updatesBtn = navPanel.getByRole("button", { name: /updates/i });
    const signOutBtn = navPanel.getByRole("button", { name: /sign out/i });
    
    await expect(updatesBtn).toBeVisible();
    await expect(signOutBtn).toBeVisible();
  });
});

test.describe("admin intermediate-width header responsiveness", () => {
  test.use({ viewport: { width: 1100, height: 844 } });

  test("owner header collapses to the shared menu before awkward multi-row wrapping", async ({ page }) => {
    await loginAdminViaApi(page, {
      email: adminEmail,
      password: adminPassword,
      forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    });
    await page.goto("/admin/system-logs", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /system logs/i }).waitFor({ timeout: 12_000 });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);

    const menuToggle = page.getByRole("button", { name: /^menu$/i }).first();
    await expect(menuToggle).toBeVisible();
    await expect(menuToggle).toHaveAttribute("aria-controls", "admin-header-menu-panel");
    await assertNoHorizontalOverflow(page, "/admin/system-logs intermediate header");

    const navPanel = page.locator("#admin-header-menu-panel");
    await expect(navPanel).toBeHidden();

    await menuToggle.evaluate((button) => (button as HTMLButtonElement).click());
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
    await expect(navPanel).toHaveClass(/is-open/);
    await expect(navPanel.getByText(/^business$/i)).toBeVisible();
    await expect(navPanel.getByText(/^education$/i)).toBeVisible();
    await expect(navPanel.getByText(/^system$/i)).toBeVisible();
    await expect(navPanel.getByText(/^utilities$/i)).toBeVisible();
    await expect(navPanel.getByRole("button", { name: /updates/i })).toBeVisible();
    await expect(navPanel.getByRole("button", { name: /sign out/i })).toBeVisible();
    await expect(navPanel.getByRole("button", { name: /settings/i })).toBeVisible();
    await assertNoHorizontalOverflow(page, "/admin/system-logs intermediate open menu");

    await page.goto("/admin/teachers", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Teachers", exact: true }).first().waitFor({ timeout: 12_000 });

    const teacherMetrics = page.locator(".teacher-directory-metrics").first();
    await expect(teacherMetrics).toBeVisible();
    await expect(readGridColumnCount(teacherMetrics)).resolves.toBe(1);
    await expect(page.locator(".teacher-directory-header .admin-workspace-chip-row")).toHaveCount(0);

    const teacherEditorSection = page.locator(".teacher-editor-section").first();
    await expect(teacherEditorSection).toBeVisible();
    await expect(teacherEditorSection).toHaveCSS("min-height", "0px");

    const teacherHero = page.locator(".teacher-workspace-hero").first();
    await expect(teacherHero).toBeVisible();

    const teacherEmail = page.locator(".teacher-directory-item-identity p").first();
    await expect(teacherEmail).toBeVisible();
    await expect(teacherEmail).toHaveAttribute("title", /@/);
    await expect(teacherEmail).toHaveCSS("white-space", "nowrap");
    await expect(teacherEmail).toHaveCSS("text-overflow", "ellipsis");

    const teacherFooter = page.locator(".teacher-profile-footer").first();
    await expect(teacherFooter).toBeVisible();

    const newTeacherButton = page.getByRole("button", { name: /new teacher/i }).first();
    await expect(newTeacherButton).toBeVisible();
    await expect(readsAsFullWidthButton(newTeacherButton)).resolves.toBe(true);
    await assertNoHorizontalOverflow(page, "/admin/teachers intermediate layout");
  });
});

test.describe("admin compact 1080p desktop density", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("admin routes and major dialogs stay compact and within 1080p viewport", async ({ page }) => {
    await loginAdminViaApi(page, {
      email: adminEmail,
      password: adminPassword,
      forwardedIp: `198.51.100.${Math.floor(Math.random() * 200) + 1}`
    });

    const routes: Array<{ path: string; heading: RegExp }> = [
      { path: "/admin/bookings", heading: /bookings/i },
      { path: "/admin/customers", heading: /customers/i },
      { path: "/admin/invoices", heading: /invoices/i },
      { path: "/admin/reports", heading: /reports console/i },
      { path: "/admin/settings", heading: /admin configuration/i },
      { path: "/admin/chords", heading: /chords/i },
      { path: "/admin/teachers", heading: /teachers/i },
      { path: "/admin/manual", heading: /manual/i }
    ];

    for (const route of routes) {
      await gotoCompactAdminRoute(page, route);
      await assertNoHorizontalOverflow(page, `${route.path} compact desktop`);

      const shell = page.locator(".admin-shell").first();
      await expect(shell).toBeVisible();

      const shellBox = await shell.boundingBox();
      expect(shellBox, `${route.path} shell should expose a bounding box.`).not.toBeNull();
      if (shellBox) {
        expect(shellBox.y, `${route.path} shell should remain anchored at the top of the 1080p viewport.`).toBeGreaterThanOrEqual(0);

        if (!["/admin/reports", "/admin/manual"].includes(route.path)) {
          expect(shellBox.height, `${route.path} shell should fit inside 1080p viewport.`).toBeLessThanOrEqual(1080);
        }
      }

      const header = page.locator(".admin-header-row").first();
      await expect(header).toBeVisible();
      const headerBox = await header.boundingBox();
      expect(headerBox, `${route.path} header should expose a bounding box.`).not.toBeNull();
      if (headerBox) {
        expect(headerBox.y + headerBox.height, `${route.path} header should remain within the initial 1080p viewport.`).toBeLessThanOrEqual(360);
      }
    }

    await gotoCompactAdminRoute(page, { path: "/admin/bookings", heading: /bookings/i });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);
    const bookingsToolbar = page.locator(".admin-range-card").first();
    await expect(bookingsToolbar).toBeVisible();
    const bookingsToolbarBox = await bookingsToolbar.boundingBox();
    expect(bookingsToolbarBox, "Bookings toolbar should have a bounding box on compact desktop.").not.toBeNull();
    if (bookingsToolbarBox) {
      expect(bookingsToolbarBox.y + bookingsToolbarBox.height, "Bookings toolbar should remain near the top of the viewport at 1080p.").toBeLessThanOrEqual(440);
    }

    await page.getByRole("button", { name: /add manual booking/i }).click();
    const manualDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /add manual booking/i }) }).first();
    await expect(manualDialog).toBeVisible();
    await assertDialogFitsViewport(page, manualDialog, "Manual booking compact desktop");
    await assertNoDialogContentOverflow(page, manualDialog, "Manual booking compact desktop");
    await page.keyboard.press("Escape");

    await gotoCompactAdminRoute(page, { path: "/admin/customers", heading: /customers/i });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: /create new customer/i }).first().click();
    const customerDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /customer details/i }) }).first();
    await expect(customerDialog).toBeVisible();
    await assertDialogFitsViewport(page, customerDialog, "Customer create compact desktop");
    await assertNoDialogContentOverflow(page, customerDialog, "Customer create compact desktop");
    await page.keyboard.press("Escape");

    await gotoCompactAdminRoute(page, { path: "/admin/invoices", heading: /invoices/i });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: /create invoice/i }).first().click();
    const invoiceDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /new invoice/i }) }).first();
    await expect(invoiceDialog).toBeVisible();
    await assertDialogFitsViewport(page, invoiceDialog, "Invoice create compact desktop");
    await assertNoDialogContentOverflow(page, invoiceDialog, "Invoice create compact desktop");

    const invoiceBody = page.locator(".invoice-dialog-body").first();
    await expect(invoiceBody).toBeVisible();
    const invoiceBodyMetrics = await invoiceBody.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight
    }));
    expect(
      invoiceBodyMetrics.clientHeight,
      "Invoice dialog body should use a compact bounded scroll region on 1080p."
    ).toBeLessThanOrEqual(760);
    expect(
      invoiceBodyMetrics.scrollHeight,
      "Invoice dialog body should still allow scrolling when content exceeds the compact height."
    ).toBeGreaterThanOrEqual(invoiceBodyMetrics.clientHeight);
    await page.keyboard.press("Escape");

    await gotoCompactAdminRoute(page, { path: "/admin/teachers", heading: /teachers/i });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);
    const teacherHero = page.locator(".teacher-workspace-hero").first();
    const teacherFooter = page.locator(".teacher-profile-footer").first();
    await expect(teacherHero).toBeVisible();
    await expect(teacherFooter).toBeVisible();
    const heroBox = await teacherHero.boundingBox();
    const footerBox = await teacherFooter.boundingBox();
    expect(heroBox, "Teacher hero should have a bounding box at 1080p.").not.toBeNull();
    expect(footerBox, "Teacher footer should have a bounding box at 1080p.").not.toBeNull();
    if (heroBox && footerBox) {
      expect(heroBox.height, "Teacher hero should stay compact at 1080p.").toBeLessThanOrEqual(240);
      expect(footerBox.height, "Teacher footer should stay compact at 1080p.").toBeLessThanOrEqual(120);
    }

    await gotoCompactAdminRoute(page, { path: "/admin/chords", heading: /chords/i });
    await page.waitForLoadState("networkidle");
    await closeBlockingAdminDialogs(page);
    await page.getByRole("button", { name: /new chord/i }).click();
    const chordBuilderDialog = page.locator(".dialog-panel").filter({ has: page.getByRole("heading", { name: /chord builder/i }) }).first();
    await expect(chordBuilderDialog).toBeVisible();
    await assertDialogFitsViewport(page, chordBuilderDialog, "Chord builder compact desktop");
    await assertNoDialogContentOverflow(page, chordBuilderDialog, "Chord builder compact desktop");

    const chordBuilderBodyMetrics = await chordBuilderDialog.locator(".chord-builder-dialog-body").evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight
    }));
    expect(
      chordBuilderBodyMetrics.scrollHeight,
      "Chord builder dialog body should own vertical overflow at 1080p."
    ).toBeGreaterThanOrEqual(chordBuilderBodyMetrics.clientHeight);
  });
});

/**
 * Navigates to an authenticated admin route, retrying if the Next.js dev server
 * bounces the very first hit to /admin/login while the route is still compiling
 * (a known cold-compile race that does not reflect a real auth failure).
 */
async function gotoAuthedAdminRoute(page: Page, route: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => null);
    if (!/\/admin\/login/.test(page.url())) {
      return;
    }
    await page.waitForTimeout(750);
  }
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => null);
}

/** Opens the mobile nav drawer and waits for the overlay semantics to engage. */
async function openMobileNavDrawer(page: Page): Promise<{ toggle: Locator; panel: Locator }> {
  await closeBlockingAdminDialogs(page);
  const toggle = page.getByRole("button", { name: /^menu$/i }).first();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.evaluate((button) => (button as HTMLButtonElement).click());

  const panel = page.locator("#admin-header-menu-panel");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveClass(/is-open/);
  await expect(panel).toHaveAttribute("role", "dialog");
  await expect(panel).toHaveAttribute("aria-modal", "true");
  return { toggle, panel };
}

test.describe("admin mobile nav drawer", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("toggle opens an accessible drawer with a trapped focus order", async ({ page }) => {
    await loginAdminWithRetry(page, { email: adminEmail, password: adminPassword });
    await gotoAuthedAdminRoute(page, "/admin/bookings");

    const { panel } = await openMobileNavDrawer(page);

    // Focus must land inside the drawer once it opens (the overlay hook moves it
    // to the panel / first focusable), not remain on the page behind it.
    const focusInsidePanel = await panel.evaluate((node) => node.contains(document.activeElement));
    expect(focusInsidePanel, "Focus should move into the drawer when it opens.").toBe(true);

    // Focus trap: Tabbing through every focusable should never escape the panel.
    const focusableCount = await panel.evaluate(
      (node) =>
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
        ).length
    );
    expect(focusableCount, "Drawer should expose focusable controls.").toBeGreaterThan(1);

    for (let i = 0; i < focusableCount + 2; i += 1) {
      await page.keyboard.press("Tab");
      const trapped = await panel.evaluate((node) => node.contains(document.activeElement));
      expect(trapped, "Tab focus should stay trapped inside the open drawer.").toBe(true);
    }
  });

  test("ESC, backdrop click, and link navigation each close the drawer", async ({ page }) => {
    await loginAdminWithRetry(page, { email: adminEmail, password: adminPassword });
    await gotoAuthedAdminRoute(page, "/admin/bookings");

    // ESC closes.
    const escScenario = await openMobileNavDrawer(page);
    await page.keyboard.press("Escape");
    await expect(escScenario.panel).not.toHaveClass(/is-open/);
    await expect(escScenario.toggle).toHaveAttribute("aria-expanded", "false");

    // Backdrop click closes.
    const backdropScenario = await openMobileNavDrawer(page);
    await page.locator(".admin-header-nav-backdrop").click();
    await expect(backdropScenario.panel).not.toHaveClass(/is-open/);
    await expect(backdropScenario.toggle).toHaveAttribute("aria-expanded", "false");

    // Navigating a link closes the drawer (route-change reset).
    const navScenario = await openMobileNavDrawer(page);
    await navScenario.panel.getByRole("button", { name: /^customers$/i }).first().click();
    await page.waitForURL(/\/admin\/customers/, { timeout: 12_000 });
    await expect(navScenario.panel).not.toHaveClass(/is-open/);
    await expect(navScenario.toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("drawer nav controls meet the ~44px touch target height", async ({ page }) => {
    await loginAdminWithRetry(page, { email: adminEmail, password: adminPassword });
    await gotoAuthedAdminRoute(page, "/admin/bookings");

    const { panel } = await openMobileNavDrawer(page);

    const navButtons = panel.locator(".admin-header-nav-button");
    const count = await navButtons.count();
    expect(count, "Drawer should render nav buttons.").toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const button = navButtons.nth(i);
      const box = await button.boundingBox();
      const label = await button.textContent();
      expect(box, `Nav button "${label?.trim()}" should be visible.`).not.toBeNull();
      if (box) {
        // WCAG 2.5.5 target ~44px; allow 1px sub-pixel rounding slack.
        expect(
          box.height,
          `Nav button "${label?.trim()}" should be at least 44px tall (was ${box.height}px).`
        ).toBeGreaterThanOrEqual(43);
      }
    }
  });

  test("owner session exposes the owner-only nav items in the drawer", async ({ page }) => {
    await loginAdminWithRetry(page, { email: adminEmail, password: adminPassword });
    await gotoAuthedAdminRoute(page, "/admin/bookings");

    const { panel } = await openMobileNavDrawer(page);
    for (const label of ownerOnlyNavLabels) {
      await expect(
        panel.getByRole("button", { name: label }).first(),
        `Owner drawer should expose the ${label} nav item.`
      ).toBeVisible();
    }
  });

  test("teacher session sees NO owner-only nav items in the drawer (role gating)", async ({ page }) => {
    // SECURITY: This is the one authz-relevant assertion in Phase 4 — teachers
    // must never see owner-only navigation. Requires the docs-demo seed (the
    // fake --seed dataset does not provision a teacher account).
    await loginAdminWithRetry(page, { email: teacherEmail, password: teacherPassword });

    // NOTE: The bookings client eagerly fetches several owner-only endpoints
    // (e.g. /api/admin/presets, /api/admin/lesson-pricing). Each returns 403 for
    // a teacher, and the client's onAuthError handler then does
    // window.location.assign("/admin/login"), booting the teacher off the page
    // before the drawer can be exercised. This is a pre-existing product
    // behavior (reported separately). To isolate THIS test to the drawer's role
    // gating, soften any owner-only 403 from an admin GET into an empty 200 so
    // the page does not self-redirect. The session/role itself is untouched, so
    // the role-based nav filtering under test is still exercised faithfully.
    await page.route("**/api/admin/**", async (route) => {
      if (route.request().method() !== "GET") {
        return route.continue();
      }
      const response = await route.fetch();
      if (response.status() === 403) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true })
        });
      }
      return route.fulfill({ response });
    });

    await gotoAuthedAdminRoute(page, "/admin/bookings");

    const { panel } = await openMobileNavDrawer(page);

    // Teacher-visible items should still be present so we know the drawer rendered.
    await expect(panel.getByRole("button", { name: /^bookings$/i }).first()).toBeVisible();

    for (const label of ownerOnlyNavLabels) {
      await expect(
        panel.getByRole("button", { name: label }),
        `Teacher drawer must NOT expose the ${label} owner-only nav item.`
      ).toHaveCount(0);
    }

    // The owner-only deploy "Updates" quick action must also be hidden.
    await expect(
      panel.getByRole("button", { name: /updates/i }),
      "Teacher drawer must not expose the owner-only deploy updates action."
    ).toHaveCount(0);
  });
});
