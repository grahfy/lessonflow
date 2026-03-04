---
date: 2026-03-04T02:56:01+11:00
git_commit: a70da8d
branch: main
repository: melbourne-guitar-school
topic: "Research: FEAT-EPIC admin UI polish, manual rewrite, and student portal contract sync"
tags: [research, admin, customers, bookings, invoices, tooltip, manual, documentation, student-portal]
last_updated: 2026-03-04T02:56:01+11:00
---

## Ticket Synopsis

Research for:
- `thoughts/tickets/feature_admin_ui_polish_manual_rewrite_and_student_portal_sync_epic.md`
- `thoughts/tickets/bug_admin_customers_dialog_title_customer_details_colon.md`
- `thoughts/tickets/feature_admin_invoices_dialog_mark_as_paid_action_visibility.md`
- `thoughts/tickets/bug_admin_bookings_edit_dialog_scroll_lock_and_layout_constraints.md`
- `thoughts/tickets/feature_ui_tooltips_systemwide_descriptive_coverage.md`
- `thoughts/tickets/feature_admin_manual_full_rewrite_replace_legacy_documentation.md`
- `thoughts/tickets/debt_student_portal_refactor_for_admin_api_contract_changes.md`

## Summary

The six requested areas are all valid, but they differ in risk and required architecture changes:

1. Customer dialog title fix is a single-line copy change in one component.
2. Invoice `Mark as Paid` already exists in detail footer for `sent` invoices, but discoverability and status gating are inconsistent with operator expectations.
3. Booking edit dialog has no document/body scroll lock; multiple nested scroll containers create unstable modal scroll behavior.
4. Tooltip coverage is currently near-zero and there is no reusable tooltip primitive in the design system.
5. Manual rewrite is tightly coupled to `Documentation/**` as source-of-truth and to screenshot scripts/paths; replacing legacy docs requires coordinated migration across `src/lib/manual/content.ts`, Playwright capture, README links, and sync scripts.
6. Student portal clients duplicate API types locally and cast JSON without shared schema validation; this is the core contract-drift risk.

## Detailed Findings

### Locate Phase

- Admin dialog and scroll primitives:
  - `src/components/admin/ui/admin-dialog.tsx`
  - `src/styles/globals.css`
  - `src/components/admin/bookings/booking-detail-dialog.tsx`
- Invoice action flow:
  - `src/components/admin/invoices/invoices-client.tsx`
  - `src/lib/admin/use-invoices.ts`
  - `src/app/api/admin/invoices/[id]/route.ts`
- Manual system:
  - `src/lib/manual/content.ts`
  - `src/components/admin/manual/manual-client.tsx`
  - `src/components/admin/manual/manual-section-client.tsx`
  - `tests/e2e/docs-screenshots.spec.ts`
  - `scripts/sync-manual-screenshots.cjs`
  - `Documentation/**`
- Student portal contract surfaces:
  - `src/components/student-portal-client.tsx`
  - `src/components/student-materials-client.tsx`
  - `src/app/api/student/portal/route.ts`
  - `src/app/api/student/bookings/route.ts`
  - `src/app/api/student/bookings/[id]/route.ts`

### Pattern-Find Phase

- Shared admin modal pattern currently relies on CSS fixed overlay + internal scroll container, not body-lock side effects.
- Invoice lifecycle actions are routed through `performAction("mark_paid"|"mark_unpaid"|"void")` from client to `PATCH /api/admin/invoices/:id`.
- Manual/in-app docs source pattern is manifest-driven and file-whitelisted against `Documentation/**` markdown paths.
- Screenshot pipeline pattern is `docs:screenshots` (Playwright -> `Documentation/assets`) + `docs:screenshots:sync` (`Documentation/assets` -> `public/documentation/screenshots`).
- Student portal and student materials pages both independently define `PortalPayload` and deserialize via `as PortalPayload` with no runtime guard.

### Analyze Phase

#### A) Customer dialog title (`Customer Details:`)

- Current title string is `"Customer Details"` in `CustomerDialogWrapper`.
- No other runtime logic depends on this literal value.
- This ticket is safely atomic and independent.

#### B) Invoice dialog `Mark as Paid` visibility/consistency

- Current footer shows:
  - `MARK AS PAID` only when `status === "sent"`.
  - `MARK AS UNPAID` only when `status === "paid"`.
