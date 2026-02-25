# 10 Admin Settings and System Configuration

## Overview
Use `/admin/settings` to manage supported system configuration values without editing files directly on the server.

This screen writes approved settings to the project `.env` file and can sync the admin login email/password to the database.

## Before You Start
- Sign in as an admin user.
- Open `/admin/settings`.
- Confirm you understand whether the change affects:
  - day-to-day behavior (for example invoice defaults), or
  - technical runtime behavior (for example site URL, email credentials, secrets).

## Important Safety Notes
- Many settings require an app restart to fully apply.
- Saving can trigger a best-effort service restart on the server.
- Secret fields may show as already set. Leaving them blank keeps the current value.
- Do not paste test credentials into production settings.

## Step-by-Step Instructions

### A) Review Current Configuration Sections
1. Open the grouped sections in the form.
2. Read the helper text under each field.
3. Check whether a field is marked:
   - `required`,
   - `secret`, or
   - both.

### B) Update General Settings
1. Change only the values you intend to update.
2. For secret fields already configured:
   - leave blank to keep the current secret,
   - enter a new value only when rotating/updating it.
3. Double-check `NEXT_PUBLIC_SITE_URL` before saving.

### C) Update Owner/Admin Login Details
1. Edit `Owner Email` to change the admin login email used by the system.
2. To keep the current admin password:
   - leave the new password field blank.
3. To rotate the admin password:
   - enter a new password and save.

After save:
- the admin database login email/password is synced,
- the current session may be cleared if the admin email changed,
- you may need to sign in again.

### D) Save and Confirm
1. Click `Save settings`.
2. Wait for the success message.
3. If prompted/logged out, sign in again with updated credentials.
4. Re-test the affected workflow (email, invoices, portal, etc.).

## Visual Reference
![Admin settings page](assets/admin-settings-page.png)

## Expected Result
- Supported configuration values are saved safely.
- Admin login credentials remain synchronized with the database.
- Runtime changes apply after restart (automatic or manual, depending on server permissions).

## Common Mistakes
- Clearing a secret field accidentally when intending to keep it (leave blank to keep current value).
- Changing owner email and then trying to log in with the old email.
- Updating email settings without testing a real send path afterward.

## Troubleshooting
- Save says settings saved but feature still behaves the old way:
  - restart may be required,
  - confirm the field you changed is the correct one.
- Save fails on a required secret left blank:
  - check whether that secret is already configured in the current environment.
- Login fails after admin email/password change:
  - use the new owner email/password,
  - if needed, use the password reset script documented in deploy/admin operations docs.

## Related Guides
- [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
- [11-Admin-Reports-Dashboard.md](11-Admin-Reports-Dashboard.md)
