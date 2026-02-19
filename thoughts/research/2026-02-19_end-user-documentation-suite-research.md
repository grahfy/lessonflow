---
date: 2026-02-19T20:40:29Z
git_commit: 71a82b4
branch: main
repository: melbourne_guitar_school_website
topic: "Research: end-user documentation suite"
tags: [research, documentation, onboarding, operations, admin]
last_updated: 2026-02-19T20:40:29Z
---

## Ticket Synopsis
Build complete, detailed, easy-to-follow end-user documentation in `Documentation/` so non-technical admins can confidently run bookings, customer records, invoicing, reminders, and correction workflows.

## Summary
The codebase has mature booking/customer/invoice functionality and now includes reminder automation and credit-note flows. Documentation planning already exists, but full end-user guides are not yet authored. The documentation initiative should be treated as a product-operations deliverable, grounded in current UI labels/actions and route-level behavior.

## Detailed Findings

### Locate Phase
- Existing documentation baseline is currently concentrated in root README feature summaries and setup notes (`README.md:28`, `README.md:89`, `README.md:181`).
- A dedicated documentation planning scaffold exists in `Documentation/END_USER_DOCUMENTATION_PLAN.md` with explicit target guide list (`Documentation/END_USER_DOCUMENTATION_PLAN.md:21`).
- The requested ticket now exists and is scoped to end-user docs in `Documentation/` (`thoughts/tickets/2026-02-19-end-user-documentation-suite.md:1`).

### Pattern-Find Phase
- Admin workflow entry points are consistently surfaced in action bars and dialogs:
  - `Add Manual Booking`, `Customers`, `Invoices` in booking console (`src/components/admin-bookings-client.tsx:1187`).
  - customer row action `Invoices` (`src/components/admin-bookings-client.tsx:1651`).
  - booking dialog action `Create invoice` (`src/components/admin-bookings-client.tsx:2098`).
- Invoice console pattern is action-dense and operationally oriented:
  - filters for status/aging/outstanding (`src/components/admin-invoices-client.tsx:560`, `src/components/admin-invoices-client.tsx:570`, `src/components/admin-invoices-client.tsx:579`).
  - bulk reminders (`src/components/admin-invoices-client.tsx:583`).
  - lifecycle actions including `Send reminder`, `Mark paid`, `Create credit note` (`src/components/admin-invoices-client.tsx:744`, `src/components/admin-invoices-client.tsx:747`, `src/components/admin-invoices-client.tsx:753`).
- Email communication follows reusable template + service patterns with fallback logging:
  - invoice/reminder templates (`src/lib/email/templates.ts:159`, `src/lib/email/templates.ts:182`).
  - SMTP fallback to `queued_no_smtp` (`src/lib/email/service.ts:48`).

### Analyze Phase
- End-user docs must distinguish manual vs automated processes:
  - manual admin reminders endpoint is auth-protected (`src/app/api/admin/invoices/reminders/route.ts:11`).
  - scheduled reminder job is cron-secret protected (`src/app/api/jobs/invoice-reminders/route.ts:15`).
  - scheduled daily digest follows the same auth pattern (`src/app/api/jobs/daily-bookings-digest/route.ts:10`).
- Operational guidance should include correction policy and audit-safe behavior:
  - invoice UI favors credit notes for sent/paid invoices and blocks delete under those states (`src/components/admin-invoices-client.tsx:752`, `src/components/admin-invoices-client.tsx:760`).
- README already advertises key operational behavior (aging filters, reminders, credit notes), so end-user docs should preserve terminology alignment (`README.md:67`, `README.md:68`, `README.md:71`).

## Code References
- `README.md:28` - product feature summary starting point.
- `README.md:53` - invoicing capability list and business-facing terminology.
- `README.md:181` - scheduled jobs section that should map to operations docs.
- `Documentation/END_USER_DOCUMENTATION_PLAN.md:21` - canonical deliverable guide list.
- `src/components/admin-bookings-client.tsx:1187` - admin booking legend action entry points.
- `src/components/admin-bookings-client.tsx:1651` - customer invoice history navigation.
- `src/components/admin-bookings-client.tsx:2098` - booking-to-invoice creation action.
- `src/components/admin-bookings-client.tsx:2164` - booking-side invoice creation dialog title/content.
- `src/components/admin-invoices-client.tsx:570` - aging bucket filter options.
- `src/components/admin-invoices-client.tsx:583` - bulk reminder action in invoice console.
- `src/components/admin-invoices-client.tsx:744` - single reminder action.
- `src/components/admin-invoices-client.tsx:753` - credit-note creation action.
- `src/app/api/admin/invoices/route.ts:20` - invoice query/filter contract.
- `src/app/api/admin/invoices/reminders/route.ts:7` - admin reminder endpoint behavior.
- `src/app/api/jobs/invoice-reminders/route.ts:8` - scheduled reminder job contract.
- `src/app/api/jobs/daily-bookings-digest/route.ts:9` - daily digest scheduling/auth behavior.
- `src/lib/email/service.ts:48` - no-SMTP fallback behavior requiring user documentation.
- `src/lib/email/templates.ts:159` - customer invoice email template.
- `src/lib/email/templates.ts:182` - customer overdue reminder email template.
- `vercel.json:2` - cron schedule definitions for operations context.

## Architecture Insights
- The product’s operational complexity is centered in two admin clients (`admin-bookings-client` and `admin-invoices-client`), so end-user documentation should mirror that split.
- Invoice workflows now have lifecycle branching (draft/send/remind/paid/credit-note), which requires decision-point documentation rather than linear-only instructions.
- Automation surface is intentionally small and secured through a single secret pattern (`x-cron-secret`), making it feasible to document in one “Automation and Scheduling” subsection.

## Historical Context (from thoughts/)
- Invoice/billing research established compliance-sensitive behavior (GST, invoice records, audit) and shaped current operational model (`thoughts/research/2026-02-19_invoice-management-and-customer-billing-research.md:29`).
- The new end-user documentation ticket and implementation plan already define a phased content rollout and success criteria (`thoughts/tickets/2026-02-19-end-user-documentation-suite.md:1`, `thoughts/plans/end-user-documentation-suite-implementation-plan.md:54`).
- Prior planning selected a modular guide architecture over a single manual, which aligns with current UI complexity and lookup needs (`thoughts/plans/end-user-documentation-suite-implementation-plan.md:35`).

## Related Research
- `thoughts/research/2026-02-19_invoice-management-and-customer-billing-research.md`
- `thoughts/research/2026-02-19_booking-contact-admin-system-research.md`
- `thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md`

## Open Questions
- Should end-user docs include “owner-only” procedures for cron payload overrides (`dryRun`, `stage`, `maxInvoices`) or keep automation content strictly operational and non-technical?
- Do we want screenshot assets captured in the repository now (`Documentation/assets/`) or staged later to avoid drift while UI is still changing?
- Should GST guidance in end-user docs include business-specific policy text once accountant-reviewed, or remain a neutral operational disclaimer for now?
