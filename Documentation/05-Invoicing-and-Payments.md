# Invoicing and Payments

Invoicing and payment administration in LessonFlow are organised around an explicit lifecycle. The invoices area supports invoice creation, editing, sending, reminder activity, payment-state correction, and formal negative adjustments. This chapter describes that lifecycle and the administrative meaning of each stage.

<div class="manual-callout success">
<strong>Lifecycle principle:</strong> A draft invoice is internal work, a sent invoice is customer-facing billing, and a paid invoice affects reporting. Administrative actions should respect that difference.
</div>

## Invoice Functions

The invoices area supports:

- searching and filtering invoice records
- standalone invoice creation
- booking-based invoice creation
- preset-based line-item composition
- draft saving
- send and resend actions
- PDF download
- payment-state updates
- voiding
- reminder dispatch
- credit-note issuance

## Invoice List and Filter Use

The main invoice list is the primary review surface for:

- current invoice status
- outstanding balances
- overdue items
- aging-based collection priorities

This makes the list the preferred location for identifying what requires follow-up before opening an individual invoice.

![Invoice console list and filters](assets/invoice-console-list-and-filters.png)

## Invoice Creation Paths

LessonFlow supports more than one invoice origin:

| Creation path | Typical use |
| --- | --- |
| Booking-based invoice | Billing that should remain tied to a lesson workflow |
| Customer-based invoice | Billing that should stay attached to a known customer without requiring a booking-origin entry |
| Standalone invoice | Manual billing that does not need to originate from a lesson |
| Preset-based line items | Reusable billing patterns such as lesson packages or standard products |

When a lesson relationship matters, creating the invoice from the booking context is generally the more traceable approach.

Booking-linked invoice entry now checks for existing invoice linkage and likely invoice matches before a new draft is created. This is intended to reduce accidental duplicate billing when a lesson already belongs to an earlier draft or when a customer has a likely open invoice that should be reused.

![Invoice create dialog](assets/invoice-create-dialog.png)

## Line Items, Presets, and Discounts

Invoice editing supports manual line items, preset-derived rows, and invoice-level or line-level discounts.

The intended interpretation is:

- presets speed up recurring product or package entry
- discounts are part of the stored billing record, not temporary display adjustments
- invoice-level discounts apply before tax calculation
- line-level discounts remain attached to the specific billed row

Where mixed invoice sources are present, a single invoice may contain lesson-linked rows alongside manual or preset-based entries. That is normal when one customer-facing bill needs to cover more than one billing origin.

## Currency and Tax Profiles

LessonFlow supports a three-letter invoice currency code per invoice. Tax behaviour is then resolved from the active currency and tax-profile configuration.

The default interpretation is:

- the configured default currency supplies the starting point for new invoices
- <code>AUD</code> uses GST-aware behaviour based on the school’s invoice settings
- non-<code>AUD</code> currencies fall back to safe generic tax defaults unless an explicit tax profile has been configured
- tax labels, locale formatting, and default tax mode follow the resolved currency profile

This means operators should treat currency as part of the billing contract rather than as a cosmetic display toggle.

## Draft and Send States

Drafts are intended for invoices that are not yet ready to leave the system. Create-and-send actions are intended for invoices whose customer details, line items, due date, and terms are already confirmed.

Draft status is appropriate where:

- details still require review
- line items remain incomplete
- customer data needs confirmation

Immediate send is appropriate only when the invoice is operationally complete.

## Review Before Sending

The following elements should be reviewed before a customer-facing send action:

1. customer identity and contact details
2. due date
3. line-item descriptions
4. unit prices and quantities
5. tax mode
6. payment terms

## Payment-State Lifecycle

Not every action remains available at every stage.

| Status | Meaning | Typical actions |
| --- | --- | --- |
| Draft | Internal invoice preparation | Edit, save, send, delete if still safe |
| Sent | Customer-facing invoice awaiting collection | Resend, remind, mark paid, void |
| Paid | Collected invoice recorded in reporting | Correct payment details, mark unpaid if correction is required, review history |
| Voided | Invoice formally withdrawn from collection | Review only unless a new billing path is required |

<div class="manual-callout warning">
<strong>Correction note:</strong> Deletion should not be used as a substitute for lifecycle correction once an invoice has been sent or paid. Voiding and credit notes exist to preserve billing history.
</div>

## Reminders and Overdue Follow-Up

Reminder actions are intended for overdue sent invoices rather than for invoices still in draft or recently issued status. Outstanding and aging filters are the primary tools for identifying valid reminder candidates.

Reminder use is appropriate when:

- the invoice is overdue
- collection is still expected
- the customer address and invoice state have been confirmed

Automatic reminder timing and category controls are configured separately in [Settings and Configuration](08-Settings-and-Configuration.md). Manual single-invoice reminders remain part of the invoice workflow even when scheduled reminders are disabled.

![Invoice outstanding aging filters](assets/invoice-filters-outstanding-aging.png)

## Payment Corrections

Paid invoices remain editable for payment-detail correction where the billing document should stay intact but the recorded collection data was incomplete or wrong. This is distinct from deleting an invoice and should be treated as audit-preserving correction work.

Typical examples include:

- correcting payment date
- correcting recorded payment method or note fields
- moving a paid invoice back to unpaid when the paid state was recorded in error

![Invoice detail actions](assets/invoice-detail-send-and-download-pdf.png)

## Credit Notes

Credit notes provide the formal negative-adjustment path when an existing invoice requires structured correction. They are preferable to informal removal when the original billing event has already entered the sent or paid stages.

## Related Sections

- [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)
- [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
- [Reports and Follow-Up](07-Reports-and-Follow-Up.md)
- [Troubleshooting and Quick Reference](13-Troubleshooting-and-Quick-Reference.md)
