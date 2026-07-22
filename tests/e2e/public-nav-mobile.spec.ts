/**
 * Public nav mobile layout (public-mobile-nav component — AC-20..AC-24).
 *
 * Every layout claim is checked against real bounding-box geometry rather
 * than a computed CSS property: a `border-radius`/`flex-wrap` value can be
 * "correct" in the stylesheet while the rendered layout is still visibly
 * broken (e.g. `border-radius: 999px` reads as a giant stadium once the
 * header wraps to two rows, even though the declaration never changed).
 *
 * No login needed — these are public pages, so there is no rate-limited
 * login POST to spoof an `x-forwarded-for` header for (that convention, seen
 * in materials-dnd.spec.ts, is specific to the admin login limiter).
 *
 * Screenshots are captured as evidence per viewport (artifacts/, gitignored,
 * same convention as gui-sweep.spec.ts) via a small per-shot try/catch so a
 * capture failure is recorded rather than aborting a still-valid functional
 * assertion; the suite fails overall if any capture is missing.
 */

import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const outputDir = path.resolve(process.cwd(), "artifacts", "public-nav-mobile");

type ShotResult = { name: string; ok: boolean; note?: string };
const shotResults: ShotResult[] = [];

async function captureEvidence(page: Page, name: string) {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
    shotResults.push({ name, ok: true });
  } catch (error) {
    // Evidence capture must never invalidate the assertions above it — record
    // the miss and let the suite-level check below catch it.
    shotResults.push({ name, ok: false, note: String(error).slice(0, 200) });
  }
}

test.afterAll(() => {
  const missing = shotResults.filter((shot) => !shot.ok);
  expect(missing, `evidence screenshots failed: ${JSON.stringify(missing)}`).toEqual([]);
});

test.describe("public nav — mobile layout", () => {
  test("at 390px the nav drops below the brand onto its own centred full-width row (AC-21)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const header = page.locator(".site-header");
    const headerBox = await header.boundingBox();
    const brandBox = await page.locator(".brand").boundingBox();
    const navBox = await page.locator(".site-nav").boundingBox();
    expect(headerBox && brandBox && navBox, "header/brand/nav not laid out").toBeTruthy();

    // Own row, below the brand — not merely wrapped alongside it.
    expect(navBox!.y, "nav did not drop below the brand's row").toBeGreaterThanOrEqual(brandBox!.y + brandBox!.height - 2);
    // Full-width row: spans essentially the header's own width.
    expect(navBox!.width, "nav is not a full-width row").toBeGreaterThan(headerBox!.width * 0.85);
    // Horizontally centred: compare bounding-box centres, not a CSS property.
    const navCenterX = navBox!.x + navBox!.width / 2;
    const headerCenterX = headerBox!.x + headerBox!.width / 2;
    expect(Math.abs(navCenterX - headerCenterX), "nav is not centred in the header").toBeLessThan(4);

    await captureEvidence(page, "390-nav-wrapped");
  });

  test("at 390px every nav link renders at least 44px tall (AC-22)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const links = page.locator(".site-nav a");
    const count = await links.count();
    expect(count, "no nav links rendered").toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const box = await links.nth(i).boundingBox();
      expect(box, `nav link ${i} not laid out`).toBeTruthy();
      expect(box!.height, `nav link ${i} is under 44px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test("at 390px the header radius is capped, not an uncapped stadium across the wrapped rows", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const header = page.locator(".site-header");
    const headerBox = await header.boundingBox();
    expect(headerBox, "header not laid out").toBeTruthy();
    const radiusPx = await header.evaluate((el) => parseFloat(getComputedStyle(el).borderRadius));

    // An un-capped 999px pill radius clamps visually to half the box height
    // once the header wraps to a second row — a giant stadium shape. A real
    // cap must render well under that boundary; a bare computed-style check
    // (e.g. "not 999px") would miss a cap that is still too large to look right.
    expect(radiusPx, "header radius reads uncapped once wrapped").toBeLessThan(headerBox!.height / 2);

    await captureEvidence(page, "390-header-radius");
  });

  test("desktop layout is unchanged: brand left, nav right, single row (AC-23)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const brandBox = await page.locator(".brand").boundingBox();
    const navBox = await page.locator(".site-nav").boundingBox();
    expect(brandBox && navBox, "brand/nav not laid out").toBeTruthy();

    expect(brandBox!.x, "brand is not left of the nav").toBeLessThan(navBox!.x);
    // Same row: vertical centres line up.
    const brandCenterY = brandBox!.y + brandBox!.height / 2;
    const navCenterY = navBox!.y + navBox!.height / 2;
    expect(Math.abs(brandCenterY - navCenterY), "brand and nav are not on the same row").toBeLessThan(6);

    await captureEvidence(page, "1280-desktop");
  });

  for (const width of [320, 390, 768]) {
    test(`no horizontal page overflow at ${width}px (AC-24)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      // 1px tolerance for scrollbar/subpixel rounding, not a real overflow.
      expect(overflow.scrollWidth - overflow.clientWidth, `page overflows horizontally at ${width}px`).toBeLessThanOrEqual(1);

      await captureEvidence(page, `${width}-overflow-check`);
    });
  }
});
