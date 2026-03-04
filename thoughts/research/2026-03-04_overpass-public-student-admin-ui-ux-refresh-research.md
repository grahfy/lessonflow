---
date: 2026-03-04T06:44:51+11:00
git_commit: a70da8dbc57e4ce2eca1447c17d3c5cd9b9fc249
branch: main
repository: melbourne-guitar-school
topic: "Research: FEAT-EPIC Overpass brand refresh and multi-surface UI/UX upgrade"
tags: [research, epic, public-ui, student-portal, admin-ui, dialogs, reports, manual, playwright]
last_updated: 2026-03-04T06:55:32+11:00
---

## Ticket Synopsis

Research for:
- `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`
- `thoughts/tickets/feature_global_overpass_and_public_layout_alignment_polish.md`
- `thoughts/tickets/feature_student_login_layout_alignment_and_visual_parity.md`
- `thoughts/tickets/bug_admin_dialog_consistency_invoice_customer_navigation_and_layout.md`
- `thoughts/tickets/feature_global_dialog_system_consistency_across_public_student_admin.md`
- `thoughts/tickets/bug_tooltip_visibility_and_layering_regression.md`
- `thoughts/tickets/feature_admin_reports_console_readability_and_multi_chart_upgrade.md`
- `thoughts/tickets/feature_admin_manual_rewrite_as_arts_teaching_operations_guide.md`
- `thoughts/tickets/feature_admin_page_specific_gradients_and_enhanced_3d_controls.md`
- `thoughts/tickets/debt_playwright_full_site_local_verification_and_manual_screenshot_recapture.md`

## Summary

All user-requested items are mapped into the epic + child tickets, and the added Playwright verification child ticket is in place.

Key implementation realities from code:
1. Public typography is still `Sora`/`Space Grotesk`, not `Overpass`.
2. Public CTA/button row alignment is mixed and mostly flow-based; explicit equal-width justification is not standardized.
3. CAPTCHA input and `New image` are currently rendered as separate block controls.
4. Student login currently renders `postcode` compact and `password` full-width, and uses a special hero sizing rule that diverges from other front-page visuals.
5. Admin booking/customer/invoice dialogs still have per-component inline sizing/layout logic (`minHeight: 650px`, ad-hoc tab rows), causing consistency drift.
6. Invoice -> customer navigation still uses query-driven open state and customers dialog close does not clear URL params, which can re-trigger dialog lifecycle unexpectedly.
7. Reports console has trend toggles but only one chart renderer (`MiniBarChart`) and no chart-type mode switch.
8. Manual is manifest-driven and tightly coupled to `Documentation/**` + screenshot sync scripts.
9. Admin shell supports custom class names, but only manual currently uses a variant class; other admin pages still share one gradient/button theme.
10. Full-site local script currently runs unit/integration tests, not Playwright; docs screenshots are a separate script path.

## Detailed Findings

### Locate Phase

Core files identified for this epic:
- Public typography/layout: `src/styles/globals.css`, `src/app/page.tsx`, `src/app/lessons/page.tsx`, `src/app/vouchers/page.tsx`, `src/app/teacher/page.tsx`, `src/app/videos/page.tsx`, `src/app/contact/page.tsx`, `src/app/terms/page.tsx`, `src/components/captcha.tsx`, `src/components/panel-layout.tsx`, `src/components/student-login-form.tsx`.
- Dialog consistency + admin workflow bugs: `src/components/admin/ui/admin-dialog.tsx`, `src/components/image-modal.tsx`, `src/components/videos-grid-modal.tsx`, `src/components/admin/bookings/booking-detail-dialog.tsx`, `src/components/admin/customers/customer-dialog-wrapper.tsx`, `src/components/admin/customers/customer-profile-dialog.tsx`, `src/components/admin/customers/customer-email-dialog.tsx`, `src/components/admin/customers/customer-materials-dialog.tsx`, `src/components/admin/customers/customers-client.tsx`, `src/components/admin/invoices/invoices-client.tsx`.
- Reports/manual/theming: `src/components/admin-reports-client.tsx`, `src/components/admin/layout/admin-shell.tsx`, `src/components/admin/manual/manual-client.tsx`, `src/components/admin/manual/manual-section-client.tsx`, `src/lib/manual/content.ts`.
- Verification pipeline: `scripts/test-full-site-local.sh`, `tests/e2e/docs-screenshots.spec.ts`, `scripts/sync-manual-screenshots.cjs`, `package.json`.

