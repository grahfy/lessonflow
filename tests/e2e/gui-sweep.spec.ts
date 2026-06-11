import fs from "node:fs";
import path from "node:path";

import { test } from "@playwright/test";

import { loginAdminViaApi, loginStudentViaApi } from "./auth-helpers";

/**
 * GUI consistency sweep — captures every route and every dialog open-state
 * at desktop and mobile widths so primitive-unification work can be diffed
 * against a baseline gallery (plan: .omc/plans/gui-consistency-pass.md).
 *
 * Output: artifacts/gui-sweep/{GUI_SWEEP_PHASE}/{name}-{viewport}.png plus a
 * generated index.html gallery. The artifacts/ tree is gitignored — galleries
 * travel as local files or CI/MR artifacts, never as commits.
 *
 * Per-shot failures are recorded in the gallery instead of aborting the run
 * (plan risk 7 — auth/seed flakiness must not zero out the whole sweep).
 */

const phase = process.env.GUI_SWEEP_PHASE || "current";
const outputDir = path.resolve(process.cwd(), "artifacts", "gui-sweep", phase);

const viewports = [
  { name: "desktop", width: 1440, height: 980 },
  { name: "mobile", width: 390, height: 844 }
] as const;

type ViewportName = (typeof viewports)[number]["name"];

type ShotRecord = {
  name: string;
  viewport: ViewportName;
  file: string;
  category: "route" | "dialog";
  status: "ok" | "missing" | "skipped";
  note?: string;
};

const results: ShotRecord[] = [];

/** All 30 page.tsx routes under src/app. Parameterized routes get one representative entity. */
const publicRoutes: Array<{ path: string; name: string }> = [
  { path: "/", name: "home" },
  { path: "/book", name: "book" },
  { path: "/contact", name: "contact" },
  { path: "/lessons", name: "lessons" },
  { path: "/privacy", name: "privacy" },
  { path: "/terms", name: "terms" },
  { path: "/terms-of-service", name: "terms-of-service" },
  { path: "/videos", name: "videos" },
  { path: "/vouchers", name: "vouchers" },
  { path: "/setup", name: "setup" },
  { path: "/teacher", name: "teacher" },
  { path: "/student/login", name: "student-login" },
  { path: "/admin/login", name: "admin-login" }
];

const studentRoutes: Array<{ path: string; name: string }> = [
  { path: "/student/portal", name: "student-portal" },
  { path: "/student/materials", name: "student-materials" }
];

const adminRoutes: Array<{ path: string; name: string }> = [
  { path: "/admin", name: "admin-root" },
  { path: "/admin/about", name: "admin-about" },
  { path: "/admin/analytics", name: "admin-analytics" },
  { path: "/admin/bookings", name: "admin-bookings" },
  { path: "/admin/chords", name: "admin-chords" },
  { path: "/admin/customers", name: "admin-customers" },
  { path: "/admin/invoices", name: "admin-invoices" },
  { path: "/admin/lesson-plans", name: "admin-lesson-plans" },
  { path: "/admin/manual", name: "admin-manual" },
  // Representative entity for /admin/manual/[sectionId]
  { path: "/admin/manual/start-here-features", name: "admin-manual-section" },
  { path: "/admin/reports", name: "admin-reports" },
  { path: "/admin/settings", name: "admin-settings" },
  { path: "/admin/system-logs", name: "admin-system-logs" },
  { path: "/admin/teachers", name: "admin-teachers" }
  // /admin/updates/progress is captured separately, last, because its
  // FakeEventSource init script must not leak into other captures.
];

/**
 * Dialog consumers that exist in the component tree but are not mounted by
 * any page (no importer in src). They cannot be opened through the UI, so
 * they are listed in the gallery as skipped instead of silently absent.
 */
const unmountableDialogs: Array<{ name: string; note: string }> = [
  {
    name: "dialog-quick-capture",
    note: "QuickCapture (src/components/admin/lesson-plans/quick-capture.tsx) is exported but never imported by any page/component — not reachable through the UI."
  },
  {
    name: "dialog-import-customers",
    note: "ImportCustomersDialog (src/components/admin-import-customers-dialog.tsx) is exported but never imported by any page/component — not reachable through the UI."
  }
];

