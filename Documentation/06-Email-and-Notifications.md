# 06. Email and Notifications

This chapter is written for music teachers, private studio operators, and music school administration teams using LessonFlow to run lesson scheduling, student communication, and billing with confidence.

Communication behavior in LessonFlow spans both automated and operator-initiated flows. The system may send owner alerts, booking updates, invoice notifications, and reminders depending on workflow state and configuration. Operators should understand which messages are automatic and which require manual action to avoid communication gaps.

Before sending any manual email action, verify recipient identity and message relevance. The most common communication failures are not SMTP outages; they are incorrect recipient data and stale workflow context. A reminder sent to an outdated address or for an already-resolved issue creates avoidable customer confusion.

When SMTP configuration is unavailable or limited, LessonFlow may queue actions without immediate delivery. This behavior is expected fallback protection. Operators should interpret queued state as a signal to verify configuration and retry intentionally, not as a reason to repeat sends blindly.

Custom email tools in booking contexts are powerful and should be used with care. Keep subject lines explicit, keep body text concise, and ensure the message reflects current booking reality. If a booking was recently moved or cancelled, confirm state after save before dispatching communication.

If a customer reports missing email, perform a structured check: verify address on customer record, verify send action status, verify whether delivery was queued, and then resend with clear customer instructions (including spam folder check). Escalate technical investigation only after these basics are complete.

Consistent communication outcomes depend on one principle: every send action should have a known reason, a known recipient, and a confirmed system response.
