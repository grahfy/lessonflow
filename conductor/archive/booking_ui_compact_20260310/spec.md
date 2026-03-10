# Specification: Admin Booking Popup UI Re-adjustment

## Overview
The "Edit Booking" popup in the Admin Console currently requires vertical scrolling to see all essential information and the primary action buttons on standard desktop resolutions. This track aims to re-adjust the UI into a more compact layout, specifically focusing on making the lesson notes section smaller and ensuring the lesson configuration and footer buttons are visible without scrolling.

## Functional Requirements
- **Compact Layout Implementation:** Redesign the booking popup components to occupy less vertical space.
- **Responsive Notes Section:** Reduce the default vertical height of the "Lesson Notes" textarea or container.
- **Ensure Visibility:** The "Lesson Config" section and the four primary action buttons at the bottom of the popup must be visible within the viewport without scrolling on standard desktop resolutions (1920x1080).
- **Maintain Core Functionality:** All existing booking editing features, including input fields, status toggles, and action buttons, must remain functional and accessible.

## Non-Functional Requirements
- **Consistency:** The updated layout must adhere to existing project styling conventions (Radix UI, CSS classes in globals.css).
- **Usability:** The UI should remain clear and legible despite the more compact arrangement.

## Acceptance Criteria
- [ ] The "Edit Booking" popup in the Admin Console fits within a 1080p vertical viewport without requiring scrolling.
- [ ] Action buttons (Confirm, Cancel, etc.) are immediately visible upon opening the popup.
- [ ] Lesson Notes are still editable but occupy less initial vertical space.
- [ ] Automated E2E tests confirm visibility of footer buttons.

## Out of Scope
- Redesigning the entire Admin Console.
- Adding new booking features or fields.
- Mobile-specific optimizations for this particular popup (beyond maintaining current responsiveness).
