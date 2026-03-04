---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [admin, manual, documentation, ux, content, operations]
keywords: [manual readability redesign, teaching administration guide for arts teachers, rewrite manual content, remove exhaustive control-by-control docs]
patterns: [src/app/admin/manual/page.tsx, src/app/admin/manual/[sectionId]/page.tsx, src/components/admin/manual/manual-client.tsx, src/components/admin/manual/manual-section-client.tsx, src/lib/manual/content.ts, Documentation/**]
---

# FEAT: Rewrite Admin Manual as an Arts Teaching Administration Guide

## Description

Rework the manual UX and content architecture so it reads like a practical teaching administration guide for arts educators, replacing paragraph-heavy format and avoiding exhaustive control-by-control documentation.

## Context

The manual already has broad coverage but still trends toward dense prose. The requested direction is an easier-to-read online guide focused on workflows and decisions for arts teaching administration.

## Requirements

### Functional Requirements
- Redesign manual section structure into task-first guides (for example: daily operations, lesson lifecycle, billing follow-up, communication workflows).
- Rewrite manual copy in a clear teaching-administration voice suitable for arts teachers.
- Explicitly avoid "document every button/tab/field" style; instead provide:
  - core workflow steps
  - exceptions and troubleshooting
  - role-based quick references
- Improve visual readability with stronger hierarchy: callouts, checklists, decision points, and quick actions.
- Keep existing route-based manual delivery (`/admin/manual` and `/admin/manual/[sectionId]`).

### Non-Functional Requirements
- Keep documentation maintainable and easy to update.
- Preserve accurate route references and screenshot mapping.
- Ensure mobile readability.

## Current State

Manual pages are generated from documentation markdown and rendered in-app. Content is comprehensive but still not optimized for quick operational scanning.

## Desired State

A concise, workflow-centric, arts-teaching operations manual with better information architecture and faster task execution for admin users.

## Research Context

### Keywords to Search
- `MANUAL_SECTION_MANIFEST` - reorganize section taxonomy.
- `manual-client` and `manual-section-client` - improve navigation and section framing.
- `Documentation/*.md` - rewrite to workflow-first structure.
- `screenshotIds` mapping - align visuals with rewritten steps.

### Patterns to Investigate
- `src/lib/manual/content.ts`
- `src/components/admin/manual/manual-client.tsx`
- `src/components/admin/manual/manual-section-client.tsx`
- `Documentation/**`

### Key Decisions Made
- Manual should optimize for decision support and repeatable procedures, not UI element inventory.
- Retain technical-owner appendices but separate from daily operator guidance.
- Content rewrite and UI structure updates are delivered together in one pass to prevent style drift.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

### Manual Verification
- [ ] Manual reads as task-based administration guide for arts teachers.
- [ ] Sections are easier to scan than paragraph-only format.
- [ ] Core workflows (bookings/customers/invoices/reports/settings/student portal/public forms) are covered without exhaustive control enumeration.
- [ ] `/admin/manual` navigation and section pages remain functional.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`
- Related prior work: `thoughts/tickets/feature_admin_manual_full_rewrite_replace_legacy_documentation.md`

## Notes

- Include a short "How to use this manual" orientation section at the top-level index.
