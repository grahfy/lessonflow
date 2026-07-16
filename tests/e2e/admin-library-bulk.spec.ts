/**
 * E2E coverage for the library bulk-upload flow (plan §6 admin + portal rows):
 *  - Flat multi-file drag-drop (a real directory drop is not constructible in
 *    Playwright — folder recursion is unit-tested; here the drop path uses the
 *    loose-file DataTransfer fallback): mixed mp3/pdf/image/.gp5 batch with a
 *    .docx (skipped, reason shown) and a .DS_Store (silently ignored).
 *  - webkitdirectory folder picker with a real nested fixture tree (>100 files
 *    in one directory) — full item count + folder-derived suggestion chips.
 *  - Batch review: subset selection, apply-tags-to-selected, per-item title
 *    edit, commit, then AND-facet retrieval of the tagged items.
 *  - Duplicate flow: re-drop already-uploaded files → filename-match rows with
 *    existing-item context; Discard leaves one master, Keep both creates two.
 *  - Failure continuation: an oversize (>100 MB) file fails cleanly per-file
 *    while the rest of the batch uploads.
 *  - Student portal: an assigned audio item renders the practice player and an
 *    assigned .gp item downloads byte-identical with its original extension.
 *  - Mobile viewport (390px): library page, filter sheet, and review sheet.
 *
 * Requires the dev server on :3000 against the seeded mgs_dev database
 * (admin admin@example.com/admin123) and DATABASE_URL pointing at the same DB
 * so the student fixture script seeds where the server reads. Run alone —
 * single live-e2e runner per repo convention. Every fixture filename carries a
 * unique run token; afterAll deletes every library item matching it (item
 * deletion cascades tags-joins and assignments).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { createCaptchaPayload, loginAdminViaApi, loginStudentViaApi } from "./auth-helpers";

const adminEmail = process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || "admin123";

/** Unique token carried by every fixture filename so cleanup can find them all. */
const RUN = `e2eblk${Date.now().toString(36)}`;

/**
 * Fresh forwarded IP per run so repeated local runs don't accumulate into the
 * login/captcha rate limiter (same convention as the other admin e2e specs).
 */
const FORWARDED_IP = `198.51.${100 + Math.floor(Math.random() * 100)}.${1 + Math.floor(Math.random() * 200)}`;

test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_IP } });

/** Deterministic pseudo-random bytes (LCG) so the GP byte-compare is stable. */
function pseudoRandomBytes(length: number, seed: number): Buffer {
  const bytes = Buffer.alloc(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[i] = state & 0xff;
  }
  return bytes;
}

const mp3Bytes = Buffer.concat([Buffer.from("ID3"), pseudoRandomBytes(1500, 101)]);
const pdfBytes = Buffer.concat([Buffer.from("%PDF-1.4\n"), pseudoRandomBytes(900, 202), Buffer.from("\n%%EOF")]);
const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pseudoRandomBytes(700, 303)]);
const gpBytes = pseudoRandomBytes(4096, 404);
const docxBytes = pseudoRandomBytes(600, 505);

type DropSpec = {
  name: string;
  type: string;
  b64?: string;
  /** When set, the browser allocates a zero-filled file of this size instead. */
  syntheticSize?: number;
};

const dropFile = (name: string, type: string, bytes: Buffer): DropSpec => ({
  name,
  type,
  b64: bytes.toString("base64")
});

/**
 * Dispatches a window-level drop carrying a flat multi-file DataTransfer.
 * Directory drops are not constructible in Playwright (F7), so this exercises
 * the loose-file fallback of collectDroppedFiles.
 */
async function dropFiles(page: Page, specs: DropSpec[]): Promise<void> {
  const dataTransfer = await page.evaluateHandle((files: DropSpec[]) => {
    const dt = new DataTransfer();
    for (const spec of files) {
      let bytes: Uint8Array<ArrayBuffer>;
      if (spec.syntheticSize) {
        bytes = new Uint8Array(spec.syntheticSize);
      } else {
        const bin = atob(spec.b64 || "");
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) {
          bytes[i] = bin.charCodeAt(i);
        }
      }
      dt.items.add(new File([bytes], spec.name, { type: spec.type }));
    }
    return dt;
  }, specs);
  await page.dispatchEvent("body", "drop", { dataTransfer });
  await dataTransfer.dispose();
}

