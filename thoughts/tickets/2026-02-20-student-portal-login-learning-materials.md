# Student Portal Login and Customer Learning Materials

## Status
`implemented`

## Request Summary
Add a student portal so customers can log in using:
- full name,
- postcode,
- automatically generated password.

Portal credentials must be created when a customer's first appointment is officially approved by the admin.  
When approval happens, the automatic approval email must also include:
- portal login instructions,
- the generated password.

Admin requirements:
- In customer management, admin can view a customer's generated portal password.
- Add a new admin action: `Customer Learning Materials`.
- `Customer Learning Materials` opens a popup workflow that:
  - selects a customer from database,
  - requires selecting one of that customer's previous/upcoming appointments,
  - allows upload/delete of learning materials for that appointment.

Public website requirements:
- Add a `Student Portal` button at the end of the top navigation menu.
- Student login page links into the authenticated portal area.

Student portal requirements:
- Show previous and upcoming appointments.
- Show lesson materials assigned to the student (audio files or PDFs).

## Scope
- Student authentication and session model.
- Credential generation and approval-email integration.
- Admin customer portal-credential visibility.
- Admin upload/delete workflows for customer learning materials tied to appointments.
- Public navigation and student portal routes.
- Test coverage and environment/docs updates.

## Non-Goals
- Payments, invoicing redesign, or admin auth redesign.
- Multi-role student accounts beyond customer portal access.
- Replacing the existing booking workflow.

## Constraints
- Preserve current admin booking approval behavior and customer linkage.
- Keep student materials assignment constrained to customer-owned appointments.
- Keep existing animation/navigation style for public site.

## Decisions Locked
1. Manually created bookings/customers will trigger the same portal-credential provisioning path as booking approvals.
2. Credential rotation UX will use an explicit admin `Regenerate Password` action with confirmation, immediate invalidation of the old password, visible `generated/rotated` timestamps, and dedicated audit-log entries.
3. For duplicate `fullName + postcode`, login will evaluate all matching active candidates with bcrypt verification (bounded candidate set + generic error responses), without adding extra disambiguation fields to the login form.
4. Learning-material downloads will be served through authenticated API streaming endpoints (ownership-checked), not direct signed URLs by default.