- Backend route accepts `action === "mark_paid"` and sets `status: "paid"` without checking current status.
- Result: UI and backend rules are not explicitly aligned; UI discoverability is narrow, backend transition is permissive.
- Additional UX inconsistency: invoice dialog duplicates reminder action in both footer and right-side card.

#### C) Booking edit dialog scroll-lock

- `AdminDialog` does not toggle `document.body.style.overflow` or equivalent lock class.
- CSS currently has three scroll layers for booking edit in practice:
  - `.dialog-panel { overflow: auto; }`
  - `AdminDialog` content wrapper `{ overflowY: auto }`
  - `.booking-dialog-scroll { overflow: auto }`
- Nested overflow containers are likely causing wheel/trackpad ambiguity and background scroll bleed.

#### D) Tooltip coverage

- No reusable tooltip component exists in `src/components/admin/ui/**`.
- Dependencies include `@radix-ui/react-dialog`, but not `@radix-ui/react-tooltip`.
- Current tooltip behavior is limited to form validation `title="..."` attributes in public/student forms and SVG `<title>` in reports.
- Many non-obvious or destructive controls have no descriptive helper affordance (example: icon nav arrows, `×` line-item remove button, destructive action buttons).

#### E) Manual full rewrite and legacy docs replacement

- In-app manual is directly coupled to `Documentation/**`:
  - Manifest sections hardcode markdown file paths in `Documentation/`.
  - Whitelist enforcement blocks non-manifest source paths.
  - Markdown link rewriting assumes local docs + assets model.
- Screenshot metadata and sync scripts are coupled to `Documentation/assets` as source path.
- Playwright docs screenshot spec is stale against current UI labels/selectors in several places (for example `Create invoice` vs current `Invoice / Billing`, and `View` button vs current `Edit` in invoices list).
- CSS class drift exists: manual client components use several class names not defined in current stylesheet (`admin-manual-content-wrapper`, `admin-manual-content`, `admin-manual-html`, `admin-manual-screenshots`, `admin-manual-card`, `admin-manual-group`).
- Replacing/removing legacy `Documentation/**` without migration will break:
  - manual index/section rendering,
  - screenshot sync assumptions,
  - docs references in `README.md` and docs guides.

#### F) Student portal contract refactor

- `StudentPortalClient` and `StudentMaterialsClient` each define their own `PortalMaterial`/`PortalBooking`/`PortalPayload` types (not shared).
- Both clients cast API JSON to local types without runtime parsing.
- `/api/student/portal` duplicates response-mapping code for `upcoming` and `previous` blocks.
- Create/cancel student booking endpoints use route-local schemas/contracts; there is no shared module representing the student API contract surface.
- Existing `src/lib/student-portal/*` modules already centralize credential/session/material storage utilities, so there is a natural home for shared student API schemas/types.

## Code References