/** Same XML-entity decode the login helpers use (repo captcha gotcha). */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Solves the bulk-upload panel's CAPTCHA by decoding the SVG challenge from
 * the rendered image (the client form enforces a non-empty answer even though
 * the dev server's check is a no-op) and clicks the given start button.
 */
async function solveBulkCaptchaAndStart(page: Page, startLabel = "Start upload"): Promise<void> {
  const image = page.locator("#library-bulk-captcha-image img");
  await expect(image).toBeVisible({ timeout: 10_000 });
  const src = (await image.getAttribute("src")) || "";
  const svg = Buffer.from(src.split(",")[1] || "", "base64").toString("utf8");
  const answer = Array.from(svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g))
    .map((match) => decodeXmlEntities(match[1]))
    .join("")
    .trim();
  expect(answer, "Bulk captcha answer should be derivable from the SVG.").not.toBe("");
  await page.fill("#library-bulk-captcha", answer);
  await page.getByRole("button", { name: startLabel }).click();
}

async function gotoLibrary(page: Page): Promise<void> {
  await page.goto("/admin/library", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 2, name: "Library", exact: true })).toBeVisible({ timeout: 15_000 });
  // "Add folder" only renders after the post-hydration feature-detect effect,
  // which shares the effects pass that registers the window drop listeners —
  // dropping before it appears can race hydration and stage nothing.
  await expect(page.getByRole("button", { name: "Add folder" })).toBeVisible({ timeout: 15_000 });
}

/** The review takeover that auto-opens once a batch's queue drains. */
function reviewDialog(page: Page) {
  return page.getByRole("dialog", { name: /Review batch — \d+ items? uploaded/ });
}

function progressDrawer(page: Page) {
  return page.getByRole("region", { name: "Batch upload progress" });
}

async function fetchRunItems(
  request: APIRequestContext,
  q: string
): Promise<Array<{ id: string; title: string; materialType: string; previewUrl: string; tags: Array<{ category: string; value: string }> }>> {
  const response = await request.get(`/api/admin/library?q=${encodeURIComponent(q)}`);
  expect(response.ok(), `Library search for "${q}" should succeed.`).toBeTruthy();
  const body = (await response.json()) as { items: Array<{ id: string; title: string; materialType: string; previewUrl: string; tags: Array<{ category: string; value: string }> }> };
  return body.items;
}

/** Admin-authenticated API context for teardown, independent of any page. */
async function newAdminRequestContext(): Promise<APIRequestContext> {
  const { request } = await import("@playwright/test");
  const context = await request.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    extraHTTPHeaders: { "x-forwarded-for": FORWARDED_IP }
  });
  const captchaPayload = await createCaptchaPayload(context, "bulk e2e teardown");
  const login = await context.post("/api/admin/login", {
    data: { email: adminEmail, password: adminPassword, website: "", ...captchaPayload }
  });
  expect(login.ok(), `Teardown admin login should succeed (got ${login.status()}).`).toBeTruthy();
  return context;
}

test.describe.configure({ mode: "serial" });

