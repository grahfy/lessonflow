# 01 Getting Started

## What This App Is
This web app runs Melbourne Guitar School’s day-to-day operations:
- bookings and lesson requests
- customers and contact details
- invoices, reminders, and payment tracking
- learning materials (student portal)
- reports and owner summaries

If you are brand new, you can learn the basics in 15 minutes by following the first 4 guides in order.

## Where You Work (Most Days)
You will mainly use two admin screens:
- `Bookings` (`/admin/bookings`): schedule, lesson requests, moving/cancelling, customer actions
- `Invoices` (`/admin/invoices`): creating/sending invoices, reminders, recording payment, credit notes

Other admin screens:
- `Reports` (`/admin/reports`): daily/weekly/monthly/yearly summaries and comparisons
- `Settings` (`/admin/settings`): system settings (used carefully)
- `Manual` (`/admin/manual`): these guides (in-app)

## Before You Start
You need:
- the admin login email and password
- a basic understanding of your lesson process:
  - when to approve requests
  - how to handle moves/cancellations
  - when to invoice and when to follow up

## Quick Start (First Day)
1. Log in at `/admin/login`.
2. Open `Bookings` and click a few items on the calendar so you understand how the detail dialog works.
3. Open `Customers` inside `Bookings` and search for a known customer.
4. Open `Invoices` and practice:
   - filtering by `Outstanding only`
   - opening an invoice with `View`
   - downloading a PDF with `Download PDF`

## Daily Routine (Simple Checklist)
1. `Bookings`:
   - approve or reject new requests
   - check today’s bookings
   - move or cancel bookings as needed
2. `Invoices`:
   - send invoices for completed/confirmed lessons
   - send reminders for overdue invoices
   - mark payments as paid when received

## Common Beginner Mistakes (And How To Avoid Them)
- You edit a booking but forget the last step:
  - After changing details, click `Save details`
  - After changing date/time, click `Move booking`
- You try to delete something important:
  - Sent/paid invoices should not be deleted. Use `Create credit note` instead.
- You assume an email was delivered:
  - If email delivery is not configured, actions can be recorded but not delivered. See `06-Email-and-Notifications.md`.

## If You Get Stuck
Start here:
- [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)

## Next Guides
- [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md)
- [03-Booking-Management.md](03-Booking-Management.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
