# Admin Manual Full End-User Manual + Playwright Screenshot Automation Implementation Plan

## Overview

Expand `/admin/manual` from a quick-link hub into a detailed, in-app end-user manual for the full web app, and add a repeatable Playwright-based screenshot capture workflow that regenerates documentation screenshots automatically.

This plan prioritizes a maintainable source-of-truth model (to avoid manual-content drift), then adds screenshot automation, and finally integrates the new screenshots/content into the admin manual UI.

## Current State Analysis

- `/admin/manual` is an authenticated route and already reachable from admin headers, but it only renders a compact hub with quick links, a short deploy runbook summary, and a fixed screenshot gallery (`src/app/admin/manual/page.tsx:1`, `src/components/admin-manual-client.tsx:61`).
- The current manual screenshots are hard-coded in a local `SCREENSHOTS` array, which will not scale to “all functions of the app” and can drift from the documentation assets (`src/components/admin-manual-client.tsx:16`).
- A full Markdown end-user documentation suite already exists under `Documentation/`, including screenshot governance and a gallery section (`Documentation/README.md:60`, `Documentation/README.md:73`).
- Documentation assets explicitly mention Playwright capture, but the current process is descriptive/manual rather than automated in repo scripts (`Documentation/assets/README.md:7`, `Documentation/assets/README.md:33`).
- `package.json` still has a placeholder `test:e2e` command, so there is no committed Playwright runner or screenshot capture command yet (`package.json:17`).

### Key Discoveries
- The in-app manual is currently JSX-authored and not content-backed, which creates a duplication/drift risk as docs expand (`src/components/admin-manual-client.tsx:92`).
- The repository already has screenshot naming conventions and refresh triggers, so automation can extend an existing convention instead of inventing a new one (`Documentation/assets/README.md:21`, `Documentation/assets/README.md:46`).
- Prior documentation work intentionally excluded automated screenshot tooling, making this a natural follow-on phase rather than a retrofit mistake (`thoughts/plans/end-user-documentation-suite-implementation-plan.md` "What We're NOT Doing" / screenshot tooling note).

## Desired End State

- `/admin/manual` contains detailed, structured end-user guidance for the full product workflow surface:
  - public pages (booking/contact),
  - student portal,
  - admin bookings/customers/materials,
  - invoices,
  - reports,
  - settings,
  - operator runbook sections.
- The in-app manual content is generated from or synchronized with a structured source (preferably the `Documentation/` markdown suite + a manifest layer).
- A Playwright screenshot capture command produces deterministic screenshots for documentation and in-app display.
- Screenshot metadata (alt text, captions, section placement) is managed centrally and reused by both docs and `/admin/manual`.

## What We're NOT Doing

- Making `/admin/manual` public or indexed (it remains admin-authenticated).
- Replacing the existing `Documentation/` markdown suite with a CMS/database-backed solution.
- Building pixel-diff visual regression testing for the whole app in this pass (focus is documentation screenshot capture).
- Capturing production customer data/screenshots.

## Design Options

1. Keep expanding `AdminManualClient` with hard-coded JSX sections and screenshot arrays.
   - Pros: fastest initial changes.
   - Cons: high drift risk, hard to maintain, duplicates markdown docs, poor scalability.

2. Use a structured manual content model backed by repo docs + manifest (selected).
   - Pros: maintainable, central screenshot metadata, clear sync path with `Documentation/`.
   - Cons: requires parser/transform layer and initial content mapping work.

3. Store manual content and screenshots in the database.
   - Pros: editable in-app eventually.
   - Cons: unnecessary complexity, migration/admin tooling burden, wrong source-of-truth for versioned docs.

Selected approach: Option 2.

## Implementation Approach

- Introduce a structured manual content/manifest layer that maps manual sections to docs files and screenshot assets.
- Refactor `/admin/manual` to render rich section content (TOC, anchors, screenshots, task steps) from that layer.
- Add a Playwright screenshot capture workflow with deterministic seeded demo data and stable viewports.
- Add docs/scripts to recapture screenshots and sync public thumbnails used by the in-app manual.
- Incrementally expand guide coverage and integrate screenshots section-by-section so the manual remains usable throughout.

