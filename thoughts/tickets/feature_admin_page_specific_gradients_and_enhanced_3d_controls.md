---
type: feature
priority: medium
created: 2026-03-04
status: implemented
tags: [admin, ui, ux, design-system, theming, buttons]
keywords: [admin page unique subtle gradients, coherent color system, more 3d buttons, style consistency for lists tables controls]
patterns: [src/components/admin/layout/admin-shell.tsx, src/app/admin/bookings/page.tsx, src/app/admin/customers/page.tsx, src/app/admin/invoices/page.tsx, src/app/admin/reports/page.tsx, src/app/admin/settings/page.tsx, src/app/admin/manual/page.tsx, src/styles/globals.css, src/components/admin/ui/admin-card.tsx, src/components/admin/ui/admin-table.tsx, src/components/admin/ui/admin-form.tsx]
---

# FEAT: Admin Page-Specific Subtle Gradients and Enhanced 3D Control Styling

## Description

Introduce a cohesive admin visual system with subtle per-page gradients and stronger 3D treatment for buttons and key controls, while keeping readability high and avoiding overly vibrant palettes.

## Context

Admin currently uses a shared gradient shell and common button styles. The request is to provide subtle, distinct page moods (bookings/customers/invoices/reports/settings/manual) plus more pronounced depth in controls.

## Requirements

### Functional Requirements
- Define per-admin-page gradient tokens that are distinct yet visually coherent.
- Apply gradients to each admin page/shell variant without reducing content contrast.
- Upgrade button styling with stronger 3D cues (shadow depth, highlight edges, pressed states).
- Ensure style consistency across related UI elements (lists, tables, form controls, action bars).
- Preserve semantic coloring for primary/secondary/danger actions.

### Non-Functional Requirements
- Keep design subtle and professional (avoid neon/vibrant overload).
- Maintain accessibility contrast and focus visibility.
- Avoid introducing visual noise that reduces data readability.

## Current State

Admin shell already applies a shared theme and button treatment, but it does not provide per-page gradient variance and the requested stronger 3D depth language.

## Desired State

Each admin page has a subtle thematic gradient tied to a unified design language, and control surfaces/buttons feel tactile and clearly interactive.

## Research Context

### Keywords to Search
- `admin-shell` class strategy - add page-specific theme modifiers.
- `.btn-primary`, `.btn-secondary`, `.btn-danger` - apply enhanced depth and pressed states.
- `admin-table`, `admin-card`, `admin-form` - align supporting control surfaces with new theme.
- route-to-theme mapping in admin pages - ensure deterministic class application.

### Patterns to Investigate
- `src/components/admin/layout/admin-shell.tsx`
- `src/styles/globals.css`
- `src/components/admin/ui/admin-card.tsx`
- `src/components/admin/ui/admin-table.tsx`
- `src/components/admin/ui/admin-form.tsx`

### Key Decisions Made
- Theme tokens should be page-specific but centrally defined to prevent style drift.
- 3D treatment should emphasize affordance, not skeuomorphic novelty.
- This ticket excludes workflow/layout bug fixes, which are tracked separately.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

### Manual Verification
- [ ] Each admin page has a distinct but subtle gradient.
- [ ] Buttons across admin pages show stronger 3D states (default/hover/active) with clear hierarchy.
- [ ] Tables/lists/forms remain readable and visually consistent with the new theme.
- [ ] No regressions in control usability or contrast.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`

## Notes

- Validate both high-density pages (`/admin/bookings`, `/admin/invoices`) and content-heavy page (`/admin/manual`) for readability after theming.
