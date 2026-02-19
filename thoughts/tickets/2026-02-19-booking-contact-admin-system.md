# Booking, Contact Form, and Admin Scheduling System

## Status
`implemented`

## Request Summary
Implement a production-ready contact and lesson-booking system that supports:
- Justified body text where appropriate across content sections.
- A real backend-backed contact form (not `mailto:` links only).
- A booking workflow with required fields:
  - Name, email, phone number, address.
  - Lesson mode (`in_person` or `video`).
  - Skill level (`beginner`, `intermediate`, `advanced`).
  - Lesson length (`30min` or `60min`).
- Owner approval workflow for new booking requests.
- Calendar views for bookings by day, week, and month.
- Admin actions to add, move, cancel, and edit bookings manually.
- Optional weekly recurring bookings and ability to remove recurring series.
- Customer emails for booking confirmation and cancellation.
- Owner notifications for new pending approvals and a daily bookings digest.

## Scope
- Replace static-only contact/booking interactions with backend APIs and persistent storage.
- Add an authenticated owner admin interface for booking operations.
- Add scheduled email workflows and approval notifications.
- Preserve existing brand, content style, and multi-page navigation intent.

## Non-Goals
- Online payment processing in v1.
- Multi-teacher scheduling in v1.
- Native mobile apps.