### Pattern-Find Phase

- Public CTA groups rely on generic `.button-row` and page-local wrappers instead of a shared “equal-width justified CTA pair/trio” token.
- Admin modal architecture is split between `AdminDialog` and separate public/manual modal overlays.
- Customer tab panes each define their own structural height/layout via inline styles (`minHeight: 650px`) rather than shared tokens.
- Invoice detail dialog action hierarchy mixes footer actions + side-panel guidance and cross-route navigation into customers.
- Reports already have modular cards, but chart rendering is hardcoded to one SVG bar renderer.
- Manual delivery is already route-driven and manifest-backed, with docs markdown as source-of-truth and screenshot IDs mapped to assets.

### Analyze Phase

#### A) Global Overpass + public page alignment

- Fonts are still imported as `Sora` and `Space Grotesk` in global CSS (`src/styles/globals.css:1`, `src/styles/globals.css:41`).
- Home action buttons and metric boxes are rendered in separate wrappers without guaranteed equal-width behavior (`src/app/page.tsx:52`, `src/app/page.tsx:69`, `src/styles/globals.css:663`, `src/styles/globals.css:836`).
- Bottom CTA rows across lessons/vouchers/teacher/videos all use shared `.button-row` without per-page justification contract (`src/app/lessons/page.tsx:92`, `src/app/vouchers/page.tsx:68`, `src/app/teacher/page.tsx:74`, `src/app/videos/page.tsx:58`, `src/styles/globals.css:656`).
- Contact map trigger is wrapped in a `<li>` inside `.list`; list items currently apply boxed styling globally (`src/app/contact/page.tsx:60`, `src/app/contact/page.tsx:61`, `src/styles/globals.css:1131`).
- Terms page contains literal `...` in JSX (`src/app/terms/page.tsx:52`).
- CAPTCHA input and `New image` button are sequential controls (not inline group) in shared component (`src/components/captcha.tsx:194`, `src/components/captcha.tsx:207`).

#### B) Student login alignment + visual parity

- `postcode` uses compact field class, while `password` is full-width (`src/components/student-login-form.tsx:73`, `src/components/student-login-form.tsx:89`).
- Compact class caps width via shared rule (`src/styles/globals.css:1170`).
- Student hero has special width/aspect/background-size rules (`src/styles/globals.css:907`) plus separate mobile override (`src/styles/globals.css:3410`), while panel visual baseline is defined elsewhere (`src/styles/globals.css:864`, `src/styles/globals.css:876`).

#### C) Admin dialog consistency + invoice/customer bug

- Booking dialog tabs and “Open Customer” placement are currently split (tabs row at top, open customer inside matched-customer card) (`src/components/admin/bookings/booking-detail-dialog.tsx:129`, `src/components/admin/bookings/booking-detail-dialog.tsx:166`).
- “Booking is linked to an existing customer.” sits as helper text inside card, with additional helper text lines in same section (`src/components/admin/bookings/booking-detail-dialog.tsx:145`).
- Communication tab and appointment tab differ structurally in content and action placement (`src/components/admin/bookings/booking-detail-dialog.tsx:284`, `src/components/admin/bookings/booking-detail-dialog.tsx:312`).
- Customer tabs each carry separate height/layout styling (`src/components/admin/customers/customer-profile-dialog.tsx:136`, `src/components/admin/customers/customer-profile-dialog.tsx:274`, `src/components/admin/customers/customer-email-dialog.tsx:27`, `src/components/admin/customers/customer-materials-dialog.tsx:39`).
- Invoice detail dialog contains dense mixed sections and multiple action clusters (`src/components/admin/invoices/invoices-client.tsx:498`, `src/components/admin/invoices/invoices-client.tsx:561`, `src/components/admin/invoices/invoices-client.tsx:635`).
- `VIEW CUSTOMER` pushes to customers with `customerId` + `open=true` query (`src/components/admin/invoices/invoices-client.tsx:590`).
- Customers page opens dialog from query params (`src/components/admin/customers/customers-client.tsx:137`) but close handler does not clear query params (`src/components/admin/customers/customers-client.tsx:121`), allowing reopen/re-entrancy behavior.

