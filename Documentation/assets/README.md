# Manual Screenshot Assets

This folder stores screenshot assets used by:
- `Documentation/*.md` guides, and
- the in-app admin manual (`/admin/manual`) via `public/documentation/screenshots/` sync.

## Capture Workflow
1. Seed deterministic demo data:
   - `npm run docs:screenshots:seed`
2. Capture screenshots with Playwright:
   - `npm run docs:screenshots`
3. Sync assets to public manual path:
   - `npm run docs:screenshots:sync`

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
- manual steps are updated.
