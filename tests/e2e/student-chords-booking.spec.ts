/**
 * Student chord browser + tab shell + booking tab
 * (student-chord-browser AC-4/AC-6, student-portal-tab-shell AC-14/15/17/18,
 * student-booking-tab AC-46/47).
 *
 * Popups are deliberately out of scope: the renderer and admin popup page are
 * still in flight, so a spec against them would be testing a moving target.
 *
 * Conventions carried over from materials-dnd.spec.ts / gui-sweep.spec.ts:
 * - Runtime fixture discovery over hardcoding: the chord picked for the
 *   filter tests, and whether the seeded student has an assigned teacher,
 *   are both resolved from live API responses rather than assumed.
 * - `loginStudentViaApi` is called fresh per test (not a shared beforeEach),
 *   matching how both reference specs call their login helper inside each
 *   test body.
 * - A distinct `x-forwarded-for` per login. An earlier version of this comment
 *   claimed student login had no rate limiter; it does —
 *   `src/app/api/student/login/route.ts` consumes `student-login:{ip}` at 20
 *   attempts per 15 minutes, plus a CAPTCHA guard at 24 per 10 minutes. Six
 *   logins per run stayed under it only while two tests were burning 90s each
 *   on a hang; once that was fixed the whole file ran in 41s and tripped the
 *   limiter. The 429 is the limiter working correctly, so bucket the tests
 *   apart rather than weakening it.
 * - Structural, per-shot try/catch + `withDeadline`-style bounding (from
 *   gui-sweep) doesn't apply here: gui-sweep needed that because it packs 30+
 *   captures into one mega-test. Every AC below is its own `test()`, so a
 *   single hang is already isolated to one Playwright-bounded test, not the
 *   whole file.
 */

import { expect, test, type Page } from "@playwright/test";

import { loginStudentViaApi } from "./auth-helpers";

const STUDENT_TABS = [
  { label: "Lessons", href: "/student/portal" },
  { label: "Materials", href: "/student/materials" },
  { label: "Chord Library", href: "/student/chords" },
  { label: "Book a Lesson", href: "/student/book" }
] as const;

// 203.0.113.0/24 is TEST-NET-3, reserved for documentation, so these can never
// collide with a real client address. One per login keeps each test in its own
// rate-limit bucket.
let studentLoginSeq = 0;
function nextStudentIp(): string {
  studentLoginSeq += 1;
  return `203.0.113.${studentLoginSeq}`;
}

type ApiChord = { id: string; name: string; root: string; quality: string };

async function fetchChords(page: Page, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ page: "1", ...params });
  const response = await page.request.get(`/api/student/chords?${qs.toString()}`);
  expect(response.ok(), `chords GET failed: ${response.status()}`).toBeTruthy();
  return (await response.json()) as { chords: ApiChord[]; total: number };
}

