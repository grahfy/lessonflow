# Manual Screenshot Assets

This folder stores screenshot assets used by:
- `Documentation/*.md` guides, and
- the in-app admin manual (`/admin/manual`) via `public/documentation/screenshots/` sync.

`Documentation/assets/` is the authored source of truth.
`src/lib/manual/content.ts` is the canonical screenshot registry and section/gallery contract.
`public/documentation/screenshots/` is the synced runtime/public copy used by the app and repo-facing screenshots.

The manual now expects a chapter-complete screenshot set for the core admin, student, public, diagnostic, and release-visibility workflows. Add new screenshots only by registering them first, then capturing, syncing, and validating the full set.

## Capture Workflow
1. Seed deterministic demo data:
   - `npm run docs:screenshots:seed`
2. Capture screenshots with Playwright:
   - `npm run docs:screenshots`
3. Sync assets to public manual path:
   - `npm run docs:screenshots:sync`
4. Validate registry, markdown, and asset parity:
   - `npm run docs:screenshots:validate`

## Markdown Contract
- Use `assets/<file>.png` in `Documentation/*.md`
- Legacy `Documentation/assets/<file>.png` links still render in-app, but new edits should normalize to `assets/...`
- Every manual screenshot must exist in `MANUAL_SCREENSHOTS` and be assigned to at least one section gallery

## Required Environment for Authenticated Captures
- `DOCS_SCREENSHOTS_ADMIN_EMAIL`
- `DOCS_SCREENSHOTS_ADMIN_PASSWORD`

## Optional Student Capture Environment
- `DOCS_SCREENSHOTS_STUDENT_FULL_NAME`
- `DOCS_SCREENSHOTS_STUDENT_POSTCODE`
- `DOCS_SCREENSHOTS_STUDENT_PASSWORD`

## Naming Convention
- lowercase kebab-case
- workflow-oriented names (for example: `invoice-create-dialog.png`)

## Refresh Triggers
Recapture screenshots whenever:
- major labels/buttons change,
- modal layouts are redesigned,
- manual steps are updated,
- logs/settings/manual structure changes enough that the current image no longer matches the documented workflow.
