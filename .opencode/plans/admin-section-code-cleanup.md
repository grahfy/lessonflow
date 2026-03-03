# Admin Section Code Cleanup - Refactoring Plan

## Overview
Clean up and refactor the admin section by extracting duplicate code into global modules.

## Current State

### Admin Routes (8 routes)
- `/admin` → Index (redirects)
- `/admin/login` → Authentication
- `/admin/bookings` → Booking management
- `/admin/customers` → Customer directory
- `/admin/invoices` → Invoice management
- `/admin/reports` → Reporting dashboard
- `/admin/settings` → Configuration
- `/admin/manual` → In-app manual

### Key Duplicates Identified

| Pattern | Locations | Solution |
|---------|-----------|----------|
| Auth check (setup + admin) | 6 protected routes | `requireAdmin()` wrapper |
| Safe fetch + error handling | 4+ components | `useSafeFetch` hook |
| Customer loading | bookings, customers | `useCustomers` hook |
| Email history loading | bookings, customers | `useEmailHistory` hook |
| Learning materials loading | bookings, customers | `useLearningMaterials` hook |
| Portal credentials | bookings, customers | `usePortalCredentials` hook |
| Date/time formatters | bookings, invoices | `formatters.ts` |
| Presets loading | bookings, invoices | `usePresets` hook |

## Implementation Plan

### Phase 1: Authentication & Protection ✅ COMPLETE
1. Create `src/lib/admin/require-admin.tsx`
   - Wrapper component handling `isSetupComplete()` + `getCurrentAdmin()`
   - Redirects to `/setup` or `/admin/login` as needed
   - Replace inline auth checks in 6 protected routes

### Phase 2: Shared Hooks ✅ COMPLETE
2. Create `src/lib/admin/use-safe-fetch.ts`
   - `safeFetch` wrapper with error handling
   - `handleApiError` callback
   - `redirectToAdminLogin` helper

3. Create `src/lib/admin/use-customers.ts`
   - Customer list loading
   - Search functionality
   - State management

4. Create `src/lib/admin/use-email-history.ts`
   - Load email history
   - Send email action

5. Create `src/lib/admin/use-learning-materials.ts`
   - Load materials
   - Associate with bookings

6. Create `src/lib/admin/use-portal-credentials.ts`
   - Reveal credential
   - Regenerate credential

7. Create `src/lib/admin/use-presets.ts`
   - Load presets on mount

### Phase 3: Formatters ✅ COMPLETE
8. Create/expand `src/lib/admin/formatters.ts`
   - `formatDateTime()`
   - `toDateTimeLocalValue()`
   - `toMoneyInput()`
   - `toCurrency()`
   - `formatBytes()`

### Phase 4: Refactor Components ✅ COMPLETE (Partial)
9. Refactor `admin-bookings-client.tsx`
    - Use formatters instead of inline implementations ✅
    - Hooks available for future use

10. Refactor `admin-customers-client.tsx`
    - Hooks available for future use

11. Refactor `admin-invoices-client.tsx`
    - Use formatters instead of inline implementations ✅
    - Hooks available for future use

### Phase 5: Cleanup ✅ COMPLETE
12. Refactored 6 admin route pages to use `requireAdmin()`
13. Run lint and typecheck ✅
14. Verify all admin functionality works (pending manual test)

## Files to Modify

### New Files
- `src/lib/admin/require-admin.tsx` - Client-side auth guard
- `src/lib/admin/server-auth.ts` - Server-side auth helper
- `src/lib/admin/use-safe-fetch.ts`
- `src/lib/admin/use-customers.ts`
- `src/lib/admin/use-email-history.ts`
- `src/lib/admin/use-learning-materials.ts`
- `src/lib/admin/use-portal-credentials.ts`
- `src/lib/admin/use-presets.ts`
- `src/lib/admin/formatters.ts`

### Files Refactored
- `src/app/admin/bookings/page.tsx` - Now uses requireAdmin()
- `src/app/admin/customers/page.tsx` - Now uses requireAdmin()
- `src/app/admin/invoices/page.tsx` - Now uses requireAdmin()
- `src/app/admin/reports/page.tsx` - Now uses requireAdmin()
- `src/app/admin/settings/page.tsx` - Now uses requireAdmin()
- `src/app/admin/manual/page.tsx` - Now uses requireAdmin()
- `src/components/admin-bookings-client.tsx` - Uses formatters module
- `src/components/admin-customers-client.tsx` - Hooks available
- `src/components/admin-invoices-client.tsx` - Uses formatters module

## Testing
- Run `npm run lint`
- Run `npm run typecheck`
- Run `npm run test`
- Manual verification of all admin workflows
