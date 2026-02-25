# Documentation Screenshot Assets

## Purpose
Store screenshot assets used by end-user guides in `Documentation/`.

## Current Status
- Screenshot set refreshed on 2026-02-25 using Playwright against a deterministic local MySQL demo dataset.
- Playwright screenshot automation is available in the repo:
  - `npm run docs:screenshots`
  - `npm run docs:screenshots:sync`
  - `npm run docs:screenshots:update`
- Current asset files:
  - `admin-login-page.png`
  - `admin-manual-page.png`
  - `admin-reports-dashboard.png`
  - `admin-settings-page.png`
  - `booking-calendar-week-view.png`
  - `manual-booking-dialog-customer-step.png`
  - `booking-detail-dialog-notes-and-actions.png`
  - `booking-create-invoice-dialog.png`
  - `customer-directory-list.png`
  - `customer-editor-create.png`
  - `invoice-console-list-and-filters.png`
  - `invoice-create-dialog.png`
  - `invoice-detail-send-and-download-pdf.png`
  - `invoice-filters-outstanding-aging.png`
  - `public-book-page.png`
  - `public-contact-page.png`
  - `student-login-page.png`
  - `student-portal-page.png`

## Naming Convention
Use lowercase kebab-case names with workflow prefixes:
- `booking-calendar-week-view.png`
- `booking-detail-create-invoice.png`
- `invoice-detail-send-and-download-pdf.png`
- `invoice-filters-outstanding-aging.png`
- `customer-directory-search-results.png`

## Placement Rules
- Keep all image files directly in `Documentation/assets/`.
- Use Markdown image syntax with a relative path from each guide file.

## Capture Guidance
- Capture desktop screenshots for major workflows first.
- Capture mobile screenshots only where the flow differs materially.
- Ensure UI labels are visible and readable.
- Remove customer-identifying real data where possible.
- Prefer a disposable demo dataset (never production data).
- Use stable window size and wait for pages to settle before capture.

## Automated Capture Workflow (Playwright)

### Prerequisites
- Local app running (for example `npm run dev`)
- Playwright browser installed (`npx playwright install chromium`) if not already installed
- Non-production data in the app
- Optional admin credentials for authenticated captures:
  - `DOCS_SCREENSHOTS_ADMIN_EMAIL`
  - `DOCS_SCREENSHOTS_ADMIN_PASSWORD`
- Optional student credentials for portal dashboard capture:
  - `DOCS_SCREENSHOTS_STUDENT_FULL_NAME`
  - `DOCS_SCREENSHOTS_STUDENT_POSTCODE`
  - `DOCS_SCREENSHOTS_STUDENT_PASSWORD`

### Commands
```bash
# Seed a deterministic docs demo dataset (Prisma/MySQL)
npm run docs:screenshots:seed

# Capture screenshots into Documentation/assets/
npm run docs:screenshots

# Sync screenshots used by the in-app admin manual
npm run docs:screenshots:sync

# Run capture + sync in one command
npm run docs:screenshots:update
```

### Notes
- Authenticated admin screenshots are skipped if admin credentials are not provided.
- Authenticated student portal screenshot is skipped if student demo credentials are not provided.
- Screenshot sync copies image assets from `Documentation/assets/` to `public/documentation/screenshots/`.
- `npm run docs:screenshots:seed` now seeds a deterministic **Prisma/MySQL** docs demo dataset (disposable environment only).
- The seed script rewrites demo data in the target DB, so never point it at production.

## Workflow Coverage Checklist
- Booking calendar view and booking detail dialog.
- Customer directory search/create/edit view.
- Invoice create dialog and line-item editing.
- Invoice detail actions (send, reminder, mark paid, credit note, download PDF).
- Outstanding filters and bulk reminder action.

## Refresh Trigger
Recapture screenshot assets when:
- UI labels/buttons change,
- layout changes break callout alignment,
- major workflow steps are updated.