const pendingUpdateCommits = [
  {
    sha: "abc1234def5678abc1234def5678abc1234def56",
    message: "feat: improve teacher assignment visibility across bookings",
    author: "Dean Thomson",
    date: "2026-03-18"
  }
] as const;

const latestDeployUpdate = {
  branch: "main",
  release: "1.2.0",
  appliedAt: "2026-03-18T09:30:00.000Z",
  commit: "deployed1234567890abcdef1234567890abcdef1234",
  shortCommit: "deployed",
  previousCommit: "previous1234567890abcdef1234567890abcdef12",
  commits: [
    {
      hash: "deployed1234567890abcdef1234567890abcdef1234",
      shortHash: "deployed",
      authorName: "Dean Thomson",
      authoredAt: "2026-03-18T08:55:00.000Z",
      subject: "feat: improve teacher assignment visibility across bookings",
      body: ""
    }
  ]
} as const;

type PW = import("@playwright/test").Page;

function shotFile(name: string, viewport: ViewportName) {
  return `${name}-${viewport}.png`;
}

async function stabilizePage(page: PW) {
  await page
    .addStyleTag({
      content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
        caret-color: transparent !important;
      }
    `
    })
    .catch(() => null);
  await page.waitForTimeout(250);
}

async function waitForPageSettle(page: PW) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => null);
}

async function gotoWithRetry(page: PW, urlPath: string) {
  try {
    return await page.goto(urlPath, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (String(error).includes("ERR_ABORTED")) {
      await page.waitForTimeout(500);
      return await page.goto(urlPath, { waitUntil: "domcontentloaded" });
    }
    throw error;
  }
}

async function dismissDeployUpdatesModal(page: PW) {
  // The modal auto-opens AFTER its API fetch resolves, so a single instant
  // visibility check races it and loses — a leftover .dialog-backdrop then
  // intercepts every later click. Poll briefly instead.
  const modal = page.getByRole("dialog", { name: /deployment updates/i });
  let visible = false;
  for (let i = 0; i < 4; i += 1) {
    if (await modal.isVisible().catch(() => false)) {
      visible = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  if (!visible) {
    return;
  }
  await modal
    .getByRole("button", { name: /^close$/i })
    .click({ force: true })
    .catch(async () => {
      await page.keyboard.press("Escape").catch(() => null);
    });
  await modal.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => null);
}

/**
 * Suppresses the deploy-updates auto-prompt for the rest of the session by
 * pre-marking the latest deploy commit as seen before each page load.
 */
async function suppressDeployUpdatesModal(page: PW) {
  const latest = await page.request
    .get("/api/admin/deploy-updates/latest")
    .then((response) => (response.ok() ? response.json() : null))
    .catch(() => null);
  const commit = latest && typeof latest.commit === "string" ? latest.commit : null;
  if (!commit) {
    return;
  }
  await page.addInitScript((seenCommit: string) => {
    window.localStorage.setItem("mgs_admin_seen_deploy_commit", seenCommit);
  }, commit);
}

/** Closes whatever overlay is open so the next capture starts clean. */
async function resetOverlays(page: PW) {
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press("Escape").catch(() => null);
    await page.waitForTimeout(150);
  }
  await page
    .locator(".dialog-backdrop, .modal-overlay")
    .first()
    .waitFor({ state: "hidden", timeout: 3_000 })
    .catch(() => null);
}

function record(entry: ShotRecord) {
  results.push(entry);
}

/**
 * Hard per-shot deadline on top of the page-level default timeouts: even if
 * an open-trigger chains several bounded waits, the shot as a whole must
 * resolve or be recorded as missing — it must never wedge the sweep.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Shot deadline of ${ms}ms exceeded: ${label}`)), ms);
    })
  ]);
}