#### D) Global dialog system consistency

- `AdminDialog` centralizes admin backdrop/panel/body layout (`src/components/admin/ui/admin-dialog.tsx:80`) with z-index `70` in CSS (`src/styles/globals.css:2043`).
- Public `ImageModal` and `VideosGridModal` maintain separate modal logic, own escape listeners, and own body overflow handling (`src/components/image-modal.tsx:19`, `src/components/videos-grid-modal.tsx:29`).
- Shared modal overlay class uses very high z-index `9999` (`src/styles/globals.css:3931`).
- Manual section screenshot viewer also uses `modal-overlay` pattern (`src/components/admin/manual/manual-section-client.tsx:195`).

#### E) Tooltip visibility regression

- Tooltip wrapper uses Radix portal content and shared class (`src/components/admin/ui/tooltip.tsx:34`, `src/components/admin/ui/tooltip.tsx:37`, `src/components/admin/ui/tooltip.tsx:39`).
- Tooltip content z-index is `90` (`src/styles/globals.css:806`), which is below `modal-overlay` `9999` (`src/styles/globals.css:3931`) and near admin dialog backdrop/panel layering (`src/styles/globals.css:2043`).
- This creates a plausible clipping/stacking failure in layered dialog contexts.

#### F) Reports console UX + multi-chart support

- Trends currently render via a single `MiniBarChart` implementation (`src/components/admin-reports-client.tsx:193`) used for both appointments and earnings (`src/components/admin-reports-client.tsx:276`, `src/components/admin-reports-client.tsx:289`).
- Existing toggles control visible period panels, not chart visualization mode (`src/components/admin-reports-client.tsx:629`, `src/components/admin-reports-client.tsx:671`).
- API responses already provide suitable trend data for alternate chart renderers without contract change (`src/app/api/admin/reports/route.ts:8`).

#### G) Manual rewrite as arts teaching operations guide

- Manual content pipeline is manifest + markdown source backed (`src/lib/manual/content.ts:195`, `src/lib/manual/content.ts:403`).
- Source docs remain in `Documentation/**` and are path-whitelisted (`src/lib/manual/content.ts:331`, `src/lib/manual/content.ts:354`).
- Screenshot metadata and docs asset paths are centrally mapped (`src/lib/manual/content.ts:48`, `src/lib/manual/content.ts:53`).
- Manual UI already supports sectioned navigation/cards/screenshots, so rewrite is mainly IA/content + selective visual polish rather than a full rendering rewrite (`src/components/admin/manual/manual-client.tsx:69`, `src/components/admin/manual/manual-section-client.tsx:141`).

#### H) Admin page-specific gradients + stronger 3D controls

- `AdminShell` accepts `className` for per-page variants (`src/components/admin/layout/admin-shell.tsx:19`, `src/components/admin/layout/admin-shell.tsx:22`).
- Only manual currently applies custom shell variant (`src/components/admin/manual/manual-client.tsx:30`, `src/components/admin/manual/manual-section-client.tsx:72`).
- Base admin gradient/button styling is currently single-theme (`src/styles/globals.css:1640`, `src/styles/globals.css:1737`).

#### I) Playwright full-site verification + screenshot recapture

- `scripts/test-full-site-local.sh` performs Docker/env/migrations/seeding and `npm test`, then starts dev server; it does not run Playwright (`scripts/test-full-site-local.sh:177`).
- Script prints admin credentials only when `--seed` is used (`scripts/test-full-site-local.sh:157`, `scripts/test-full-site-local.sh:173`).
- Playwright screenshots are run by separate script (`package.json:19`) and synced via separate script (`package.json:20`, `scripts/sync-manual-screenshots.cjs:6`).
- Screenshot spec already supports env-driven admin/student capture paths (`tests/e2e/docs-screenshots.spec.ts:55`, `tests/e2e/docs-screenshots.spec.ts:79`).

## Code References

