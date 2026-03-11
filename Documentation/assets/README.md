# Manual Screenshot Assets

This folder stores screenshot assets used by:
- `Documentation/*.md` guides, and
- the in-app admin manual (`/admin/manual`) via `public/documentation/screenshots/` sync.

`Documentation/assets/` is the authored source of truth.
`public/documentation/screenshots/` is the synced runtime/public copy used by the app and repo-facing screenshots.

The current manual structure expects screenshots for the core admin, student, public, and diagnostic workflows. Existing baseline coverage includes bookings, customers, invoices, reports, settings, manual, and student/public pages. As the manual grows, add captures for any new section that benefits from a real UI example rather than descriptive prose alone.

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
- manual steps are updated,
- logs/settings/manual structure changes enough that the current image no longer matches the documented workflow.