async function captureRoute(page: PW, viewport: ViewportName, route: { path: string; name: string }) {
  const name = `route-${route.name}`;
  const file = shotFile(name, viewport);
  try {
    await withDeadline(
      (async () => {
        await gotoWithRetry(page, route.path);
        await waitForPageSettle(page);
        await stabilizePage(page);
        await dismissDeployUpdatesModal(page);
        fs.mkdirSync(outputDir, { recursive: true });
        await page.screenshot({ path: path.join(outputDir, file), fullPage: true });
      })(),
      90_000,
      name
    );
    record({ name, viewport, file, category: "route", status: "ok" });
  } catch (error) {
    record({ name, viewport, file, category: "route", status: "missing", note: String(error).slice(0, 300) });
  }
}

/**
 * Runs `open`, waits for the overlay selector, screenshots the viewport
 * (not full-page — overlays are fixed-position), then closes overlays.
 */
async function captureDialog(
  page: PW,
  viewport: ViewportName,
  name: string,
  overlaySelector: string,
  open: (page: PW) => Promise<void>
) {
  const file = shotFile(name, viewport);
  try {
    await withDeadline(
      (async () => {
        await open(page);
        await page.locator(overlaySelector).first().waitFor({ state: "visible", timeout: 10_000 });
        await waitForPageSettle(page);
        await stabilizePage(page);
        fs.mkdirSync(outputDir, { recursive: true });
        await page.screenshot({ path: path.join(outputDir, file), fullPage: false });
      })(),
      120_000,
      name
    );
    record({ name, viewport, file, category: "dialog", status: "ok" });
  } catch (error) {
    record({ name, viewport, file, category: "dialog", status: "missing", note: String(error).slice(0, 300) });
  } finally {
    await resetOverlays(page);
  }
}

/** Fills the public booking form and submits with a wrong captcha to open the status dialog. */
async function openBookingStatusDialog(page: PW) {
  await gotoWithRetry(page, "/book");
  await waitForPageSettle(page);
  await page.locator("#book-first-name").fill("Sweep");
  await page.locator("#book-last-name").fill("Tester");
  await page.locator("#book-email").fill("sweep.tester@example.com");
  await page.locator("#book-phone").fill("0400000000");
  await page.locator("#book-postcode").fill("3000");
  await page.locator("#book-mode").selectOption({ index: 1 }).catch(() => null);
  await page.locator("#book-duration").selectOption({ index: 1 }).catch(() => null);
  await page.locator("#book-start").fill("2030-01-05T10:00");
  await page.locator("#booking-captcha").fill("WRONG");
  await page.getByRole("button", { name: /request booking/i }).click();
}

async function capturePublic(page: PW, viewport: ViewportName) {
  for (const route of publicRoutes) {
    await captureRoute(page, viewport, route);
  }

  await captureDialog(page, viewport, "dialog-contact-image-lightbox", ".modal-overlay", async () => {
    await gotoWithRetry(page, "/contact");
    await waitForPageSettle(page);
    await page.locator(".map-trigger-item button").first().click();
  });

  await captureDialog(page, viewport, "dialog-videos-lightbox", ".modal-overlay", async () => {
    await gotoWithRetry(page, "/videos");
    await waitForPageSettle(page);
    await page.locator(".video-launch-button").first().click();
  });

  await captureDialog(page, viewport, "dialog-booking-form-status", ".dialog-backdrop.is-secondary", openBookingStatusDialog);
}

/** Retries captcha-protected API logins — SVG answer extraction is flaky. */
async function loginWithRetry(login: () => Promise<void>, attempts = 3) {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await login();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function captureStudent(page: PW, viewport: ViewportName) {
  try {
    await loginWithRetry(() => loginStudentViaApi(page));
  } catch (error) {
    for (const route of studentRoutes) {
      record({
        name: `route-${route.name}`,
        viewport,
        file: shotFile(`route-${route.name}`, viewport),
        category: "route",
        status: "missing",
        note: `Student login failed: ${String(error).slice(0, 200)}`
      });
    }
    return;
  }
  for (const route of studentRoutes) {
    await captureRoute(page, viewport, route);
  }
}

async function installUpdateApiStubs(page: PW) {
  await page.route("**/api/admin/updates/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        updateAvailable: true,
        pendingCommits: pendingUpdateCommits,
        webTriggerConfigured: true,
        webTriggerMessage: ""
      })
    });
  });
  await page.route("**/api/admin/deploy-updates/latest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(latestDeployUpdate)
    });
  });
  await page.route("**/api/admin/deploy-updates/history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ updates: [latestDeployUpdate] })
    });
  });
}

