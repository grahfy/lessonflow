/**
 * Promo popup system (promo-popup-system — AC-25..AC-45, minus the admin
 * authoring UI which has its own spec).
 *
 * Every popup used here is created through the real admin API
 * (`loginAdminViaApi` + `POST /api/admin/popups`) and deleted afterwards —
 * an enabled, untargeted popup left behind would show on every public page
 * for the next person. `createdPopupIds` is the cleanup backstop: every
 * create pushes its id there, and `afterAll` sweeps whatever is left even if
 * a test failed before reaching its own explicit delete (deleting an
 * already-deleted id just 404s, swallowed by `deletePopup`).
 *
 * `x-forwarded-for` is randomized and scoped to the admin login POST only —
 * same reasoning as gui-sweep.spec.ts: spoofing it on every request would
 * route unrelated public traffic through the geoblocking path.
 *
 * Cookie consent is pre-seeded to "accepted" via `page.addInitScript` for
 * every test except the one that specifically exercises the consent-gating
 * rule, so the other tests aren't all re-proving the same banner interaction.
 */

import { expect, test, type Page } from "@playwright/test";

import { loginAdminViaApi, loginStudentViaApi } from "./auth-helpers";

const FORWARDED_IP = `198.51.${100 + Math.floor(Math.random() * 100)}.${1 + Math.floor(Math.random() * 200)}`;

const ROLE_BY_FORM_FACTOR = { modal: "dialog", corner: "complementary", bar: "region" } as const;

