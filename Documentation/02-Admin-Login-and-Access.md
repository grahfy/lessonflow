# 02 Admin Login and Access

## What This Is
This guide shows how to sign in, sign out, and what to do if access fails.

Most problems come down to:
- wrong email/password
- expired session
- a stale browser tab (open a new tab)

## What You Need
- Admin email
- Admin password
- 10 seconds of uninterrupted time (avoid refreshing while signing in)

If you do not have credentials, ask the owner/technical admin.

## Sign In (Step-by-Step)
1. Go to `/admin/login`.
2. Enter:
   - `Admin email`
   - `Password`
3. Complete the quick captcha (a simple maths question).
4. Click `Sign in`.
5. You should land on `/admin/bookings`.

Tip:
- If you mistyped the password, use the show/hide password toggle to double-check.

## Sign Out
1. In any admin screen (`Bookings`, `Invoices`, `Reports`, `Settings`, `Manual`), click `Sign out`.
2. Close the browser tab if you are on a shared device.

## Visual Reference
![Admin login page](assets/admin-login-page.png)

## What “Session Expired” Means
If the app asks you to sign in again, it usually means:
- you were signed in earlier
- your session timed out
- or the browser lost the session cookie

Fix:
- go back to `/admin/login` and sign in again

## Common Beginner Mistakes
- Copy/paste adds a trailing space to the email
  - delete the last character and re-type it
- You keep re-trying the same tab after a long time
  - open a new tab and sign in again
- You sign in on HTTP instead of HTTPS (rare, but possible)
  - always use the normal site domain with HTTPS

## Troubleshooting (Quick)
- `Login failed. Check your email and password.`
  - confirm you are using the correct email
  - re-type the password carefully
  - try a new tab
- You sign in, then it jumps back to login
  - your session may have expired; sign in again
  - if it keeps happening, tell the technical owner (proxy/cookie issue)

## Security Notes (Plain English)
- Do not share passwords in text messages
- Sign out on shared devices
- If you think the password leaked, rotate it immediately

## Next Guides
- [03-Booking-Management.md](03-Booking-Management.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