- `src/components/admin/customers/customer-dialog-wrapper.tsx:114` - current dialog title `"Customer Details"`.
- `src/components/admin/invoices/invoices-client.tsx:486` - `MARK AS PAID` rendered only for `sent` invoices.
- `src/components/admin/invoices/invoices-client.tsx:492` - `MARK AS UNPAID` rendered only for `paid` invoices.
- `src/components/admin/invoices/invoices-client.tsx:516` - reminder button in footer.
- `src/components/admin/invoices/invoices-client.tsx:612` - reminder button duplicated in side panel.
- `src/lib/admin/use-invoices.ts:137` - `mark_paid`/`mark_unpaid` mapped to `PATCH /api/admin/invoices/:id`.
- `src/app/api/admin/invoices/[id]/route.ts:108` - backend `mark_paid` transition path.
- `src/components/admin/ui/admin-dialog.tsx:56` - dialog internal overflow container.
- `src/styles/globals.css:1574` - `.dialog-panel` with `overflow: auto`.
- `src/styles/globals.css:1615` - `.booking-dialog-scroll` with `overflow: auto`.
- `src/components/admin/bookings/booking-detail-dialog.tsx:123` - booking dialog nested scroll wrapper.
- `src/components/admin/bookings/bookings-client.tsx:580` - booking invoice action creates draft via booking endpoint.
- `src/components/admin/bookings/bookings-client.tsx:624` - invoice draft open handoff via `openInvoiceId` query.
- `package.json:31` - no tooltip package dependency present.
- `src/components/student-login-form.tsx:81` - native `title` tooltip usage.
- `src/components/booking-form.tsx:214` - native `title` tooltip usage.
- `src/components/admin/bookings/bookings-client.tsx:501` - icon-only previous navigation button (`←`).
- `src/components/admin/invoices/invoices-client.tsx:575` - icon-only remove line-item button (`×`).
- `src/lib/manual/content.ts:195` - manual section manifest.
- `src/lib/manual/content.ts:331` - doc path whitelist derived from manifest.
- `src/lib/manual/content.ts:374` - manual index built from manifest file mtimes.
- `src/lib/manual/content.ts:403` - section rendering reads markdown + parses HTML.
- `src/lib/manual/content.ts:339` - markdown image path rewrite to `/documentation/screenshots/*`.
- `scripts/sync-manual-screenshots.cjs:6` - screenshot source folder `Documentation/assets`.
- `scripts/sync-manual-screenshots.cjs:7` - screenshot target folder `public/documentation/screenshots`.
- `tests/e2e/docs-screenshots.spec.ts:6` - Playwright output dir `Documentation/assets`.
- `tests/e2e/docs-screenshots.spec.ts:219` - expects `Create invoice` button text in booking dialog.
- `tests/e2e/docs-screenshots.spec.ts:235` - expects `Create Invoice` dialog heading text.
- `tests/e2e/docs-screenshots.spec.ts:248` - expects invoices list `View` button text.
- `src/components/admin/manual/manual-section-client.tsx:83` - uses `admin-manual-content-wrapper` class.
- `src/styles/globals.css:3884` - defined manual CSS classes (different class set).
- `src/components/student-portal-client.tsx:41` - local `PortalPayload` type in portal page.
- `src/components/student-materials-client.tsx:26` - local `PortalPayload` type in materials page.
- `src/app/api/student/portal/route.ts:110` - canonical portal payload assembly.
- `src/app/api/student/bookings/route.ts:13` - student create-booking schema (route-local).
- `src/app/api/student/bookings/[id]/route.ts:16` - student cancel-booking contract.
- `src/lib/student-portal/materials.ts:31` - shared material helpers already centralized.
- `src/lib/student-portal/session.ts:123` - student auth extraction helper.

## Architecture Insights

- Shared component leverage is strong (`AdminDialog`, `AdminTable`, manual content loader, student portal libs), but behavior and contracts drift where data/schema definitions are duplicated at the edges.
- For low-risk sequencing:
  1. Apply atomic UI copy/action/scroll fixes first (customers, invoice dialog actions, booking modal lock).
  2. Introduce tooltip primitive and a coverage matrix before mass application.
  3. Perform manual rewrite as a content+pipeline migration (not a pure content edit).
  4. Refactor student portal contracts into shared schema/types and then adapt both clients.
- Manual rewrite and student portal refactor both touch test/docs/runtime assumptions and should be shipped with synchronized env/docs/test updates.

## Historical Context (from thoughts/)

- Prior admin dialog/list stabilization research already identified shared CSS and admin layout fragility in this area: `thoughts/research/2026-03-04_admin-ui-dialogs-and-list-scrolling-epic-research.md`.
- Prior end-user documentation research and planning established docs as operational product content with screenshot governance: `thoughts/research/2026-02-19_end-user-documentation-suite-research.md`.
- Prior student portal research established auth/session and learning-material architecture decisions; current gap is contract centralization and maintenance resilience: `thoughts/research/2026-02-20-student-portal-research.md`.
- Prior invoice create/linking research documented UI/backend contract mismatch patterns that reappear in action discoverability concerns: `thoughts/research/2026-02-20-admin-invoice-create-customer-selection-booking-linking-research.md`.

## Related Research

- `thoughts/research/2026-03-04_admin-ui-dialogs-and-list-scrolling-epic-research.md`
- `thoughts/research/2026-02-19_end-user-documentation-suite-research.md`
- `thoughts/research/2026-02-20-student-portal-research.md`
- `thoughts/research/2026-02-20-admin-invoice-create-customer-selection-booking-linking-research.md`

## Open Questions

- For tooltip rollout, should “all UI options” be interpreted literally (every interactive control) or prioritized to non-obvious/high-risk controls first with explicit exclusions?
- For manual replacement, should legacy `Documentation/**` be fully deleted in the same PR, or migrated in two phases (new source first, cleanup second) to reduce break risk?
- For invoice status transitions, should backend enforce allowed transitions (`draft -> sent -> paid`) so UI visibility and API behavior cannot diverge?
