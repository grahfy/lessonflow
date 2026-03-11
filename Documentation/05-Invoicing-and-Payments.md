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

## Invoice Creation Paths

LessonFlow supports more than one invoice origin:

| Creation path | Typical use |
| --- | --- |
| Booking-based invoice | Billing that should remain tied to a lesson workflow |
| Standalone invoice | Manual billing that does not need to originate from a lesson |
| Preset-based line items | Reusable billing patterns such as lesson packages or standard products |

When a lesson relationship matters, creating the invoice from the booking context is generally the more traceable approach.

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
| Paid | Collected invoice recorded in reporting | Mark unpaid if correction is required, review history |
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

## Credit Notes

Credit notes provide the formal negative-adjustment path when an existing invoice requires structured correction. They are preferable to informal removal when the original billing event has already entered the sent or paid stages.

## Related Sections

- [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)
- [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
- [Reports and Follow-Up](07-Reports-and-Follow-Up.md)
- [Troubleshooting and Quick Reference](13-Troubleshooting-and-Quick-Reference.md)