async function removeUpdateApiStubs(page: PW) {
  await page.unroute("**/api/admin/updates/status").catch(() => null);
  await page.unroute("**/api/admin/deploy-updates/latest").catch(() => null);
  await page.unroute("**/api/admin/deploy-updates/history").catch(() => null);
}

/**
 * Opens the seeded demo student's customer dialog ("Alex Student" owns the
 * seeded materials and email history; the other customer has neither).
 */
async function openSeededCustomerDialog(page: PW) {
  await gotoWithRetry(page, "/admin/customers");
  await waitForPageSettle(page);
  await dismissDeployUpdatesModal(page);
  // Exact email match — a generic /alex/i would also hit the "Alex Student"
  // e2e login fixture (student.mobile.e2e@example.com), which owns neither
  // materials nor email history.
  const seededRow = page.locator(".customer-table-row").filter({ hasText: "alex.student@example.com" });
  if ((await seededRow.count().catch(() => 0)) > 0) {
    await seededRow.first().click();
  } else {
    await page.locator(".customer-table-row").first().click();
  }
  await page.locator(".dialog-panel").first().waitFor({ timeout: 10_000 });
}

/** Opens the seeded customer's dialog on its Learning Materials tab. */
async function openCustomerMaterialsTab(page: PW) {
  await openSeededCustomerDialog(page);
  await page.getByRole("button", { name: /learning materials/i }).first().click();
  await page.getByText(/upload new/i).first().waitFor({ timeout: 10_000 }).catch(() => null);
}

