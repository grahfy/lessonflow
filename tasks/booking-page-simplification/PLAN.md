# Plan: Booking Page Simplification & IP Geolocation

This plan outlines the steps to simplify the public booking form, update customer matching logic, and implement IP-based country restriction for LessonFlow.

## 1. IP Geolocation & AU Restriction

**Objective:** Prevent non-Australian residents from submitting booking requests.

*   **Create API Route:** `src/app/api/geo/route.ts`
    *   Identify user IP from `X-Forwarded-For` or `X-Real-IP`.
    *   Use a geolocation service or library to determine the country.
*   **Update Frontend:** `src/components/booking-form.tsx`
    *   Add a check before or during submission.
    *   Show a modal/dialog popup if country !== 'AU': *"Currently only AU residents are applicable for lessons"*.
    *   Abort submission if not in Australia.

## 2. Schema & Validation Updates

**Objective:** Adjust validation rules to allow for a simplified address format.

*   **Modify `src/lib/booking-rules.ts`:**
    *   Update `bookingRequestSchema` to include `firstName` and `lastName` (required).
    *   Update `bookingRequestSchema` to make `unitNumber`, `houseNumber`, `streetName`, `streetType`, `suburb`, and `state` optional (allowing empty strings).
    *   Update `formatBookingAddress` to handle empty fields, essentially defaulting to showing the postcode if other parts are missing.

## 3. UI Updates (`src/components/booking-form.tsx`)

**Objective:** Clean up the UI by removing unnecessary fields.

*   **Remove Input Fields:**
    *   `middleName`
    *   `unitNumber`
    *   `houseNumber`
    *   `country`
    *   `streetName`
    *   `streetType` (select)
    *   `suburb`
    *   `state` (select)
*   **Remove Recurring Booking:**
    *   Delete the `Weekly recurring booking` checkbox and the `recurrenceEndAt` date field.
*   **Update `onSubmit`:**
    *   Capture `firstName` and `lastName`.
    *   Construct the payload with empty strings for removed address fields.
    *   Hardcode `isRecurring: false`.

## 4. API Handler & Matching Logic

**Objective:** Implement smarter customer matching and initial lesson duration enforcement.

*   **Update `src/app/api/booking-requests/route.ts`:**
    *   **Customer Matching:** Query the `Customer` table using the combination of `firstName + lastName`, `normalizedPhone`, and `postcode`.
    *   **New Customer Rule:** If no match is found:
        *   Override `lessonDuration` to `"min30"`.
        *   Ensure `customDurationMinutes` is `null`.
    *   **Persistence:** Save the `BookingRequest` with the simplified address data.

## 5. Documentation & Verification

*   **Comments:** Add extensive comments explaining the rationale for the new matching logic and the geolocation filter.
*   **Verify:**
    *   `npm run typecheck`
    *   `npm test`
*   **Nginx Check:** Verify `X-Forwarded-For` headers are preserved (confirmed in existing `nginx.conf`).

---
**Status:** Awaiting implementation.
