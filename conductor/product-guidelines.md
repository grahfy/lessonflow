# Product Guidelines: LessonFlow

## Prose & Communication
- **Tone:** Professional, encouraging, and clear. Avoid jargon where possible.
- **Clarity:** Use active voice. Instructions should be concise and actionable.
- **Branding:** Centralize all branding strings in `src/lib/branding.ts` to support easy whitelabeling.

## User Experience (UX)
- **Accessibility:** Adhere to WCAG 2.1 Level AA standards. Use Radix UI primitives for accessible complex components.
- **Feedback:** Provide immediate visual feedback for all user actions (e.g., loading states, success/error toasts).
- **Simplicity:** Prioritize the most common tasks (e.g., booking an appointment, creating an invoice) by making them easily accessible.
- **Admin Standardization:** Use the centralized admin UI library (`src/components/admin/ui`) and data hooks (`src/lib/admin/use-*`) for all administrative features to ensure a unified experience.

## Design & Aesthetics
- **Styling:** Prefer standard CSS classes in `src/styles/globals.css`. Avoid inline styles unless necessary for dynamic values.
- **Animation:** Use GSAP for smooth, purposeful UI transitions. Animations should enhance, not distract from, the user experience.
- **Consistency:** Maintain consistent spacing and typography across all pages using the established design tokens.

## Technical Standards
- **Integrity:** Ensure financial data (invoices) is denormalized at creation to preserve historical accuracy.
- **Safety:** Implement strict validation for all user inputs using Zod.
- **Traceability:** Maintain audit trails for all significant entities (bookings, invoices, credentials). Standardize notification triggers to automatically record audit log entries upon successful delivery.
- **Consistency:** All notification functions should return a unified result type (e.g., `SendEmailResult`) to allow callers to handle delivery status consistently.
