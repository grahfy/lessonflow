# LessonFlow Release Notes: Version 1.2.0

Release date: March 12, 2026

This `1.2.0` release covers the product and operations changes shipped after `v1.1.0`, with a particular focus on staff management, teacher assignment, timezone-safe scheduling, and safer upgrade behavior for single-user installs.

Release range: `v1.1.0..v1.2.0`

## Highlights

- Adds a dedicated teachers workspace so owners can manage staff accounts, teaching profiles, active state, profile media, and assignment-aware role boundaries inside the admin console.
- Introduces explicit business-timezone handling through `NEXT_PUBLIC_TIMEZONE`, so booking and invoice datetime inputs no longer depend on browser local time or Linux host localtime.
- Makes teacher assignment a first-class part of bookings, booking requests, recurring series, and customer defaults, with a safe owner fallback on true single-user installs.
- Repairs legacy unassigned datasets under strict safety gates so older installs can adopt staff assignment without manual database cleanup when appropriate.
- Improves deploy and update terminal polish by clearing spinner redraw rows cleanly during elapsed and ETA updates.

## Features

### Staff Management and Assignment

- Added `/admin/teachers` as an owner-facing workspace for staff directory browsing, profile editing, password rotation, image upload, and teacher account creation.
- Added assignment-aware staff APIs and client flows so bookings, booking requests, recurring series, and customers can all share the same teacher ownership model.
- Added owner fallback behavior so single-user installs show the owner as the valid teacher option when no active teacher account exists.

### Timezone-Safe Scheduling

- Added an explicit app timezone contract based on `NEXT_PUBLIC_TIMEZONE`.
- Updated booking form, admin booking edit flows, invoice datetime fields, and student booking requests to interpret `datetime-local` inputs in the configured business timezone before storing UTC.
- Added regression coverage for timezone conversion and DST-sensitive datetime parsing.

## Fixes and Stability Improvements

- Fixed assignment dropdowns and booking editors that previously showed `Unassigned` on production single-owner installs even when the owner was the only valid staff account.
- Fixed legacy upgrade handling so eligible fully unassigned installs can backfill old bookings, requests, series, and customer defaults safely.
- Fixed deploy/update spinner rendering so stray trailing characters do not remain on screen after elapsed or ETA suffixes shrink.

## Operations and Deployment

- The supported production model remains timestamped releases under `/var/www/lessonflow/releases` with `/var/www/lessonflow/current` as the live symlink.
- `NEXT_PUBLIC_TIMEZONE` should now be treated as required operational configuration for correct booking-time interpretation.
- Linux host timezone no longer acts as the source of truth for lesson scheduling; it is now only an operator convenience if aligned with the app timezone.
- Single-user installs should expect the owner account to appear as the assignable teacher in the booking editor, manual-booking flow, and customer assignment dropdowns when no active teacher exists.

## Upgrade Notes

- Apply the Prisma migrations added since `v1.1.0` before treating an existing installation as `1.2.0`.
- Set `NEXT_PUBLIC_TIMEZONE` explicitly, for example:

```bash
NEXT_PUBLIC_TIMEZONE="Australia/Melbourne"
```

- Do not assume Linux `localtime` will correct lesson-time interpretation if this variable is missing or wrong.
- After deploy, verify `/admin/teachers` loads for the owner account.
- After deploy, verify booking and customer assignment dropdowns show the expected staff option.
- After deploy, verify `/admin/about` or the admin footer reports the expected release label.

## Risk / Notes

- The assignment backfill is intentionally conservative and will skip any install that has already started using real teacher assignment data.
- This release combines product workflow changes with upgrade and deploy behavior because assignment correctness depends on both application logic and configuration state.
- Operators should refresh any local runbooks or screenshots that still assume a single undifferentiated admin identity model.
