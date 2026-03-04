---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [admin, reports, ui, ux, charts, analytics]
keywords: [reports console redesign, improve readability, business friendly reports, multiple chart types, report information architecture]
patterns: [src/components/admin-reports-client.tsx, src/app/admin/reports/page.tsx, src/styles/globals.css, src/app/api/admin/reports/route.ts, src/app/api/admin/reports/email/route.ts]
---

# FEAT: Reports Console Readability Upgrade and Multi-Chart Support

## Description

Redesign the reports console for clearer operational readability and add support for multiple chart styles/types to improve business reporting workflows.

## Context

The reports console already has period cards and mini bar charts, but the layout is dense and limited in visualization variety. The requested outcome is a more user-friendly analytics surface for business reporting.

## Requirements

### Functional Requirements
- Improve reports page information hierarchy for faster scanning:
  - clearer separation of controls, summary KPIs, comparisons, and trends.
  - stronger visual grouping for daily/weekly/monthly/yearly sections.
- Add user-selectable chart types (at minimum: bar + line; optional area/stacked where feasible).
- Preserve existing period and custom-range logic while improving presentation.
- Improve readability of metric labels/values and trend legends.
- Keep report email actions discoverable without dominating primary analytics tasks.

### Non-Functional Requirements
- Chart interactions must remain responsive on desktop and mobile.
- Maintain accessibility (labels, contrast, keyboard focus).
- No regressions in report API contract usage.

## Current State

Reports use static card grids and custom SVG mini-bar charts. Comparative analysis exists but visualization choices are fixed and can feel crowded in one view.

## Desired State

A cleaner, more business-friendly reports console with selectable chart forms and improved information architecture for routine operational decisions.

## Research Context

### Keywords to Search
- `TrendPanel` and `MiniBarChart` - abstract chart renderer for mode switching.
- `reports-period-grid` / `reports-chart-grid` - redesign layout containers.
- `visibleComparisons` and custom range controls - keep existing filters while improving UX.
- `report-metric-cell` typography - optimize readability.

### Patterns to Investigate
- `src/components/admin-reports-client.tsx`
- `src/styles/globals.css`
- `src/app/api/admin/reports/route.ts`

### Key Decisions Made
- Keep current report data model and first refactor presentation + chart rendering layer.
- Add chart-type switcher as a view-level control rather than per-card duplicated controls.
- Prioritize operational clarity over decorative visualization.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

### Manual Verification
- [ ] Reports layout is easier to scan for key business metrics.
- [ ] User can switch between at least two chart types without data loss.
- [ ] Custom date range, comparison toggles, and report email actions still work.
- [ ] Reports remain readable on desktop and mobile.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`

## Notes

- If chart-library adoption is considered, evaluate bundle-size and SSR implications before introducing dependency changes.