test.describe("library bulk upload", () => {
  test.afterAll(async () => {
    // Delete every library item this run created (filenames carry the RUN
    // token, and default titles derive from filenames). Item deletion cascades
    // tag joins and student assignments.
    const context = await newAdminRequestContext();
    const items = await fetchRunItems(context, RUN);
    for (const item of items) {
      const response = await context.delete(`/api/admin/library/${item.id}`);
      expect(response.ok(), `Cleanup delete of "${item.title}" should succeed.`).toBeTruthy();
    }
    const remaining = await fetchRunItems(context, RUN);
    expect(remaining, "All run-scoped items should be cleaned up.").toHaveLength(0);
    await context.dispose();
  });

  test("mixed flat drop: autodetected types, docx skipped with reason, junk silent; review tags/titles/commit; AND-facet search", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
    await gotoLibrary(page);

    await dropFiles(page, [
      dropFile(`${RUN}-riff-a.mp3`, "audio/mpeg", mp3Bytes),
      dropFile(`${RUN}-riff-b.mp3`, "audio/mpeg", mp3Bytes),
      dropFile(`${RUN}-riff-c.mp3`, "audio/mpeg", mp3Bytes),
      dropFile(`${RUN}-chart.pdf`, "application/pdf", pdfBytes),
      dropFile(`${RUN}-cover.png`, "image/png", pngBytes),
      dropFile(`${RUN}-solo.gp5`, "", gpBytes),
      dropFile(`${RUN}-notes.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docxBytes),
      dropFile(".DS_Store", "", pseudoRandomBytes(120, 606))
    ]);

    // Staged summary: 6 accepted, 1 flagged (docx), 1 junk ignored.
    const stagedLine = page.getByRole("status").filter({ hasText: "ready to upload" });
    await expect(stagedLine).toContainText("6");
    await expect(stagedLine).toContainText("1 will be listed as skipped/failed with a reason");
    await expect(stagedLine).toContainText("1 junk ignored");

    await solveBulkCaptchaAndStart(page);

    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText("Review batch — 6 items uploaded");

    // The progress drawer lists the docx as skipped with the classifier's
    // reason, notes the silently-ignored junk, and never shows a .DS_Store row.
    const drawer = progressDrawer(page);
    await expect(drawer.getByText(`${RUN}-notes.docx`)).toBeVisible();
    await expect(drawer).toContainText("1 skipped");
    await expect(drawer).toContainText("Unsupported file type");
    await expect(drawer).toContainText("1 system junk file (.DS_Store, Thumbs.db…) ignored automatically.");
    await expect(drawer.getByText(".DS_Store", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(".DS_Store", { exact: true })).toHaveCount(0);

    // Guitar Pro autodetection is surfaced in review via the GP badge.
    await expect(dialog.getByText("Guitar Pro", { exact: true })).toBeVisible();

    // Per-item title edit (the pdf keeps its RUN token so cleanup still finds it).
    await dialog.getByLabel(`Title for ${RUN}-chart.pdf`).fill(`${RUN}-chart-renamed`);

    // Subset selection: two audio rows, then two bulk tags applied to both so
    // the later facet search is a real AND across categories.
    await dialog.getByRole("checkbox", { name: `Select ${RUN}-riff-a` }).click();
    await dialog.getByRole("checkbox", { name: `Select ${RUN}-riff-b` }).click();
    const catInput = dialog.getByLabel("Bulk tag category");
    const valInput = dialog.getByLabel("Bulk tag value");
    await catInput.fill(`Genre ${RUN}`);
    await valInput.fill(`Blues ${RUN}`);
    await dialog.getByRole("button", { name: "Apply to 2 selected" }).click();
    await catInput.fill(`Level ${RUN}`);
    await valInput.fill(`Beginner ${RUN}`);
    await dialog.getByRole("button", { name: "Apply to 2 selected" }).click();

    await dialog.getByRole("button", { name: /Commit 6 items/ }).click();
    await expect(page.getByText("Batch committed to the library.")).toBeVisible({ timeout: 20_000 });

    // Server-side truth: correct autodetected type per file, edited title, tags.
    const items = await fetchRunItems(page.request, RUN);
    const byTitle = new Map(items.map((item) => [item.title, item]));
    expect(byTitle.get(`${RUN}-riff-a`)?.materialType).toBe("audio");
    expect(byTitle.get(`${RUN}-chart-renamed`)?.materialType).toBe("pdf");
    expect(byTitle.get(`${RUN}-cover`)?.materialType).toBe("image");
    expect(byTitle.get(`${RUN}-solo`)?.materialType).toBe("guitar_pro");
    expect(byTitle.has(`${RUN}-chart`)).toBe(false);
    expect(byTitle.get(`${RUN}-riff-a`)?.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: `Genre ${RUN}`, value: `Blues ${RUN}` }),
        expect.objectContaining({ category: `Level ${RUN}`, value: `Beginner ${RUN}` })
      ])
    );

    // The committed masters must be streamable, not just present as rows.
    const riffAStream = await page.request.get(byTitle.get(`${RUN}-riff-a`)!.previewUrl);
    expect(riffAStream.status(), "riff-a master blob should stream right after upload").toBe(200);

    // AND-facet search via the facet rail: both facets selected → exactly the
    // two tagged items remain in the list.
    const rail = page.getByRole("group", { name: "Filter by category" }).first();
    await expect(rail.getByRole("button", { name: `Genre ${RUN}` })).toBeVisible({ timeout: 10_000 });
    await rail.getByRole("button", { name: `Blues ${RUN}`, exact: true }).click();
    await rail.getByRole("button", { name: `Beginner ${RUN}`, exact: true }).click();
    await expect(page.getByText(`${RUN}-riff-a`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`${RUN}-riff-b`)).toBeVisible();
    await expect(page.getByText(`${RUN}-riff-c`)).toHaveCount(0);
    await expect(page.getByText(`${RUN}-chart-renamed`)).toHaveCount(0);

    // API cross-check of the same AND semantics.
    const anded = await page.request.get(
      `/api/admin/library?tag=${encodeURIComponent(`Genre ${RUN}:Blues ${RUN}`)}&tag=${encodeURIComponent(`Level ${RUN}:Beginner ${RUN}`)}`
    );
    expect(anded.ok()).toBeTruthy();
    const andedItems = ((await anded.json()) as { items: Array<{ title: string }> }).items;
    expect(andedItems.map((item) => item.title).sort()).toEqual([`${RUN}-riff-a`, `${RUN}-riff-b`]);
  });

  test("duplicate re-drop: flagged with existing-item context; Discard keeps one master, Keep both creates a second item", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
    await gotoLibrary(page);

    // Re-drop two files committed by the previous test: same name + size →
    // filename-match duplicates.
    await dropFiles(page, [
      dropFile(`${RUN}-riff-a.mp3`, "audio/mpeg", mp3Bytes),
      dropFile(`${RUN}-riff-b.mp3`, "audio/mpeg", mp3Bytes)
    ]);
    await solveBulkCaptchaAndStart(page);

    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText("Review batch — 2 items uploaded");
    await expect(dialog).toContainText("2 possible duplicates");

    // Existing-item context on the flagged rows.
    await expect(dialog.getByText("Filename match")).toHaveCount(2);
    await expect(dialog).toContainText(`as existing “${RUN}-riff-a”`);
    await expect(dialog).toContainText(`as existing “${RUN}-riff-b”`);

    // Filename matches default to Discard; flip riff-b to Keep both.
    const riffBResolution = dialog.getByRole("radiogroup", { name: `Duplicate resolution for ${RUN}-riff-b.mp3` });
    await expect(riffBResolution.getByRole("radio", { name: "Discard — keep existing" })).toHaveAttribute("aria-checked", "true");
    await riffBResolution.getByRole("radio", { name: "Keep both" }).click();

    await dialog.getByRole("button", { name: /Commit 1 item/ }).click();
    await expect(page.getByText("Batch committed to the library.")).toBeVisible({ timeout: 20_000 });

    // Discard left exactly one riff-a master; Keep both created a second riff-b.
    const riffA = await fetchRunItems(page.request, `${RUN}-riff-a`);
    expect(riffA).toHaveLength(1);
    const riffB = await fetchRunItems(page.request, `${RUN}-riff-b`);
    expect(riffB).toHaveLength(2);

    // The surviving master is the ORIGINAL item — its tags from the first
    // batch are intact (P3: discard deletes only the just-uploaded copy).
    expect(riffA[0].tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: `Genre ${RUN}`, value: `Blues ${RUN}` })])
    );

    // P3 at the blob level: the surviving master must still STREAM after the
    // duplicate's discard — a row without its bytes is a silent data loss.
    const masterStream = await page.request.get(riffA[0].previewUrl);
    expect(masterStream.status(), "master blob should survive the duplicate discard").toBe(200);
  });

  test("webkitdirectory folder picker: real nested tree with >100 files in one directory — full count + folder suggestion chips", async ({ page }) => {
    test.setTimeout(300_000);

    // Real fixture tree on disk; 110 files in one directory exercises the
    // >100-entries-per-directory shape at the UI level (the drop-side
    // readEntries loop is unit-tested).
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mgs-bulk-e2e-"));
    const collection = path.join(fixtureRoot, `${RUN}-collection`);
    const beginnerDir = path.join(collection, "Beginner Riffs");
    const weekDir = path.join(beginnerDir, "Week 1");
    const rockDir = path.join(collection, "Classic Rock");
    fs.mkdirSync(weekDir, { recursive: true });
    fs.mkdirSync(rockDir, { recursive: true });
    for (let i = 1; i <= 110; i += 1) {
      fs.writeFileSync(path.join(beginnerDir, `${RUN}-br-${String(i).padStart(3, "0")}.mp3`), mp3Bytes);
    }
    for (let i = 1; i <= 3; i += 1) {
      fs.writeFileSync(path.join(weekDir, `${RUN}-wk-${i}.pdf`), pdfBytes);
    }
    fs.writeFileSync(path.join(rockDir, `${RUN}-cr-1.mp3`), mp3Bytes);
    fs.writeFileSync(path.join(rockDir, `${RUN}-cr-2.mp3`), mp3Bytes);
    fs.writeFileSync(path.join(rockDir, `${RUN}-cr-solo.gp5`), gpBytes);

    try {
      await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
      await gotoLibrary(page);

      await page.locator('input[type="file"][webkitdirectory]').setInputFiles(collection);

      const stagedLine = page.getByRole("status").filter({ hasText: "ready to upload" });
      await expect(stagedLine).toContainText("116");

      await solveBulkCaptchaAndStart(page);

      // 116 uploads at 4-way concurrency against the local dev server.
      const dialog = reviewDialog(page);
      await expect(dialog).toBeVisible({ timeout: 240_000 });
      await expect(dialog).toContainText("Review batch — 116 items uploaded");

      // Folder-derived suggestion chips: every tree segment, root included
      // (webkitRelativePath carries the picked folder's own name).
      for (const folderName of [`${RUN}-collection`, "Beginner Riffs", "Week 1", "Classic Rock"]) {
        await expect(dialog.getByLabel(`Tag category for folder ${folderName}`)).toBeVisible();
      }

      // Keep the items untagged (cleanup deletes them); closing must not lose them.
      await dialog.getByRole("button", { name: "Close — keep untagged" }).click();
      const uploaded = await fetchRunItems(page.request, `${RUN}-br-`);
      expect(uploaded).toHaveLength(110);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("failure continuation: >100MB file fails per-file locally, rest of the batch uploads", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
    await gotoLibrary(page);

    await dropFiles(page, [
      dropFile(`${RUN}-cont-a.mp3`, "audio/mpeg", mp3Bytes),
      dropFile(`${RUN}-cont-b.mp3`, "audio/mpeg", mp3Bytes),
      { name: `${RUN}-huge.mp3`, type: "audio/mpeg", syntheticSize: 100 * 1024 * 1024 + 1 }
    ]);

    const stagedLine = page.getByRole("status").filter({ hasText: "ready to upload" });
    await expect(stagedLine).toContainText("2");
    await expect(stagedLine).toContainText("1 will be listed as skipped/failed with a reason");

    await solveBulkCaptchaAndStart(page);

    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText("Review batch — 2 items uploaded");

    // The oversize file failed cleanly with its own reason and a retry
    // affordance; the aggregate bar and per-file rows rendered in the drawer.
    const drawer = progressDrawer(page);
    await expect(drawer.getByText(`${RUN}-huge.mp3`)).toBeVisible();
    await expect(drawer).toContainText("File exceeds the 100MB limit.");
    await expect(drawer).toContainText("1 failed");
    await expect(drawer).toContainText("2 of 3 uploaded");
    await expect(drawer.getByRole("button", { name: "Retry failed (1)" })).toBeVisible();

    await dialog.getByRole("button", { name: /Commit 2 items/ }).click();
    await expect(page.getByText("Batch committed to the library.")).toBeVisible({ timeout: 20_000 });

    const items = await fetchRunItems(page.request, `${RUN}-cont-`);
    expect(items).toHaveLength(2);
    expect(await fetchRunItems(page.request, `${RUN}-huge`)).toHaveLength(0);
  });

  test("student portal: assigned bulk audio renders the practice player; assigned .gp downloads byte-identical", async ({ page, browser }) => {
    test.setTimeout(180_000);

    // Log the student in FIRST: the helper seeds the portal fixture customer
    // ("Alex Student") that the admin assignment below targets.
    const studentContext = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": FORWARDED_IP }
    });
    const studentPage = await studentContext.newPage();
    await loginStudentViaApi(studentPage);

    await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
    await gotoLibrary(page);

    // Assign one bulk-uploaded audio item and the GP item via the UI.
    for (const title of [`${RUN}-riff-a`, `${RUN}-solo`]) {
      await page.locator('input[type="search"][aria-label="Search the library by title or artist"]').fill(title);
      const rowHead = page.getByRole("button", { name: new RegExp(title) }).first();
      await expect(rowHead).toBeVisible({ timeout: 10_000 });
      await rowHead.click();
      await page.getByRole("button", { name: "Assign", exact: true }).click();
      const assignDialog = page.getByRole("dialog", { name: "Assign to students" });
      await expect(assignDialog).toBeVisible();
      await assignDialog.getByLabel("Search students").fill("Alex Student");
      await assignDialog.getByRole("button", { name: /Alex Student/ }).first().click();
      await assignDialog.getByRole("button", { name: "Assign 1 student" }).click();
      await expect(assignDialog.getByText("Alex Student").first()).toBeVisible({ timeout: 10_000 });
      await assignDialog.getByRole("button", { name: "Close", exact: true }).first().click();
      await expect(assignDialog).toBeHidden();
    }

    // Student side: both items in "Assigned by teacher".
    await studentPage.goto("/student/materials", { waitUntil: "domcontentloaded" });
    await expect(studentPage.getByRole("heading", { name: "Assigned by teacher" })).toBeVisible({ timeout: 15_000 });
    const audioItem = studentPage.locator("li", { hasText: `${RUN}-riff-a (AUDIO)` });
    const gpItem = studentPage.locator("li", { hasText: `${RUN}-solo (GUITAR PRO)` });
    await expect(audioItem).toBeVisible();
    await expect(gpItem).toBeVisible();

    // Audio: the practice player renders and its stream endpoint serves the
    // uploaded bytes (headless autoplay policies make actual playback flaky).
    const player = audioItem.getByTestId("practice-audio-player");
    await expect(player).toBeVisible();
    await expect(player.getByRole("button", { name: "Play" })).toBeVisible();
    const audioSrc = await audioItem.locator("audio").getAttribute("src");
    expect(audioSrc, "Practice player should point at the student stream endpoint.").toBeTruthy();
    const audioResponse = await studentPage.request.get(audioSrc!);
    expect(audioResponse.status()).toBe(200);
    expect(Buffer.compare(await audioResponse.body(), mp3Bytes)).toBe(0);

    // GP: download-only card (no preview), byte-identical download that keeps
    // the original .gp5 extension (AC-I3).
    await expect(gpItem.getByText(/Guitar Pro file · /)).toBeVisible();
    await expect(gpItem.getByRole("link", { name: "Preview" })).toHaveCount(0);
    const downloadHref = await gpItem.getByRole("link", { name: "Download" }).getAttribute("href");
    expect(downloadHref).toBeTruthy();
    const gpResponse = await studentPage.request.get(downloadHref!);
    expect(gpResponse.status()).toBe(200);
    expect(gpResponse.headers()["content-disposition"] || "").toContain(`${RUN}-solo.gp5`);
    expect(Buffer.compare(await gpResponse.body(), gpBytes)).toBe(0);

    await studentContext.close();
  });

  test("mobile viewport (390px): library page, filter sheet, and review sheet render with tappable controls", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAdminViaApi(page, { email: adminEmail, password: adminPassword });
    await gotoLibrary(page);

    // No horizontal overflow on the library page itself.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "Library page should not scroll horizontally at 390px.").toBeLessThanOrEqual(1);

    // Filter sheet: opens, fits the viewport, and closes via its primary button.
    const filtersButton = page.getByRole("button", { name: /^Filters/ });
    await expect(filtersButton).toBeVisible();
    await filtersButton.click();
    const filterSheet = page.getByRole("dialog", { name: "Filters" });
    await expect(filterSheet).toBeVisible();
    await expect(filterSheet.getByRole("group", { name: "Filter by category" })).toBeVisible();
    const sheetBox = await filterSheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(391);
    // Plan AC: 44px touch targets on new library controls at mobile widths.
    const showButton = filterSheet.getByRole("button", { name: /Show \d+ items?/ });
    const showBox = await showButton.boundingBox();
    expect(showBox!.height, "Filter sheet primary action should meet the 44px touch target.").toBeGreaterThanOrEqual(44);
    await showButton.click();
    await expect(filterSheet).toBeHidden();

    // Review sheet at 390px: run a small batch and commit from the phone layout.
    await dropFiles(page, [
      dropFile(`${RUN}-mob-a.mp3`, "audio/mpeg", mp3Bytes),
      dropFile(`${RUN}-mob-b.pdf`, "application/pdf", pdfBytes)
    ]);
    await solveBulkCaptchaAndStart(page);

    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText("Review batch — 2 items uploaded");
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(391);

    const commitButton = dialog.getByRole("button", { name: /Commit 2 items/ });
    const commitBox = await commitButton.boundingBox();
    expect(commitBox!.height, "Commit button should meet the 44px touch target.").toBeGreaterThanOrEqual(44);
    await commitButton.click();
    await expect(page.getByText("Batch committed to the library.")).toBeVisible({ timeout: 20_000 });

    const items = await fetchRunItems(page.request, `${RUN}-mob-`);
    expect(items).toHaveLength(2);
  });
});