async function captureAdminDialogs(page: PW, viewport: ViewportName) {
  // Customer dialog (AdminDialog, was #customer-dialog 1380px)
  await captureDialog(page, viewport, "dialog-customer-create", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/customers");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /new customer/i }).first().click();
  });

  // Email viewer (AdminDialog) — opened from a customer's communication tab.
  await captureDialog(page, viewport, "dialog-email-viewer", ".dialog-panel", async () => {
    await openSeededCustomerDialog(page);
    await page.getByRole("button", { name: /communication/i }).first().click();
    await page.getByText(/email history/i).first().waitFor({ timeout: 10_000 });
    await waitForPageSettle(page);
    await page.locator(".admin-email-history-item").first().click();
    await page.getByRole("dialog", { name: /view email/i }).first().waitFor({ timeout: 10_000 });
  });

  // Materials folder dialogs (AdminDialog compact x3, materials-folder-dialogs.tsx)
  // — nested on top of the customer dialog's Learning Materials tab.
  await captureDialog(
    page,
    viewport,
    "dialog-materials-folder-name",
    '.dialog-panel:has(h3:text-is("New folder"))',
    async () => {
      await openCustomerMaterialsTab(page);
      await page.getByRole("button", { name: /new folder/i }).first().click();
    }
  );

  await captureDialog(
    page,
    viewport,
    "dialog-materials-move",
    '.dialog-panel:has(h3:text-is("Move material"))',
    async () => {
      await openCustomerMaterialsTab(page);
      await page
        .locator(".customer-materials-item-actions")
        .first()
        .getByRole("button", { name: /^move$/i })
        .click();
    }
  );

  await captureDialog(
    page,
    viewport,
    "dialog-materials-delete-confirm",
    '.dialog-panel:has(h3:text-is("Delete material")), .dialog-panel:has(h3:text-is("Delete folder"))',
    async () => {
      await openCustomerMaterialsTab(page);
      await page
        .locator(".customer-materials-item-actions")
        .first()
        .getByRole("button", { name: /^delete$/i })
        .click();
    }
  );

  // Manual booking dialog (AdminDialog wide)
  await captureDialog(page, viewport, "dialog-manual-booking", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /add manual booking/i }).first().click();
  });

  // Booking detail dialog (AdminDialog, was #booking-detail-dialog 1380px)
  await captureDialog(page, viewport, "dialog-booking-detail", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    const event = page.locator(".calendar-event").first();
    await event.waitFor({ timeout: 10_000 });
    await event.click();
  });

  // Invoice create + invoice detail (AdminDialog / wide)
  await captureDialog(page, viewport, "dialog-invoice-create", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/invoices");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /create invoice|new invoice/i }).first().click();
  });

  await captureDialog(page, viewport, "dialog-invoice-detail", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/invoices");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /^open$/i }).first().click();
  });

  // System logs: report-issue + clear-up-to dialogs (AdminDialog)
  await captureDialog(page, viewport, "dialog-system-logs-report", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/system-logs");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /report issue/i }).first().click();
  });

  await captureDialog(page, viewport, "dialog-system-logs-clear", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/system-logs");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /clear up to|clear logs|up to/i }).first().click();
    await page.getByRole("dialog", { name: /clear logs up to/i }).waitFor({ timeout: 10_000 });
  });

  // Chord builder + chart editor (AdminDialog) on /admin/chords
  await captureDialog(page, viewport, "dialog-chord-builder", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/chords");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /new chord$/i }).first().click();
  });

  await captureDialog(page, viewport, "dialog-chord-chart-editor", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/chords");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /^charts$/i }).first().click();
    await page.getByRole("button", { name: /new chart/i }).first().click();
  });

  // Chord picker (AdminDialog wide) — inside the lesson-plan tiptap editor.
  await captureDialog(page, viewport, "dialog-chord-picker", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/lesson-plans");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /new template/i }).first().click();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("tiptap:insert-chord"));
    });
    await page.getByRole("dialog", { name: /insert chord/i }).first().waitFor({ timeout: 10_000 });
  });

  // Manual screenshot lightbox (.modal-overlay) on a manual section page.
  await captureDialog(page, viewport, "dialog-manual-lightbox", ".modal-overlay", async () => {
    await gotoWithRetry(page, "/admin/manual/start-here-features");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    // Click the wrapping trigger button — the <img> itself can report
    // zero-size (not "visible") until the next/image request resolves.
    const trigger = page.locator(".admin-manual-shot-trigger").first();
    await trigger.waitFor({ timeout: 10_000 });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
  });

  // Pending changes + deployment updates dialogs (AdminDialog, stubbed APIs).
  await installUpdateApiStubs(page);

  await captureDialog(page, viewport, "dialog-pending-changes", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    await page.getByRole("button", { name: /view changes/i }).first().click();
  });

  await captureDialog(page, viewport, "dialog-deploy-updates", ".dialog-panel", async () => {
    await gotoWithRetry(page, "/admin/bookings");
    await waitForPageSettle(page);
    await dismissDeployUpdatesModal(page);
    const menuToggle = page.getByRole("button", { name: /^menu$/i });
    if (await menuToggle.isVisible().catch(() => false)) {
      await menuToggle.click();
    }
    await page.locator("button").filter({ hasText: /^Updates$/ }).first().click();
    await page.getByRole("dialog", { name: /deployment updates/i }).waitFor({ timeout: 10_000 });
  });

  await removeUpdateApiStubs(page);
}

async function captureUpdateProgressRoute(page: PW, viewport: ViewportName) {
  // FakeEventSource keeps this page's stream content deterministic. The init
  // script applies to subsequent navigations, so this route is captured last.
  await page.addInitScript(() => {
    class FakeEventSource {
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readonly url: string;
      readonly withCredentials = false;

      constructor(url: string) {
        this.url = url;
        window.setTimeout(() => {
          this.onopen?.(new Event("open"));
          this.onmessage?.(new MessageEvent("message", { data: JSON.stringify("Pulling latest repository changes...") }));
          this.onmessage?.(new MessageEvent("message", { data: JSON.stringify("Building Next.js application") }));
        }, 50);
      }

      addEventListener() {}
      removeEventListener() {}
      close() {}
    }

    Object.defineProperty(window, "EventSource", {
      configurable: true,
      writable: true,
      value: FakeEventSource
    });
  });

  await captureRoute(page, viewport, { path: "/admin/updates/progress", name: "admin-updates-progress" });
}

