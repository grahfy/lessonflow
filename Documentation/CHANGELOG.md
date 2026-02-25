# Documentation Changelog

All notable end-user documentation changes are tracked here.

## [v1.1.2] - 2026-02-25
- Expanded Playwright screenshot automation to capture dialog-level admin workflows.
- Re-captured and synced dialog screenshots for:
  - manual booking dialog (customer step),
  - customer directory list and create-customer editor,
  - booking detail actions dialog,
  - booking-side create-invoice dialog,
  - invoice create dialog,
  - invoice detail send/download actions dialog,
  - invoice outstanding+aging filtered view.
- Updated `Documentation/README.md` screenshot gallery and `Documentation/05-Invoice-Management.md` visual references to include the refreshed dialog/filter screenshots.

## [v1.1.1] - 2026-02-25
- Re-ran Playwright screenshots against a deterministic local MySQL demo dataset.
- Added/updated screenshots for:
  - public booking page,
  - public contact page,
  - student login page,
  - student portal page,
  - admin manual page,
  - admin reports dashboard,
  - admin settings page,
  - refreshed admin bookings/invoices pages.
- Embedded visual references into:
  - `Documentation/10-Admin-Settings-and-System-Configuration.md`
  - `Documentation/11-Admin-Reports-Dashboard.md`
  - `Documentation/12-Student-Portal-and-Learning-Materials.md`
  - `Documentation/13-Public-Booking-and-Contact-Forms.md`
- Upgraded screenshot tooling docs to describe the deterministic seeding workflow (`Documentation/assets/README.md`).

## [v1.1.0] - 2026-02-25
- Expanded documentation coverage for newer product features with:
  - `Documentation/10-Admin-Settings-and-System-Configuration.md`
  - `Documentation/11-Admin-Reports-Dashboard.md`
  - `Documentation/12-Student-Portal-and-Learning-Materials.md`
  - `Documentation/13-Public-Booking-and-Contact-Forms.md`
- Added a manual coverage matrix to `Documentation/README.md`.
- Added Playwright screenshot automation foundation commands and workflow notes to `Documentation/assets/README.md`.
- Added screenshot sync workflow for the in-app admin manual (`public/documentation/screenshots/`).

## [v1.0.1] - 2026-02-20
- Added live UI screenshots captured with Playwright for:
  - admin login,
  - booking calendar and booking dialogs,
  - customer directory and create-customer dialog,
  - invoice console, create-invoice dialog, invoice detail actions,
  - outstanding filter view.
- Embedded screenshot references into:
  - `Documentation/02-Admin-Login-and-Access.md`
  - `Documentation/03-Booking-Management.md`
  - `Documentation/04-Customer-Directory.md`
  - `Documentation/05-Invoice-Management.md`
  - `Documentation/07-Reports-Outstanding-and-Follow-Up.md`
- Updated screenshot asset inventory in `Documentation/assets/README.md`.

## [v1.0.0] - 2026-02-20
- Added end-user guide index: `Documentation/README.md`.
- Added authoring template and writing rules: `Documentation/_TEMPLATE.md`.
- Added onboarding and access guides:
  - `Documentation/01-Getting-Started.md`
  - `Documentation/02-Admin-Login-and-Access.md`
- Added operations guides:
  - `Documentation/03-Booking-Management.md`
  - `Documentation/04-Customer-Directory.md`
  - `Documentation/05-Invoice-Management.md`
  - `Documentation/06-Email-and-Notifications.md`
  - `Documentation/07-Reports-Outstanding-and-Follow-Up.md`
  - `Documentation/08-Troubleshooting-and-FAQs.md`
  - `Documentation/09-Glossary.md`
- Added governance content:
  - review cadence,
  - daily/weekly/monthly operator checklists,
  - documentation ownership expectations.
- Added screenshot asset management guide: `Documentation/assets/README.md`.

## Versioning Notes
- Increase major version when guide structure changes significantly.
- Increase minor version when new guide sections or workflows are added.
- Increase patch version when wording/clarity fixes are made without workflow changes.
