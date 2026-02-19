# Documentation Screenshot Assets

## Purpose
Store screenshot assets used by end-user guides in `Documentation/`.

## Current Status
- Screenshot set captured on 2026-02-20 using Playwright against local admin flows.
- Current asset files:
  - `admin-login-page.png`
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