- `src/styles/globals.css:1` - Google font import currently Sora/Space Grotesk.
- `src/styles/globals.css:41` - body font-family still Sora.
- `src/styles/globals.css:656` - shared `.button-row` baseline.
- `src/styles/globals.css:663` - `.home-actions` layout.
- `src/styles/globals.css:836` - `.metrics` wrapper.
- `src/styles/globals.css:907` - `.student-login-hero` desktop sizing.
- `src/styles/globals.css:1131` - `.list li` boxed styling affecting contact map row.
- `src/styles/globals.css:1170` - compact field width limit.
- `src/styles/globals.css:1640` - single default admin shell theme.
- `src/styles/globals.css:1737` - admin button color theme.
- `src/styles/globals.css:2043` - admin dialog backdrop layer.
- `src/styles/globals.css:3931` - modal overlay layer for public/manual modals.
- `src/styles/globals.css:806` - tooltip z-index.
- `src/app/page.tsx:52` - home action buttons structure.
- `src/app/page.tsx:69` - home metrics structure.
- `src/app/lessons/page.tsx:92` - lessons bottom button row.
- `src/app/vouchers/page.tsx:68` - vouchers bottom button row.
- `src/app/teacher/page.tsx:74` - teacher bottom button row.
- `src/app/videos/page.tsx:58` - videos bottom button row.
- `src/app/contact/page.tsx:60` - contact list wrapper.
- `src/app/contact/page.tsx:61` - map trigger row.
- `src/app/terms/page.tsx:52` - literal `...` placeholder.
- `src/components/captcha.tsx:194` - CAPTCHA text input.
- `src/components/captcha.tsx:207` - `New image` button.
- `src/components/student-login-form.tsx:73` - postcode field compact class.
- `src/components/student-login-form.tsx:89` - password field full-width class.
- `src/components/admin/bookings/booking-detail-dialog.tsx:129` - appointment/communication tab row.
- `src/components/admin/bookings/booking-detail-dialog.tsx:145` - linked-customer helper text block.
- `src/components/admin/bookings/booking-detail-dialog.tsx:166` - `Open Customer` button location.
- `src/components/admin/customers/customer-dialog-wrapper.tsx:70` - custom header description row with tab controls.
- `src/components/admin/customers/customer-profile-dialog.tsx:136` - profile tab min-height inline style.
- `src/components/admin/customers/customer-email-dialog.tsx:27` - communication tab min-height inline style.
- `src/components/admin/customers/customer-materials-dialog.tsx:39` - learning materials tab min-height inline style.
- `src/components/admin/invoices/invoices-client.tsx:498` - invoice detail dialog.
- `src/components/admin/invoices/invoices-client.tsx:510` - mark paid action rendering.
- `src/components/admin/invoices/invoices-client.tsx:590` - `VIEW CUSTOMER` navigation handoff.
- `src/components/admin/customers/customers-client.tsx:121` - customer dialog close handler.
- `src/components/admin/customers/customers-client.tsx:137` - query-driven dialog open.
- `src/components/admin/ui/admin-dialog.tsx:23` - body scroll lock counter logic.
- `src/components/admin/ui/admin-dialog.tsx:103` - dialog body scroll container behavior.
- `src/components/image-modal.tsx:19` - standalone modal scroll/escape handling.
- `src/components/videos-grid-modal.tsx:29` - standalone video modal handling.
- `src/components/admin/ui/tooltip.tsx:34` - tooltip provider/root.
- `src/components/admin-reports-client.tsx:193` - single chart renderer implementation.
- `src/components/admin-reports-client.tsx:629` - comparison toggles (not chart type switch).
- `src/lib/manual/content.ts:195` - manual section manifest.
- `src/lib/manual/content.ts:331` - manual doc whitelist.
- `src/lib/manual/content.ts:403` - section markdown render.
- `scripts/test-full-site-local.sh:177` - automated test stage is `npm test` only.
- `scripts/test-full-site-local.sh:173` - admin credential output under seed mode.
- `tests/e2e/docs-screenshots.spec.ts:55` - admin screenshot env requirements.
- `tests/e2e/docs-screenshots.spec.ts:79` - student screenshot env requirements.
- `scripts/sync-manual-screenshots.cjs:6` - screenshot source dir.
- `package.json:19` - Playwright docs screenshot script.

## Architecture Insights

- This epic is correctly decomposed as cross-cutting: typography/layout (public), auth/layout parity (student), dialog system + bugs (admin), analytics UX (reports), content IA (manual), and release verification (Playwright).
- The main technical risk is not raw UI work; it is consistency drift from duplicated per-dialog inline styles and split modal primitives.
- A robust implementation order should be:
  1. Functional bug fixes and dialog lifecycle stability.
  2. Shared dialog/tooltip layering contract.
  3. Public/student layout + typography pass.
  4. Reports/manual/admin thematic refinements.
  5. Full-site Playwright + screenshot recapture gate.

