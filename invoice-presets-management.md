# Invoice Presets Management

## Goal
Add ability to manage (CRUD) invoice product package presets via a new tab in the Admin Configuration page.

## Tasks
- [ ] **Task 1: Database Schema** - Add `InvoiceProductPreset` model to `schema.prisma` and run migration -> Verify: `npx prisma studio` shows the new table.
- [ ] **Task 2: API Route** - Create `src/app/api/admin/presets/route.ts` with GET/POST/PATCH/DELETE handlers -> Verify: `curl` or Postman returns 200 for GET.
- [ ] **Task 3: Refactor Admin Settings UI** - Add tab state to `AdminSettingsClient` and move environment form to "System" tab -> Verify: Toggle between tabs works.
- [ ] **Task 4: Presets UI** - Implement `AdminPresetsEditor` component with list and Add/Edit form -> Verify: Can create, edit, and delete presets in the UI.
- [ ] **Task 5: Invoice/Booking Integration** - Update `AdminInvoicesClient` and `AdminBookingsClient` to fetch presets from API -> Verify: Presets dropdown shows DB values.
- [ ] **Task 6: Data Migration** - Create and run a script to migrate hardcoded presets to the database -> Verify: DB is populated with default packages.

## Done When
- [ ] Admins can Add, Edit, and Delete presets from the Admin Configuration page.
- [ ] Invoices and Bookings use the dynamic presets from the database.
- [ ] Hardcoded constants are removed from the client components.

## Notes
- Use `isActive` boolean for soft-deletion to maintain historical consistency if needed.
- Ensure price conversion (Cents <-> Dollars) is handled correctly in the form.
- The "System" tab will contain the existing environment variable editor.