## Phase 1: Manual Scope Inventory and Content Model

### Overview

Define what “all functions” means in the context of the manual, choose the source-of-truth structure, and build a section manifest that maps product areas to docs content and screenshots.

### Changes Required

#### 1. Workflow Coverage Matrix
**Files**:
- `Documentation/README.md`
- `thoughts/plans/admin-manual-full-end-user-manual-and-playwright-screenshot-automation-implementation-plan.md`

**Changes**:
- Create a coverage matrix for all user-visible functions:
  - public pages + contact + booking request
  - student portal login/dashboard/material previews/downloads
  - admin bookings/customers/materials
  - invoices
  - reports
  - settings
  - deploy/update runbook (technical owner section)
- Mark which existing guide covers each area and where new/updated guide sections are required.

#### 2. Manual Content Manifest / Schema
**Files** (new, representative):
- `src/lib/manual/content.ts` or `src/lib/manual/schema.ts`
- `Documentation/manual-manifest.json` (optional alternative)

**Changes**:
- Define a typed schema for in-app manual sections:
  - id / title / audience label
  - source markdown file(s)
  - summary
  - screenshot references
  - anchor/nav metadata
  - related routes
- Define a shared screenshot metadata model (alt text, captions, asset paths, thumbnail path).

#### 3. Markdown Rendering Strategy Decision
**Files**:
- `package.json` (if parser dependency is selected)
- `src/lib/manual/*` (loader/parser)

**Changes**:
- Choose and document the implementation method for showing detailed docs in-app:
  - parse `Documentation/*.md` server-side (preferred), or
  - compile a generated JSON artifact from docs at build time.