const createdPopupIds: string[] = [];

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createPopup(page: Page, overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  const body = {
    title: `e2e-popup-${suffix}`,
    enabled: true,
    heading: `E2E Popup ${suffix}`,
    bodyHtml: "<p>E2E popup body text.</p>",
    formFactor: "modal",
    animation: "fade",
    delaySeconds: 0,
    repeatPolicy: "always",
    ...overrides
  };
  const response = await page.request.post("/api/admin/popups", {
    headers: { "content-type": "application/json" },
    data: body
  });
  expect(response.ok(), `popup create failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const popup = ((await response.json()) as { popup: { id: string; heading: string } }).popup;
  createdPopupIds.push(popup.id);
  return popup;
}

async function deletePopup(page: Page, id: string) {
  await page.request.delete(`/api/admin/popups/${id}`).catch(() => null);
}

/** Seeds consent as already-resolved so the delay timer starts immediately, for tests not about consent itself. */
async function acceptConsentUpfront(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("mgs_public_cookie_consent", "accepted");
  });
}

/** Waits for the active-popup fetch (and any 0s-delay timer) to have had a real chance to fire. */
async function settlePopupFetch(page: Page) {
  // Bounded deliberately. `networkidle` has no default timeout of its own, so
  // it inherits the 90s test timeout — and the dev server's HMR websocket means
  // the admin console and the student portal never reach idle at all, so the
  // `.catch()` here only runs after the test has already failed. Public pages
  // settle in well under a second; this only ever needs to be long enough for
  // the popup fetch that these pages deliberately never make.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => null);
  await page.waitForTimeout(300);
}

test.describe("promo popup system", () => {
  test.afterAll(async ({ browser }) => {
    if (createdPopupIds.length === 0) return;
    const page = await browser.newPage({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_IP } });
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    for (const id of createdPopupIds.splice(0)) {
      await deletePopup(page, id);
    }
    await page.close();
  });

  test("a popup outside its schedule window does not appear (AC-36)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const popup = await createPopup(page, { startAt: future });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await settlePopupFetch(page);
    await expect(page.getByText(popup.heading)).toHaveCount(0);
  });

  test("a popup with no start/end renders while enabled (AC-37)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    const popup = await createPopup(page, { startAt: null, endAt: null });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: popup.heading })).toBeVisible({ timeout: 10_000 });
  });

  test("a disabled popup never appears regardless of schedule (AC-38)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    const popup = await createPopup(page, { enabled: false, startAt: null, endAt: null });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await settlePopupFetch(page);
    await expect(page.getByText(popup.heading)).toHaveCount(0);
  });

  test("a path-scoped popup appears only on its target paths (AC-39)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    const popup = await createPopup(page, { targetPaths: ["/lessons"] });

    await page.goto("/lessons", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: popup.heading })).toBeVisible({ timeout: 10_000 });

    await page.goto("/contact", { waitUntil: "domcontentloaded" });
    await settlePopupFetch(page);
    await expect(page.getByText(popup.heading)).toHaveCount(0);
  });

  test("repeat policy 'once': shows the first time, not after (AC-40)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    const popup = await createPopup(page, { repeatPolicy: "once" });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: popup.heading })).toBeVisible({ timeout: 10_000 });

    // The container marks it seen (mgs_popup_last_seen:{id} in localStorage)
    // itself the moment it opens — reloading must not show it again.
    await page.reload({ waitUntil: "domcontentloaded" });
    await settlePopupFetch(page);
    await expect(page.getByText(popup.heading)).toHaveCount(0);
  });

  test("repeat policy 'session': shows once per session, not again on reload (AC-40)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    const popup = await createPopup(page, { repeatPolicy: "session" });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: popup.heading })).toBeVisible({ timeout: 10_000 });

    // Same tab/context = same sessionStorage (mgs_popup_seen_session:{id}).
    await page.reload({ waitUntil: "domcontentloaded" });
    await settlePopupFetch(page);
    await expect(page.getByText(popup.heading)).toHaveCount(0);
  });

  test("with multiple live popups exactly one renders — the most recently created (AC-41)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    const first = await createPopup(page);
    const second = await createPopup(page);
    const third = await createPopup(page); // created last — must win

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: third.heading })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(first.heading)).toHaveCount(0);
    await expect(page.getByText(second.heading)).toHaveCount(0);
  });

  test("suppressed until cookie consent is resolved, then appears (cookie-banner coexistence)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    // Deliberately no acceptConsentUpfront — this is the real first-visit state.
    const popup = await createPopup(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const consentBanner = page.getByRole("complementary", { name: "Cookie consent" });
    await expect(consentBanner).toBeVisible({ timeout: 10_000 });

    // Half 1: must stay suppressed well past the container's own 300ms poll
    // interval, not just at the instant of load — an eventual-appearance
    // check would pass even if suppression were broken.
    await page.waitForTimeout(1_500);
    await expect(page.getByText(popup.heading)).toHaveCount(0);

    // Half 2: resolving consent (Accept or Decline, either resolves it) lets it show.
    await consentBanner.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("dialog", { name: popup.heading })).toBeVisible({ timeout: 10_000 });
  });

  test("all three form factors are fully contained at 390px; the bar never covers the header (AC-45)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const formFactor of ["modal", "corner", "bar"] as const) {
      const popup = await createPopup(page, { formFactor });
      try {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        const popupLocator = page.getByRole(ROLE_BY_FORM_FACTOR[formFactor], { name: popup.heading });
        await expect(popupLocator).toBeVisible({ timeout: 10_000 });

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        }));
        expect(overflow.scrollWidth - overflow.clientWidth, `${formFactor} popup overflows horizontally`).toBeLessThanOrEqual(1);

        if (formFactor === "bar") {
          const barBox = await popupLocator.boundingBox();
          const headerBox = await page.locator(".site-header").boundingBox();
          expect(barBox && headerBox, "bar/header not laid out").toBeTruthy();
          // The bar is `position: fixed; top: 0` — content-constrained to
          // heading + one clamped line + CTA specifically so it never grows
          // tall enough to reach down past where the header begins. Assert
          // that against the header's actual rendered position, not a fixed
          // height number.
          expect(barBox!.y + barBox!.height, "bar covers the site header").toBeLessThanOrEqual(headerBox!.y);
        }
      } finally {
        await deletePopup(page, popup.id);
      }
    }
  });

  test("still appears under prefers-reduced-motion: reduce (AC-35)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const popup = await createPopup(page, { animation: "bounce" });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: popup.heading })).toBeVisible({ timeout: 10_000 });
  });

  test("never renders in the admin console or the student portal (containment)", async ({ page }) => {
    await loginAdminViaApi(page, { forwardedIp: FORWARDED_IP });
    await acceptConsentUpfront(page);
    // Untargeted and always-on — would show on every PUBLIC page, so its
    // absence here is entirely down to admin/student pages not mounting
    // SitePopupContainer at all (PublicSiteFrame only wraps public routes).
    const popup = await createPopup(page);

    await page.goto("/admin/bookings", { waitUntil: "domcontentloaded" });
    await settlePopupFetch(page);
    await expect(page.getByText(popup.heading)).toHaveCount(0);

    // Same randomised bucket the admin logins in this file use: student login
    // has its own 20-per-15-minute limiter, and sharing the default bucket with
    // the other specs in a full run exhausts it.
    await loginStudentViaApi(page, { forwardedIp: FORWARDED_IP });
    await page.goto("/student/portal", { waitUntil: "domcontentloaded" });
    await settlePopupFetch(page);
    await expect(page.getByText(popup.heading)).toHaveCount(0);
  });
});
