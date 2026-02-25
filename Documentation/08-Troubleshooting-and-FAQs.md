# 08 Troubleshooting and FAQs

## How To Use This Guide
1. Find the problem below.
2. Try the quick fix steps in order.
3. If it still fails, escalate to the technical owner.

Tip:
- Most “weird” issues are solved by: refresh the page, sign in again, or try a new tab.

## Common Problems (Quick Fixes)

### 1) I Can’t Log In
Try this:
1. Re-type the email and password (watch out for spaces).
2. Solve the captcha and click `Sign in`.
3. If it fails, open a new tab and try again.
4. If you still cannot log in, ask the owner to reset credentials.

### 2) I Edited a Booking, But Nothing Changed
Most likely you missed the “final action”:
- After editing details: click `Save details`
- After changing date/time: click `Move booking`

Then:
1. Refresh the page.
2. Confirm you are viewing the correct date/week.

### 3) I Can’t Find a Customer
1. Search by email (best).
2. Search by phone digits.
3. Search by last name.
4. If still missing, create a new customer only after you are sure it is not a duplicate.

### 4) An Invoice Isn’t Showing Up
1. Clear the `Search` box.
2. Set `Status` to `All`.
3. Set `Aging` to `All`.
4. Turn `Outstanding only` off.
5. Click `Refresh`.

### 5) “Send reminder” Is Disabled
This is normal when:
- invoice is not `Sent`, or
- invoice is not overdue yet

Fix:
1. Open invoice with `View`.
2. Click `Send` first if it is still draft.
3. If it is due today or future, wait until overdue.

### 6) I Can’t Delete an Invoice
This is expected for sent/paid invoices.

Fix:
- Use `Create credit note` for corrections.

### 7) Customer Says “I Didn’t Get the Email”
1. Confirm you clicked the email action (`Send`, `Send reminder`, `Email customer`).
2. If email delivery is not configured, assume the customer did not receive it.
3. Re-send after delivery is confirmed working.

### 8) PDF Download Looks Out Of Date
1. Click `Download PDF` again (the app forces a fresh PDF download).
2. If you just edited the invoice, click `Save` first.
3. If it still looks wrong, refresh and try again.

## FAQ (Beginner-Friendly)

### Should I delete an incorrect sent invoice?
No. Use `Create credit note` so history stays correct.

### What if I marked payment by mistake?
Use `Mark unpaid`.

### Can I send reminders in bulk?
Yes, use `Send Due Reminders` in `/admin/invoices`.

## When To Escalate (Ask the Technical Owner)
- you cannot log in after multiple attempts
- many admin buttons return errors repeatedly
- scheduled emails/reports are not running for multiple days
- uploads fail even for small files

## Next Guides
- [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md)
- [03-Booking-Management.md](03-Booking-Management.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
