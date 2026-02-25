# 10 Admin Settings and System Configuration

## What This Screen Is
`/admin/settings` is the “settings page” for the whole app.

Use it to change supported settings without editing server files manually.

This page:
- saves settings to the server `.env`
- keeps the admin login credentials in sync with the database
- may restart the service after saving (so changes take effect)

## Before You Change Anything
1. Open `/admin/settings`.
2. Decide: is this a day-to-day change (safe), or a technical change (be careful)?

Examples:
- Day-to-day: invoice defaults, business details, contact info
- Technical: site URL, email credentials, security secrets

## Safety Rules (Beginner-Friendly)
- Change one thing at a time.
- If a secret field is already set, you can leave it blank to keep the current value.
- After saving, you may be logged out (this is normal if you changed the owner email).
- Many changes only fully apply after a restart. The app tries to restart automatically.

## Common Tasks (Step-by-Step)

### A) Update a Normal Setting
1. Change the field you want.
2. Leave everything else as-is.
3. Click `Save settings`.
4. Test the workflow you changed (for example, send a test invoice).

### B) Keep Current Secret Values
If you see a secret field that says it is already set:
- leave it blank if you are not changing it

Blank means “keep what is currently configured”.

### C) Change the Admin Login Email or Password
1. Find `Owner Email`.
2. Change it if you want the admin login email to change.
3. If you want to keep the current password:
   - leave the new password field blank
4. If you want to change the password:
   - enter a new password and save

After saving:
- you may be logged out
- sign in again with the new email/password

### D) Save and Confirm
1. Click `Save settings`.
2. Wait for the success message.
3. If it says a restart happened (or you were logged out), that is expected.
4. Re-test what you changed.

## Visual Reference
![Admin settings page](assets/admin-settings-page.png)

## Common Mistakes
- Changing owner email and then trying to sign in with the old email
- Changing email settings and not testing a real send (invoice send is the easiest test)

## Troubleshooting
- “Saved, but nothing changed”:
  - refresh the page and try again
  - a restart may be required
- Can’t log in after changing email/password:
  - use the new owner email/password
  - if stuck, use the server password reset script (technical owner)

## Next Guides
- [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
- [11-Admin-Reports-Dashboard.md](11-Admin-Reports-Dashboard.md)
