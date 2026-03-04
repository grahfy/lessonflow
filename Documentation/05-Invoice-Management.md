# 05. Invoice Management

This chapter is written for music teachers, private studio operators, and music school administration teams using LessonFlow to run lesson scheduling, student communication, and billing with confidence.

<div class="manual-callout info">
<strong>Lifecycle Rule:</strong> Invoice actions are state-dependent. Correct status interpretation must always come before button selection.
</div>

Invoice operations in LessonFlow are built around explicit transitions to prevent accidental financial inconsistency. A draft invoice is editable but not yet issued. A sent invoice is active and awaiting settlement. A paid invoice records completed payment. A void invoice represents a non-collectible document preserved for audit traceability.

Creation should begin with customer confirmation and line-item clarity. Operators should verify recipient identity before composing charges, then ensure quantities and pricing reflect the agreed lesson or service context. Notes should be concise and actionable rather than narrative-heavy. A clean invoice at creation time reduces reminder disputes later.

Sending requires a final pre-flight review. Confirm customer contact details, due date, amount, and descriptive text. Once sent, the invoice enters collection tracking and should be treated as a financial commitment. If a customer requests clarification, prefer editing while still draft where possible, or use supported lifecycle corrections where already sent.

Payment recording must be accurate. In LessonFlow, `Mark as Paid` is intentionally limited to eligible statuses, and `Mark as Unpaid` is available for controlled correction from paid state. These constraints protect accounting consistency and reduce accidental state corruption.

Void actions should be used deliberately and only when the invoice is not intended for collection. Deletion is more destructive and should be reserved for exceptional cases where policy and traceability requirements allow it. In normal operations, status-based lifecycle transitions are safer than permanent removal.

Overdue management is not a one-click task; it is a cadence. Use aging filters to segment follow-up urgency, send reminders in controlled batches, and maintain concise internal notes for customer context. The objective is predictable recovery behavior, not ad hoc chasing.

A reliable invoice workflow combines discipline and transparency: confirm state, apply valid transition, verify resulting status, and leave clear operational context for the next operator.
