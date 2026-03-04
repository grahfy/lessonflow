---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [admin, manual, documentation, playwright, screenshots, ux, content]
keywords: [redesign manual from scratch, remove old documentation folder, detailed end-user manual, technical manual formatting, colorful readable manual, playwright screenshots]
patterns: [src/app/admin/manual/**, src/components/admin/manual/**, src/lib/manual/content.ts, Documentation/**, tests/e2e/docs-screenshots.spec.ts, scripts/sync-manual-screenshots.cjs]
---

# FEAT: Rewrite Admin Manual from Scratch and Replace Legacy `Documentation/` Suite

## Description

Redesign and rewrite the manual from scratch for end users, remove outdated legacy documentation content, and deliver polished technical-manual formatting with updated Playwright screenshots.

## Context

The project already has an in-app manual and repository `Documentation/**` content, but the request is for a clean-slate rewrite with improved readability, stronger visual formatting, and full screenshot refresh.

## Requirements

### Functional Requirements
- Rewrite manual content completely (do not patch old prose).
- Replace old documentation set under `Documentation/**` with the new structure/content.
- Keep `/admin/manual` as the primary in-app entry point with improved visual presentation.
- Use technical-manual formatting: clear headings, step blocks, warnings, notes, troubleshooting callouts, and color-coded information hierarchy.
- Capture and integrate updated screenshots using Playwright for all major workflows.
- Ensure manual sections cover bookings, customers, invoices, reports, settings, student portal, and public form operations.

### Non-Functional Requirements
- Manual must remain easy for non-technical operators.
- Color system must be accessible (contrast-compliant) and consistent.
- Screenshot pipeline must remain reproducible and deterministic.
- Changes must include environment/test/docs sync per repo requirement.

## Current State

Manual content is sourced from existing markdown files in `Documentation/**` and rendered in admin manual routes via `src/lib/manual/content.ts`. Screenshot automation exists but targets the current structure.

## Desired State

A newly authored, visually polished manual corpus and in-app presentation, with legacy documentation removed/replaced and fresh screenshot assets captured via Playwright.

## Research Context

### Keywords to Search
- `MANUAL_SECTION_MANIFEST` - map source files and route coverage.
- `docs-screenshots.spec.ts` - map screenshot capture coverage and gaps.
- `Documentation/README.md` - identify legacy indexing and replacement needs.

### Patterns to Investigate
- `src/lib/manual/content.ts`
- `src/components/admin/manual/manual-client.tsx`
- `src/components/admin/manual/manual-section-client.tsx`
- `tests/e2e/docs-screenshots.spec.ts`
- `scripts/sync-manual-screenshots.cjs`
- `Documentation/**`

### Key Decisions Made
- This ticket supersedes incremental-manual updates and requires full rewrite.
- Legacy `Documentation/**` content is replaced, not maintained in parallel.
- Screenshot regeneration is mandatory as part of acceptance criteria.

## Success Criteria

### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run docs:screenshots`
- [x] `npm run docs:screenshots:sync`
- [x] `npm run build`

### Manual Verification
- [x] `/admin/manual` presents rewritten content with improved visual formatting and navigation.
- [x] Legacy documentation files are removed/replaced as defined by new manual architecture.
- [x] Playwright screenshots are current and correctly embedded in manual sections.
- [x] Manual readability validated on desktop and mobile.

## Related Information

- Existing related ticket: `thoughts/tickets/feature_admin_manual_full_end_user_manual_and_playwright_screenshots.md`
- `src/app/admin/manual/page.tsx`
- `src/app/admin/manual/[sectionId]/page.tsx`
- `src/lib/manual/content.ts`
- `tests/e2e/docs-screenshots.spec.ts`

## Notes

- Define a migration strategy for removing/replacing old docs so links/routes do not break unexpectedly.
- Ensure no sensitive customer data appears in new screenshots.