test.describe("student portal tab shell", () => {
  test("all four tabs are present (AC-14)", async ({ page }) => {
    await loginStudentViaApi(page, { forwardedIp: nextStudentIp() });
    await page.goto("/student/portal", { waitUntil: "domcontentloaded" });

    const nav = page.getByRole("navigation", { name: /student portal sections/i });
    for (const tab of STUDENT_TABS) {
      await expect(nav.getByRole("link", { name: tab.label })).toBeVisible();
    }
  });

  test("each tab is a real URL, marks aria-current, deep-links land right, and back works (AC-14/AC-15)", async ({ page }) => {
    await loginStudentViaApi(page, { forwardedIp: nextStudentIp() });
    await page.goto("/student/portal", { waitUntil: "domcontentloaded" });

    const nav = page.getByRole("navigation", { name: /student portal sections/i });

    await nav.getByRole("link", { name: "Chord Library" }).click();
    await expect(page).toHaveURL(/\/student\/chords$/);
    await expect(nav.getByRole("link", { name: "Chord Library" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Lessons" })).not.toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "Materials" }).click();
    await expect(page).toHaveURL(/\/student\/materials$/);
    await expect(nav.getByRole("link", { name: "Materials" })).toHaveAttribute("aria-current", "page");

    // Deep-link straight to a tab (a fresh navigation, not client routing).
    await page.goto("/student/book", { waitUntil: "domcontentloaded" });
    await expect(nav.getByRole("link", { name: "Book a Lesson" })).toHaveAttribute("aria-current", "page");

    // Browser back must land on the previously-visited tab (Materials) — the
    // one thing a routed tab bar buys over client-side-only tab state, and
    // nothing else in this suite exercises it.
    await page.goBack();
    await expect(page).toHaveURL(/\/student\/materials$/);
    await expect(nav.getByRole("link", { name: "Materials" })).toHaveAttribute("aria-current", "page");
  });

  test("at 390px the four tabs form two centred rows of two (AC-17)", async ({ page }) => {
    await loginStudentViaApi(page, { forwardedIp: nextStudentIp() });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/student/portal", { waitUntil: "domcontentloaded" });

    const nav = page.getByRole("navigation", { name: /student portal sections/i });
    const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const tab of STUDENT_TABS) {
      const box = await nav.getByRole("link", { name: tab.label }).boundingBox();
      expect(box, `${tab.label} tab not laid out`).toBeTruthy();
      boxes.push(box!);
    }

    // Geometry, not a CSS property: group by rendered row, then check counts
    // and centring against the nav's own bounding box.
    const sortedByY = [...boxes].sort((a, b) => a.y - b.y);
    const rowTolerance = 4;
    const firstRow = sortedByY.filter((box) => Math.abs(box.y - sortedByY[0].y) < rowTolerance);
    const secondRow = sortedByY.filter((box) => !firstRow.includes(box));

    expect(firstRow.length, "first row does not have exactly 2 tabs").toBe(2);
    expect(secondRow.length, "second row does not have exactly 2 tabs").toBe(2);
    expect(secondRow[0].y, "second row is not below the first").toBeGreaterThan(firstRow[0].y + firstRow[0].height - 2);

    const navBox = await nav.boundingBox();
    const navCenterX = navBox!.x + navBox!.width / 2;
    for (const row of [firstRow, secondRow]) {
      const rowLeft = Math.min(...row.map((box) => box.x));
      const rowRight = Math.max(...row.map((box) => box.x + box.width));
      const rowCenterX = (rowLeft + rowRight) / 2;
      expect(Math.abs(rowCenterX - navCenterX), "row is not centred").toBeLessThan(6);
    }
  });

  test("at 390px every tab target is at least 44px tall (AC-18)", async ({ page }) => {
    await loginStudentViaApi(page, { forwardedIp: nextStudentIp() });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/student/portal", { waitUntil: "domcontentloaded" });

    const nav = page.getByRole("navigation", { name: /student portal sections/i });
    for (const tab of STUDENT_TABS) {
      const box = await nav.getByRole("link", { name: tab.label }).boundingBox();
      expect(box, `${tab.label} tab not laid out`).toBeTruthy();
      expect(box!.height, `${tab.label} tab is under 44px tall`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("student chord browser", () => {
  test("search and root/quality filters narrow the rendered result set (AC-4), diagrams render as real SVG (AC-6)", async ({ page }) => {
    await loginStudentViaApi(page, { forwardedIp: nextStudentIp() });

    // Discover a real chord at runtime — the seeded contents are not guaranteed.
    const baseline = await fetchChords(page);
    expect(baseline.chords.length, "no chords seeded to test against").toBeGreaterThan(0);

    // The target has to be SELECTIVE, not merely present. `chords[0]` is "A",
    // which matches 312 of 762 seeded chords — more than one page — so the
    // rendered count never drops and the search looks broken when it is not.
    // Ask the API which candidate actually narrows below a single page, and
    // assert against that.
    let target = baseline.chords[0];
    let targetTotal = baseline.total;
    for (const candidate of baseline.chords) {
      const result = await fetchChords(page, { search: candidate.name });
      if (result.total < targetTotal) {
        target = candidate;
        targetTotal = result.total;
      }
      if (targetTotal < 25) break;
    }
    expect(
      targetTotal,
      "no chord name in page 1 narrows below a full page — cannot prove search filters"
    ).toBeLessThan(baseline.chords.length);

    await page.goto("/student/chords", { waitUntil: "domcontentloaded" });
    await page.locator("#chord-search").waitFor({ timeout: 10_000 });

    const tiles = page.locator('[class*="chord-tile"]');
    await expect(tiles.first()).toBeVisible({ timeout: 10_000 });
    const baselineCount = await tiles.count();

    // AC-6: the first tile's diagram is a real, non-empty SVG, not a stub container.
    const firstSvg = tiles.first().locator("svg").first();
    await expect(firstSvg).toBeVisible();
    const svgBox = await firstSvg.boundingBox();
    expect(svgBox?.width, "chord diagram SVG rendered with zero size").toBeGreaterThan(0);

    // AC-4: search narrows to the target chord.
    await page.locator("#chord-search").fill(target.name);
    await expect(tiles.filter({ hasText: target.name }).first()).toBeVisible({ timeout: 10_000 });
    if (baseline.total > 1) {
      await expect.poll(() => tiles.count(), { message: "search did not narrow the result set" }).toBeLessThan(baselineCount);
    }
    await page.locator("#chord-search").fill("");

    // Read live filter options rather than assuming a fixed root/quality list.
    const rootOptions = await page.locator("#chord-root-filter option").evaluateAll((options) =>
      (options as HTMLOptionElement[]).map((option) => option.value)
    );
    const differentRoot = rootOptions.find((value) => value && value !== target.root);
    const qualityOptions = await page.locator("#chord-quality-filter option").evaluateAll((options) =>
      (options as HTMLOptionElement[]).map((option) => option.value)
    );
    const differentQuality = qualityOptions.find((value) => value && value !== target.quality);

    // AC-4: a root filter that does NOT match the target hides it — falsifiable
    // proof the filter actually changes the set, not just that it re-renders.
    if (differentRoot) {
      await page.locator("#chord-root-filter").selectOption(differentRoot);
      await expect(tiles.filter({ hasText: target.name })).toHaveCount(0, { timeout: 10_000 });
      await page.locator("#chord-root-filter").selectOption("");
    }

    if (differentQuality) {
      await page.locator("#chord-quality-filter").selectOption(differentQuality);
      await expect(tiles.filter({ hasText: target.name })).toHaveCount(0, { timeout: 10_000 });
      await page.locator("#chord-quality-filter").selectOption("");
    }

    // AC-4: root + quality combine — both set to the target's own values still finds it.
    await page.locator("#chord-root-filter").selectOption(target.root);
    await page.locator("#chord-quality-filter").selectOption(target.quality);
    await expect(tiles.filter({ hasText: target.name }).first()).toBeVisible({ timeout: 10_000 });

    // AC-4: search combines with the filters too — an unmatching search term
    // hides the target even though both filters still match it.
    await page.locator("#chord-search").fill("zzz-no-such-chord-zzz");
    await expect(tiles.filter({ hasText: target.name })).toHaveCount(0, { timeout: 10_000 });
  });
});

test.describe("student booking tab", () => {
  test("shows slots, the no-slots-today message, or the contact-the-school message — never blank or silently broken (AC-46/AC-47)", async ({
    page
  }) => {
    await loginStudentViaApi(page, { forwardedIp: nextStudentIp() });
    await page.goto("/student/book", { waitUntil: "domcontentloaded" });

    const contactMessage = page.getByText(/contact the school to be assigned a teacher/i);
    const noSlotsMessage = page.getByText(/no available times on this day/i);
    const slotButton = page.getByRole("button", { name: /\d{1,2}:\d{2}\s*(am|pm)/i }).first();
    // The component's own fetch-failure branch (`slotsError`) renders this —
    // a broken booking-slots endpoint is NOT a legitimate empty state, and
    // must fail the test rather than pass or skip.
    const errorNotice = page.locator(".notice.error");

    // Exactly one of these four must render — never a blank panel and never
    // a spinner that hangs forever.
    await expect(contactMessage.or(noSlotsMessage).or(slotButton).or(errorNotice)).toBeVisible({ timeout: 15_000 });
    // Read the count first, and only reach for the text when there IS an error.
    // Template arguments are evaluated eagerly, and `textContent()` auto-waits
    // for a match — so building this message against a locator we expect to be
    // EMPTY blocked for the whole test timeout. The assertion could only pass
    // by hanging: the healthier the endpoint, the longer the wait.
    const errorCount = await errorNotice.count();
    const errorText = errorCount === 0 ? "" : await errorNotice.first().textContent().catch(() => "");
    expect(errorCount, `booking-slots endpoint failed: ${errorText}`).toBe(0);

    if (await contactMessage.isVisible().catch(() => false)) {
      // AC-47: no teacher assigned — a plain message, no calendar at all.
      await expect(page.locator("#booking-date")).toHaveCount(0);
      return;
    }

    if (await noSlotsMessage.isVisible().catch(() => false)) {
      // A real, specified empty-day state — distinct from the error notice
      // asserted absent above, not a stand-in for "couldn't tell."
      await expect(noSlotsMessage).toBeVisible();
      return;
    }

    // AC-46: a teacher is assigned and today has slots — assert the grid and
    // its 44px targets (AC-62).
    const slotBox = await slotButton.boundingBox();
    expect(slotBox, "slot button not laid out").toBeTruthy();
    expect(slotBox!.height, "slot target under 44px").toBeGreaterThanOrEqual(44);

    // AC-53: selecting a slot opens a confirm step that states plainly this
    // is a REQUEST awaiting approval, not a confirmed booking. Stop here —
    // submitting would write a real pending request and email the owner.
    await slotButton.click();
    await expect(page.getByRole("button", { name: /request this lesson/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/pending owner approval|not a confirmed lesson/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /choose a different time/i })).toBeVisible();
  });
});
