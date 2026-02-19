# 02 Admin Login and Access

## Overview
This guide explains how to sign in, sign out, and handle common access issues.

## Before You Start
- You need:
  - admin email,
  - admin password.
- If you do not have credentials, contact the owner/system administrator.

## Step-by-Step Instructions
1. Go to `/admin/login`.
2. Enter your details:
   - `Admin email`
   - `Password`
3. Click `Sign in`.
4. If successful, you will be redirected to `/admin/bookings`.
5. To sign out:
  - in `Bookings` or `Invoices`, click `Sign out`.

## Visual Reference
![Admin login page](assets/admin-login-page.png)

## Expected Result
- You can access admin tools after sign-in.
- You are redirected to booking operations by default.

## Common Mistakes
- Typing spaces before/after email.
- Using old password after a credential update.
- Staying on a stale tab/session and assuming current state is live.

## Troubleshooting
- Error: `Login failed. Check your email and password.`
  - Re-enter credentials carefully.
  - Confirm correct email account.
- Redirected back to login unexpectedly:
  - Your session may have expired.
  - Sign in again and continue.

## Security Notes
- Do not share admin credentials over unsecured channels.
- Sign out on shared devices.
- If credentials are exposed, rotate them immediately.

## Related Guides
- [01-Getting-Started.md](01-Getting-Started.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
