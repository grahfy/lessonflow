# 04 Customer Directory

## What This Is
The customer directory is a simple “address book” for the school.

Use it to:
- find existing customers quickly
- avoid duplicate entries
- keep phone/email accurate
- jump to invoice history
- manage student portal credentials (if needed)

## Where To Find It
1. Open `/admin/bookings`.
2. Click `Customers`.

## Common Tasks (Step-by-Step)

### A) Find a Customer (Always Search First)
1. Open `Customers`.
2. Use the `Search` field.
3. Try:
   - email (best)
   - phone number
   - last name
4. If you find the customer, click `Edit` to confirm details are correct.

### B) Create a New Customer
Only create a new customer if search finds nothing.
1. Click `Create New Customer`.
2. Enter:
   - full name
   - email
   - phone
3. Click `Save customer`.

### C) Edit Customer Details
1. Find the customer row.
2. Click `Edit`.
3. Update the fields.
4. Click `Save customer`.

Tip:
- If a customer changes email or phone, update it here. This keeps invoices and contact messages consistent.

### D) Open Invoice History for a Customer
1. In the customer row, click `Invoices`.
2. You will be redirected to `/admin/invoices` with filters set for that customer.

### E) Delete / Archive (Use Carefully)
1. Find the customer row.
2. Click `Delete`.
3. Confirm.

Use this only when:
- the customer is a duplicate entry
- the record is clearly incorrect/test data

Avoid deleting real customers unless you are sure it will not affect history you need.

## Visual Reference
![Customer directory list](assets/customer-directory-list.png)
![Create customer editor dialog](assets/customer-editor-create.png)

## Common Beginner Mistakes
- Creating duplicates (for example “Jon Smith” and “John Smith”)
  - Fix: search by email/phone before creating
- Deleting an active customer instead of editing
  - Fix: use `Edit` for corrections

## Troubleshooting
- Customer not found:
  - search by email (best)
  - search by phone digits
  - check spelling differences

## Next Guides
- [03-Booking-Management.md](03-Booking-Management.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