async function captureAdmin(page: PW, viewport: ViewportName) {
  try {
    await loginWithRetry(() => loginAdminViaApi(page));
  } catch (error) {
    const everything = [...adminRoutes, { path: "/admin/updates/progress", name: "admin-updates-progress" }];
    for (const route of everything) {
      record({
        name: `route-${route.name}`,
        viewport,
        file: shotFile(`route-${route.name}`, viewport),
        category: "route",
        status: "missing",
        note: `Admin login failed: ${String(error).slice(0, 200)}`
      });
    }
    return;
  }

  await suppressDeployUpdatesModal(page);

  for (const route of adminRoutes) {
    await captureRoute(page, viewport, route);
  }

  await captureAdminDialogs(page, viewport);
  await captureUpdateProgressRoute(page, viewport);
}

function writeGallery() {
  fs.mkdirSync(outputDir, { recursive: true });

  for (const orphan of unmountableDialogs) {
    for (const viewport of viewports) {
      record({
        name: orphan.name,
        viewport: viewport.name,
        file: shotFile(orphan.name, viewport.name),
        category: "dialog",
        status: "skipped",
        note: orphan.note
      });
    }
  }

  const ordered = [...results].sort((a, b) =>
    a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)
  );

  const byName = new Map<string, ShotRecord[]>();
  for (const entry of ordered) {
    const list = byName.get(entry.name) || [];
    list.push(entry);
    byName.set(entry.name, list);
  }

  const missing = ordered.filter((entry) => entry.status === "missing");
  const skipped = ordered.filter((entry) => entry.status === "skipped");

  const rows = [...byName.entries()]
    .map(([name, entries]) => {
      const cells = viewports
        .map((viewport) => {
          const entry = entries.find((candidate) => candidate.viewport === viewport.name);
          if (!entry || entry.status !== "ok") {
            const label = entry?.status === "skipped" ? "skipped" : "missing";
            return `<td class="missing"><div>${label}</div><small>${entry?.note ? escapeHtml(entry.note) : ""}</small></td>`;
          }
          return `<td><a href="${entry.file}" target="_blank"><img loading="lazy" src="${entry.file}" alt="${name} ${viewport.name}"></a></td>`;
        })
        .join("");
      return `<tr><th scope="row">${name}</th>${cells}</tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GUI sweep gallery — ${phase}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #334155; padding: 8px; text-align: left; vertical-align: top; }
  th[scope="row"] { width: 280px; font-weight: 600; }
  img { max-width: 560px; height: auto; display: block; background: #1e293b; }
  td.missing { color: #f87171; }
  td.missing small { color: #94a3b8; display: block; max-width: 420px; }
  .summary { margin-bottom: 16px; }
</style>
</head>
<body>
<h1>GUI sweep gallery — phase: ${phase}</h1>
<p class="summary">${ordered.filter((entry) => entry.status === "ok").length} captured,
${missing.length} missing, ${skipped.length} skipped (unmountable).
Generated ${new Date().toISOString()}.</p>
<table>
<thead><tr><th>Shot</th>${viewports.map((viewport) => `<th>${viewport.name} (${viewport.width}px)</th>`).join("")}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`;

  fs.writeFileSync(path.join(outputDir, "index.html"), html);
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(ordered, null, 2));
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

test.describe("gui consistency sweep", () => {
  test.afterAll(() => {
    writeGallery();
  });

  for (const viewport of viewports) {
    test(`sweep at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ browser }) => {
      test.setTimeout(1_200_000);

      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      // Playwright actions default to NO timeout (bounded only by the test
      // timeout), so a single missing selector would wedge the entire sweep
      // instead of throwing into the per-shot try/catch. Bound everything.
      page.setDefaultTimeout(10_000);
      page.setDefaultNavigationTimeout(30_000);

      try {
        await capturePublic(page, viewport.name);
        await captureStudent(page, viewport.name);
        await captureAdmin(page, viewport.name);
      } finally {
        await context.close();
      }
    });
  }
});
