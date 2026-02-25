# 12 Student Portal and Learning Materials

## Overview
This guide explains how the student portal works and how admins should support students using it.

The student portal allows students to:
- log in with generated credentials,
- view upcoming and previous appointments,
- preview/download learning materials (audio/PDF),
- view general learning materials not linked to a specific appointment.

## Before You Start
- Student must have at least one approved booking and portal credentials generated.
- Admin may need to reveal or regenerate portal credentials from the customer directory.
- Learning materials should be uploaded in admin (booking-linked or general materials).

## Step-by-Step Instructions

### A) Student Login (Support Steps)
1. Direct the student to `/student/login`.
2. Student enters:
   - full name,
   - postcode,
   - portal password.
3. If login succeeds, student is taken to `/student/portal`.

### B) First-Time Access Support (Admin)
1. Open `/admin/bookings` and go to `Customers`.
2. Locate the student.
3. Use portal credential actions:
   - `Reveal password` (read back support), or
   - `Regenerate password` (issue a fresh password).
4. Share credentials securely with the student.

### C) Upload Learning Materials (Admin)
1. Open `/admin/bookings`.
2. Open `Customer Learning Materials`.
3. Select a customer.
4. Choose file upload.
5. Optionally link the material to an appointment.
6. Save/upload.

You can also upload a **general material** not connected to any appointment.

### D) Preview and Download Learning Materials
Admins and students can preview/download supported materials:
- PDF (inline preview in browser)
- Audio files (browser/audio preview where supported)

If preview is not supported by the browser, use `Download`.

### E) Student Portal Material Layout (What Students See)
Students will see:
- materials attached to appointments,
- general learning materials,
- upcoming/previous appointments for context.

## Visual Reference
![Student portal login page](assets/student-login-page.png)
![Student portal dashboard page](assets/student-portal-page.png)

## Expected Result
- Students can access learning materials securely from the portal.
- Admins can manage portal credentials and upload both appointment-linked and general materials.

## Common Mistakes
- Uploading materials before selecting the correct customer.
- Assuming all files preview the same way in every browser.
- Regenerating credentials without telling the student the old password stops working.

## Troubleshooting
- Student cannot log in:
  - verify full name/postcode match customer record,
  - reveal/regenerate portal password,
  - confirm approved booking exists.
- Preview fails but download works:
  - browser/file type limitation; use download.
- Upload fails with size error:
  - file may exceed current upload limit.

## Related Guides
- [03-Booking-Management.md](03-Booking-Management.md)
- [04-Customer-Directory.md](04-Customer-Directory.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