- Lock down a whitelist of readable docs files to avoid arbitrary filesystem browsing in admin.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck` (if schema/loader introduced)
- [x] `npm run lint`

#### Manual Verification
- [x] Coverage matrix clearly maps every major app function to a manual section
- [x] Source-of-truth model is explicit (no unresolved “where should text live?” ambiguity)

---

## Phase 2: Expand Documentation Content for Missing Features

### Overview

Bring the repository end-user docs fully up to date so the in-app manual can present a complete set of current workflows.

### Changes Required

#### 1. Add/Update Guide Sections for Newer Features
**Files** (likely updates + new guides):
- `Documentation/03-Booking-Management.md`
- `Documentation/05-Invoice-Management.md`
- `Documentation/07-Reports-Outstanding-and-Follow-Up.md`
- `Documentation/08-Troubleshooting-and-FAQs.md`
- `Documentation/README.md`
- Potential new guides such as:
  - `Documentation/10-Admin-Settings-and-System-Configuration.md`
  - `Documentation/11-Admin-Reports-Dashboard.md`
  - `Documentation/12-Student-Portal-and-Learning-Materials.md`
  - `Documentation/13-Public-Booking-and-Contact-Forms.md`

**Changes**:
- Document current functionality added since the initial docs suite:
  - admin settings screen and restart behavior
  - admin reports console (daily/weekly/monthly/yearly + comparisons + date format)
  - learning-material preview/download and general (non-booking-linked) materials
  - invoice package preset dropdowns
  - latest updates popup/button
  - booking request popup confirmation and degraded-email success behavior
- Ensure wording matches current UI labels.

#### 2. In-App Manual Copy for Task Navigation / Summaries
**Files**:
- `src/lib/manual/content.ts` (or equivalent)
- `src/components/admin-manual-client.tsx`

**Changes**:
- Add short in-app summaries and “when to use this section” text, while deferring detailed step content to parsed docs sections.
- Label technical/operator-only sections clearly so non-technical admins don’t confuse deploy steps with day-to-day tasks.

### Success Criteria

#### Automated Verification
- [x] `npm run lint`

#### Manual Verification
- [x] Manual coverage includes bookings, invoices, reports, settings, student portal, and public forms
- [x] In-app manual labels match current UI names/routes

---

## Phase 3: Playwright Screenshot Automation Foundation

### Overview

Add a real Playwright harness and deterministic screenshot capture workflow to replace the current ad hoc/manual process.

### Changes Required

#### 1. Playwright Tooling Setup
**Files**:
- `package.json`
- `playwright.config.ts` (new)
- `tests/e2e/` or `scripts/playwright/` (new)

**Changes**:
- Add explicit Playwright dependency and runnable scripts (for example):
  - `npm run test:e2e`
  - `npm run docs:screenshots`
  - `npm run docs:screenshots:update`
- Configure headless capture with stable viewport(s), timeouts, and screenshot output directories.
- Disable/mitigate animation nondeterminism for screenshot runs (reduced motion, wait-for-idle strategy, or app flags).

#### 2. Deterministic Demo Data Seeding
**Files** (new, representative):
- `scripts/seed-docs-screenshots.ts` or `scripts/seed-docs-screenshots.cjs`
- `scripts/reset-docs-screenshots.ts` (optional)
- `prisma/` (seed helper usage only; no schema changes expected)

**Changes**:
- Seed predictable fake customers/bookings/invoices/materials/reports data for screenshot capture.
- Ensure no real data is used in captured screenshots.
- Document local env requirements (MySQL test/demo DB URL, storage path, email disabled/fake mode).

#### 3. Screenshot Capture Spec(s)
**Files** (new, representative):
- `tests/e2e/docs-screenshots.spec.ts`
- `Documentation/assets/manifest.json` or `src/lib/manual/screenshots.ts`

**Changes**:
- Automate login and route navigation for screenshot capture:
  - admin login
  - bookings calendar / booking dialog / manual booking flow
  - customer directory and materials
  - invoice console / create / detail
  - reports console
  - settings console
  - student portal (seeded credentials)
  - public booking/contact pages
- Write screenshots with stable names matching `Documentation/assets/README.md` conventions.
- Track screenshot metadata (captions/alt text/section linkage) in a central manifest.

### Success Criteria

#### Automated Verification
- [x] `npm run docs:screenshots` generates the expected asset set
- [ ] `npm run test:e2e` runs at least the screenshot capture suite locally
- [x] Generated screenshots land in `Documentation/assets/` with expected filenames

#### Manual Verification
- [x] Screenshot captures are readable and free of real/sensitive data
- [x] Screenshot filenames/captions map cleanly to documentation sections

---

## Phase 4: In-App Manual UI Refactor (Full Content + TOC + Screenshots)

### Overview

Refactor `/admin/manual` from a static hub into a structured manual viewer that renders detailed sections and screenshot callouts.

### Changes Required

#### 1. Manual Data Loading + Rendering
**Files**:
- `src/app/admin/manual/page.tsx`
- `src/components/admin-manual-client.tsx`
- `src/lib/manual/*` (new loader/parser/manifest helpers)

**Changes**:
- Load manual section data (server-side preferred) and pass it to a client viewer for navigation/search.
- Replace the current fixed screenshot grid and hard-coded quick text with:
  - table of contents / section navigation
  - section anchors
  - structured steps / notes / warnings
  - inline screenshot callouts tied to section content
- Keep existing admin header navigation and `Latest Updates` button.

#### 2. Manual Viewer UX Enhancements
**Files**:
- `src/styles/globals.css`
- `src/components/admin-manual-client.tsx`

**Changes**:
- Improve readability for long manuals:
  - sticky TOC on desktop
  - mobile-friendly collapsed section nav
  - “technical owner” badges/callouts
  - screenshot caption styling / enlarge-on-click modal (optional but recommended)
- Add “last updated”/version metadata display (sourced from docs manifest/changelog if practical).

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [ ] Admin can navigate the manual quickly by section/anchor
- [ ] Screenshots appear inline in the relevant sections
- [ ] Manual remains readable on desktop and mobile

---

## Phase 5: Screenshot Sync, Docs Integration, and Update Workflow

### Overview

Finalize the pipeline so screenshots and manual content can be refreshed safely and repeatably after feature changes.

### Changes Required

#### 1. Asset Sync and Public Thumbnail Strategy
**Files**:
- `scripts/sync-manual-screenshots.(ts|cjs)` (new, if needed)
- `public/documentation/screenshots/`
- `Documentation/assets/README.md`

**Changes**:
- Define which screenshots are copied from `Documentation/assets/` to `public/documentation/screenshots/` for the in-app manual.
- Add a script/command for sync/copy (and optional resizing/selection) to avoid manual copying.
- Document thumbnail-vs-fullsize path conventions.

#### 2. Documentation + Runbook Updates
**Files**:
- `Documentation/README.md`
- `Documentation/CHANGELOG.md`
- `README.md`
- `deploy/README.md` (only if workflow command references are added)

**Changes**:
- Document how to regenerate screenshots with Playwright.
- Document prerequisites (local DB/data seed, login credentials, app running).
- Update changelog/version notes for the manual overhaul and automated screenshot pipeline.

#### 3. Guardrails / Validation (Optional but Recommended)
**Files**:
- `scripts/validate-doc-screenshots.(ts|cjs)` (new)
- CI workflow or local script docs (if repo has CI integration target)

**Changes**:
- Validate that screenshot manifest entries point to existing files.
- Optionally flag missing/unused screenshot assets to control drift.

### Success Criteria

#### Automated Verification
- [x] `npm run docs:screenshots`
- [x] `npm run docs:screenshots:sync` (if added)
- [ ] screenshot manifest validation passes (if added)
- [x] `git diff --check`

#### Manual Verification
- [ ] A developer/operator can follow the screenshot refresh docs end-to-end without guesswork
- [ ] `/admin/manual` and `Documentation/` show aligned screenshots/captions for core workflows

---

## Phase 6: Final QA and Rollout

### Overview

Run an end-to-end manual review and confirm the new manual and screenshot tooling are production-ready for ongoing maintenance.

### Changes Required

#### 1. Functional QA Sweep
**Files**:
- `src/app/admin/manual/page.tsx`
- `src/components/admin-manual-client.tsx`
- `Documentation/**`
- screenshot automation scripts/specs

**Changes**:
- No major feature additions; focus on correctness, formatting, and content accuracy.
- Fix broken anchors, mislabeled screenshots, stale captions, or missing sections.

#### 2. Rollout / Handover Notes
**Files**:
- `Documentation/README.md`
- `Documentation/CHANGELOG.md`
- `thoughts/tickets/feature_admin_manual_full_end_user_manual_and_playwright_screenshots.md`

**Changes**:
- Record the screenshot refresh workflow and maintenance owner expectations.
- Close the ticket with known follow-ups (for example mobile screenshot expansion or localization).

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run docs:screenshots` (or targeted capture suite) succeeds in the documented environment

#### Manual Verification
- [ ] `/admin/manual` acts as a practical one-stop manual for day-to-day admin operators
- [ ] Technical owner can refresh screenshots and docs after UI changes
- [ ] No broken images/anchors in the in-app manual or documentation index

---

## Testing Strategy

- Treat the manual as a product surface:
  - validate navigation, readability, and mobile layout for `/admin/manual`
  - verify auth protection still redirects unauthenticated users
- Treat screenshot capture as tooling:
  - deterministic seed -> capture -> output validation
  - confirm filenames and manifest linkage
- Run targeted Playwright captures first (smoke subset), then full docs capture set.
- Keep automated verification separate from manual content review; screenshots can “pass” technically while still having poor framing/cropping.

## Performance Considerations

- Avoid loading and rendering the entire documentation suite as one huge client payload if possible; prefer server-side parsing and sectionized rendering.
- Use thumbnail images in `/admin/manual`, with optional full-size links/modal to reduce page weight.
- Consider lazy loading screenshots below the fold.

## Migration Notes

- No DB schema migration is required for the manual/docs feature itself.
- Playwright tooling may add new dev dependencies and scripts.
- Screenshot automation will likely require a documented local/staging data-seeding flow (MySQL-backed) before first run.

## Execution Progress

### Completed in this execution pass
- Phase 1 foundation implemented:
  - added typed manual content/screenshot manifest and whitelisted doc loader (`src/lib/manual/content.ts`)
  - added coverage matrix to `Documentation/README.md`
  - selected/implemented server-side markdown loading strategy using `marked`
- Phase 2 content expansion implemented:
  - added end-user guides for settings, reports, student portal/materials, and public forms (`Documentation/10-13*.md`)
  - updated docs changelog and screenshot workflow docs (`Documentation/CHANGELOG.md`, `Documentation/assets/README.md`)
- Phase 4 major manual UI refactor implemented:
  - `/admin/manual` now loads structured content from repo docs
  - in-app TOC, coverage matrix, section routing pills, audience badges and inline screenshots added
- Phase 5 partial implemented:
 - Phase 5 mostly implemented:
  - screenshot sync script added (`scripts/sync-manual-screenshots.cjs`)
  - public screenshot sync path standardized (`public/documentation/screenshots/`)
  - deterministic MySQL/Prisma screenshot demo seed implemented (`scripts/seed-docs-screenshots.cjs`)
- Phase 3 foundation implemented and validated:
  - Playwright config added (`playwright.config.ts`)
  - `test:e2e` placeholder replaced with Playwright runner
  - docs screenshot spec added with public, student portal, and authenticated admin page capture (`tests/e2e/docs-screenshots.spec.ts`)
  - docs screenshot scripts added to `package.json`

### Verification completed in this pass
- `npm run typecheck` ✅
- `npm run lint -- --file src/app/admin/manual/page.tsx --file src/components/admin-manual-client.tsx --file src/lib/manual/content.ts --file src/styles/globals.css` ✅ (CSS file emits a Next lint “file ignored” warning only)
- `npx playwright test tests/e2e/docs-screenshots.spec.ts --list` ✅
- `npm run docs:screenshots` ✅ (full run against seeded local MySQL demo dataset; public + student portal + authenticated admin pages captured)
- `npm run docs:screenshots:seed` ✅
- `npm run docs:screenshots:sync` ✅
- `git diff --check` ✅

### Follow-up dialog capture expansion (option 2)
- Extended `tests/e2e/docs-screenshots.spec.ts` to capture dialog-level screenshots for admin bookings/customers/invoices.
- Re-ran seeded Playwright capture and re-synced `public/documentation/screenshots/` with refreshed dialog/filter assets.
- Updated docs gallery/guide references to include the new dialog/filter screenshots (`Documentation/README.md`, `Documentation/05-Invoice-Management.md`, `Documentation/CHANGELOG.md`).

## Deviations from Plan

### Phase 3 / Phase 6: Authenticated Capture + Final QA Coverage
- **Original Plan**: Execute a working screenshot capture suite for the full documentation/manual surface and finish final QA.
- **Actual Implementation**: The Playwright capture suite was executed successfully against a seeded local MySQL demo environment, including public pages, student portal dashboard, and authenticated admin pages (`/admin/manual`, `/admin/reports`, `/admin/settings`, `/admin/invoices`, `/admin/bookings`). Final visual QA/build validation is still pending.
- **Reason for Deviation**: Final acceptance still requires a human visual review of framing/cropping and optional additional dialog-specific captures beyond the current page-level set.
- **Impact Assessment**: Screenshot automation and seeded demo environment are operational. Remaining work is QA/polish rather than missing infrastructure.
- **Date/Time**: 2026-02-25

## References

- Ticket: `thoughts/tickets/feature_admin_manual_full_end_user_manual_and_playwright_screenshots.md`
- Prior docs umbrella ticket: `thoughts/tickets/2026-02-19-end-user-documentation-suite.md`
- Prior docs implementation plan: `thoughts/plans/end-user-documentation-suite-implementation-plan.md`
- Current admin manual route: `src/app/admin/manual/page.tsx`
- Current admin manual UI: `src/components/admin-manual-client.tsx`
- Docs index / gallery: `Documentation/README.md`
- Screenshot asset guidance: `Documentation/assets/README.md`
- Current placeholder e2e script: `package.json`
