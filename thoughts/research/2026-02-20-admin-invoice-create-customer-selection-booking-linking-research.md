---
date: 2026-02-20T21:15:00Z
git_commit: 36654e8
branch: main
repository: melbourne_guitar_school_website
topic: "Research: admin invoice create customer selection and booking linking"
tags: [research, invoices, admin, customers]
last_updated: 2026-02-20T21:15:00Z
---

## Summary
The backend already supports invoice creation with optional `customerId` and `bookingId`, plus dedicated customer-scoped and booking-scoped invoice create endpoints. The current admin create modal does not expose these capabilities and still requires manual customer snapshot entry and a lesson-fee-first line-item model.

The largest mismatch causing friction is contract inconsistency:
- UI currently sends either customer-path payload (`/api/admin/customers/:id/invoices`) without booking support, or global payload (`/api/admin/invoices`) requiring full customer snapshot strings.
- Users want customer selection + optional booking linking + standalone invoices in one flow.

## Findings
- The create modal is manual-customer-field based and has no customer picker or appointment selector (`src/components/admin-invoices-client.tsx:770`).
- Client-side create logic assumes lesson fee always exists and parses with `Number.parseFloat`, which does not support `$` prefixes (`src/components/admin-invoices-client.tsx:443`).
- Global create schema currently requires `customerName/customerEmail/customerPhone/customerAddress` even when `customerId` is sent (`src/lib/invoices/schema.ts:39`).
- Global create route already validates optional `customerId` and `bookingId`, but it still expects snapshot values from payload (`src/app/api/admin/invoices/route.ts:127`, `src/app/api/admin/invoices/route.ts:159`).
- Booking-scoped create endpoint already correctly links invoice to booking + customer snapshot from booking (`src/app/api/admin/bookings/[id]/invoice/route.ts:92`).
- Customer-scoped create endpoint already snapshots customer data automatically, but does not currently support `bookingId` in its schema (`src/app/api/admin/customers/[id]/invoices/route.ts:141`).
- Existing customer list endpoint is already suitable for customer picker autocomplete/select (`src/app/api/admin/customers/route.ts:24`).

## Implications
- Preferred direction is to normalize on one robust create contract where selected-customer flows derive snapshot server-side, and optional `bookingId` linking is validated against that customer.
- Standalone non-lesson invoices should be first-class by allowing line-item composition without requiring a lesson fee row.
- Currency input normalization should be centralized and reused to avoid repeated parse/validation drift across create/edit surfaces.

## References
- Ticket: `thoughts/tickets/2026-02-20-admin-invoice-create-customer-selection-and-booking-linking.md`
- Existing invoice plan baseline: `thoughts/plans/invoice-management-and-customer-billing-implementation-plan.md`
