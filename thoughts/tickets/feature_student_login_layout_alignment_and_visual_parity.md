---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [student-portal, ui, ux, layout, responsive]
keywords: [student portal login postcode password same line, side image size same as front pages, student login ui polish]
patterns: [src/app/student/login/page.tsx, src/components/student-login-form.tsx, src/components/panel-layout.tsx, src/styles/globals.css]
---

# FEAT: Student Login Field Pairing and Side-Image Visual Parity

## Description

Improve student login presentation by placing postcode and password fields on the same row where viewport allows, and make the login side visual proportionally consistent with other public/front pages.

## Context

Current student login form uses mixed field widths (`postcode` compact, `password` full) and the side visual appears inconsistent relative to main public page hero image proportions.

## Requirements

### Functional Requirements
- Student login form:
  - place `Postcode` and `Password` inputs on a single row on desktop/tablet widths.
  - maintain readable vertical stacking on mobile.
- Side visual:
  - align student login visual sizing behavior with the same `PanelLayout` visual proportions used on other front pages.
  - avoid clipping/stretching artifacts.

### Non-Functional Requirements
- Keep keyboard/focus order logical after layout changes.
- Preserve all existing login validation and CAPTCHA behavior.

## Current State

`StudentLoginForm` marks postcode as compact but password as full width, resulting in unbalanced row flow. Visual sizing is driven by shared CSS but currently diverges from expected front-page proportion.

## Desired State

Student login has a cleaner two-column credential row (`postcode + password`) and a side visual that feels consistent with the rest of the site.

## Research Context

### Keywords to Search
- `field-compact` and `field full` in login form - remap width classes.
- `panel-visual` and `hero-image` student login selectors - normalize size tokens.
- `student-login-hero` sizing rules - align with existing public hero sizing.

### Patterns to Investigate
- `src/components/student-login-form.tsx`
- `src/app/student/login/page.tsx`
- `src/components/panel-layout.tsx`
- `src/styles/globals.css`

### Key Decisions Made
- Use responsive grid behavior so desktop gets same-line credentials while mobile keeps stacked fields.
- Preserve existing page structure (`PanelLayout`) and solve via targeted class/layout updates.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

### Manual Verification
- [ ] On desktop/tablet, postcode and password render on the same row with balanced widths.
- [ ] On mobile, fields stack without overlap/cutoff.
- [ ] Student login side visual appears proportionally aligned with other front-page visuals.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`

## Notes

- Confirm no regressions on `/student/login` reduced-motion mode.
