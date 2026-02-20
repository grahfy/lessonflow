# Admin Invoice Create: Customer Selection, Flexible Price Input, and Optional Booking Link

## Status
`implemented`

## Request Summary
Improve the admin `Create Invoice` workflow so admins can select an existing customer from the customer database instead of manually entering customer fields every time.

Additional requested behavior:
- Accept lesson/charge price input formats like `$50.00`, `$50`, `50`, and `50.00`.
- Resolve current `Invalid invoice payload.` create failures by aligning client payloads with API validation rules and providing safer pre-submit validation.
- Allow linking an invoice to an appointment (booking) from the create flow.
- Support creating invoices that are not lesson-based (standalone invoices not tied to a booking/lesson fee).

## Scope
- Admin invoice create modal UX and state model.
- Admin invoice create payload validation and route behavior.
- Customer selection and optional appointment linking data source(s).
- Price parsing/normalization before API submission.
- Automated tests for new create variants and validation/error handling.

## Non-Goals
- Changes to invoice send/reminder/payment workflows.
- Changes to PDF rendering layout/content outside data already present on invoice records.
- Payment gateway or accounting integrations.