## Historical Context (from thoughts/)

- Previous admin dialog/list stability research already documented modal/layout fragility in these same surfaces: `thoughts/research/2026-03-04_admin-ui-dialogs-and-list-scrolling-epic-research.md`.
- Previous manual research established screenshot governance and docs pipeline dependencies: `thoughts/research/2026-02-19_end-user-documentation-suite-research.md`.
- Previous student-portal research identified auth/session architecture; this epic extends into UX/layout and verification flows: `thoughts/research/2026-02-20-student-portal-research.md`.

## Related Research

- `thoughts/research/2026-03-04_admin-ui-dialogs-and-list-scrolling-epic-research.md`
- `thoughts/research/2026-03-04_admin-ui-polish-manual-rewrite-student-portal-sync-research.md`
- `thoughts/research/2026-02-19_end-user-documentation-suite-research.md`
- `thoughts/research/2026-02-20-student-portal-research.md`

## External Web Research (2026-03-04)

### Sources

- [Next.js Font Optimization (App Router)](https://nextjs.org/docs/app/getting-started/fonts) - official guidance for `next/font` and app-wide font application.
- [Next.js Font Module API](https://nextjs.org/docs/app/api-reference/components/font) - confirms self-hosting/performance/privacy behavior for Google fonts.
- [Radix Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip) - confirms portal behavior, delay controls, and keyboard interactions.
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) - baseline dialog behavior (focus trap, Esc handling, inert background expectations).
- [WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) - accessibility requirements for modal focus and close affordances.
- [WAI-ARIA Tooltip Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) - tooltip semantics and focus behavior expectations.
- [MDN Stacking Context](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context) - explains why z-index conflicts happen across nested stacking contexts.
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) - resilient test design guidance for user-visible behavior and isolation.
- [Playwright Web Server](https://playwright.dev/docs/test-webserver) - recommended way to bootstrap/reuse local server for tests.
- [Playwright Screenshots](https://playwright.dev/docs/screenshots) - official screenshot capture patterns (full-page and element-level).

### Findings

- `next/font/google` is the recommended Next.js path for Google fonts and avoids browser runtime fetches to Google while improving layout stability.
- Radix tooltip/dialog APIs already align with this codebase stack; consistency improvements should focus on wrapper behavior and CSS layer contracts, not primitive replacement.
- WAI guidance reinforces keeping tooltip content non-focusable and keeping modal focus trapped with explicit close options and Escape handling.
- MDN stacking-context behavior supports current diagnosis that tooltip visibility can fail despite numeric z-index if rendered in a lower/isolated context relative to overlays.
- Playwright guidance supports isolated deterministic tests and explicit local server lifecycle control through config or scripts.
- Screenshot docs validate current mixed strategy (full-page for route snapshots, locator/element screenshots for dialog assets).

### Recommendations

- Implement Overpass via `next/font/google` in root layout (rather than CSS `@import`) to match Next.js best practices and reduce external font requests.
- Introduce explicit shared layer tokens (for example: overlay, dialog, tooltip) and enforce them app-wide to eliminate ad-hoc z-index drift.
- Standardize modal interaction contract across admin/public/manual modals:
  - Escape closes
  - visible close action present
  - focus remains trapped in modal
  - focus returns to trigger after close
- Keep tooltips descriptive-only; if interactive hover content is needed, use non-modal dialog/popover patterns instead of tooltip.
- For epic closeout verification, keep environment bootstrap and Playwright stages explicit:
  - `scripts/test-full-site-local.sh` (setup/test baseline)
  - `npm run test:e2e`
  - `npm run docs:screenshots`
  - `npm run docs:screenshots:sync`

## Open Questions

- For the global dialog consistency ticket, should public modals be migrated onto `AdminDialog` semantics or should a shared base primitive be extracted and both admin/public wrap it?
- For tooltip rollout, is the desired scope literally every interactive control or a prioritized list of high-risk/high-ambiguity controls first?
- Should `scripts/test-full-site-local.sh` be extended to call Playwright directly, or should Playwright remain an explicit second step (`npm run test:e2e` + `npm run docs:screenshots:update`) documented by the debt ticket?
