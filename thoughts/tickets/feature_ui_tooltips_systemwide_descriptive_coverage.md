---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [ui, ux, accessibility, tooltips, admin, student, public]
keywords: [descriptive tooltips all ui options, tooltip coverage audit, help text for controls]
patterns: [src/components/admin/**, src/components/student-portal-client.tsx, src/components/student-login-form.tsx, src/components/booking-form.tsx, src/components/admin/ui/**]
---

# FEAT: Add Descriptive Tooltips Across Interactive UI Controls

## Description

Add descriptive, consistent tooltips for UI options across admin, student, and public surfaces so end users understand what each action does before clicking.

## Context

Current tooltip usage is sparse and inconsistent (`title` attributes only in a few places). The request is for broad coverage, requiring a shared tooltip pattern and a coverage audit to avoid partial implementation.

## Requirements

### Functional Requirements
- Introduce a shared tooltip primitive for buttons, icon-only actions, toggles, and ambiguous controls.
- Add descriptive tooltip text across major workflows (bookings, customers, invoices, reports, settings, student portal, public forms where relevant).
- Ensure tooltip copy is action-oriented and non-redundant with visible labels.
- Define explicit exceptions (for obvious controls where tooltip adds no value).

### Non-Functional Requirements
- Tooltips must be keyboard and screen-reader friendly.
- Tooltip styling must match current design system and remain readable in current themes.
- Avoid tooltip overload that harms usability/performance.

## Current State

No centralized tooltip component is used broadly; most controls rely on label text only, with isolated `title` attributes.

## Desired State

A reusable tooltip system with documented coverage rules and consistent descriptive text across key UI options.

## Research Context

### Keywords to Search
- `title=` - find existing native tooltip usage.
- `btn btn-` - locate action surfaces with missing explanatory affordance.
- `radix tooltip` - evaluate existing dependency support for accessible tooltips.

### Patterns to Investigate
- `src/components/admin/**`
- `src/components/student-portal-client.tsx`
- `src/components/student-login-form.tsx`
- `src/components/booking-form.tsx`
- `src/components/admin/ui/**`

### Key Decisions Made
- Coverage is phased by workflow criticality but tracked in one ticket.
- Primary targets are actions where intent is unclear or destructive.
- Use one tooltip implementation pattern rather than mixed ad-hoc approaches.

## Success Criteria

### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [ ] Add/update component tests for tooltip rendering on representative controls.

### Manual Verification
- [ ] Keyboard-focus through primary admin actions and confirm tooltip visibility/readability.
- [x] Validate tooltip coverage in bookings/customers/invoices dialogs.
- [x] Validate tooltip coverage in student portal actions.
- [x] Confirm no clipped/off-screen tooltip behavior on laptop and mobile widths.

## Related Information

- `src/components/admin/**`
- `src/components/student-portal-client.tsx`
- `src/components/booking-form.tsx`

## Notes

- For dense pages, prioritize tooltips on icon-only, high-risk, or non-obvious actions first.
