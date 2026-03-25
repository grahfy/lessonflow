# Public Intake and Student Portal

The public site and student portal form the outward-facing side of LessonFlow. Public visitors use these routes to make initial contact or request lessons, while existing students use the portal for sign-in, self-service booking activity, cancellation, and materials access. This chapter describes those external surfaces from the perspective of an administrator who may later need to respond inside the admin console.

<div class="manual-callout info">
<strong>Scope note:</strong> This chapter explains the user-facing behaviour of the public booking form, contact form, and portal. It does not replace the internal workflow chapters that describe the corresponding admin actions.
</div>

## Public Booking Requests

The public booking form creates a pending request rather than a confirmed lesson.

![Public booking request page](assets/public-book-page.png)

Typical consequences of a public booking submission include:

- geoblocking evaluation before schema validation
- creation of a pending booking request for admin review
- requirement for CAPTCHA completion
- possible guidance toward an introductory lesson duration for new students
- occasional degraded email outcomes that still preserve the request record

The administrative follow-up path begins in the Bookings workflow.

## Public Contact Enquiries

The public contact form records general enquiries for later follow-up.

![Public contact page](assets/public-contact-page.png)

These enquiries may lead to:

- geoblocking rejection before normal validation where the public intake policy blocks the request
- a manual email reply
- progression into a booking conversation
- later follow-up without immediate conversion

## Student Login

Student sign-in requires:

- full name
- postcode
- portal password

![Student portal login page](assets/student-login-page.png)

The student login page also links directly to the public privacy policy and terms-of-service pages. These routes exist so public and student-facing policy disclosures stay available without requiring admin access.

If a student cannot sign in, the customer record and current portal credential should be reviewed before regeneration is attempted.

## Student Portal Functions

The portal provides the following student-facing actions:

- viewing upcoming appointments
- viewing previous appointments
- reviewing post-lesson plan summaries for previous lessons where shared content exists
- requesting a lesson
- cancelling an eligible future booking
- accessing learning materials

![Student portal dashboard page](assets/student-portal-page.png)

Portal-originated requests and cancellations remain subject to administrative review and historical context.

## Public Policy Pages

LessonFlow now exposes separate public routes for privacy and service-terms disclosure in addition to the main lesson-policy page. These routes are relevant to operators because:

- the student login page links to them directly
- the privacy page describes website, portal, and Google-connected communication handling
- the terms-of-service page covers portal use and connected Google-enabled communication tools

Changes to these pages should therefore be treated as public-operational policy changes, not only as marketing copy edits.

## Administrative Interpretation

From an admin perspective, the most important interpretation rules are:

| Portal or public event | Administrative meaning |
| --- | --- |
| Public booking request | New pending request requiring calendar review |
| Public contact enquiry | Support or sales intake requiring response |
| Student portal request | Pending request originating from an existing student context |
| Student portal cancellation | A meaningful historical event, not a disappearance of the record |
| Lesson plan summary visible in portal | Shared post-lesson content was saved to a previous booking plan; private teaching notes remain internal |
| Public geoblocking rejection | Intake policy blocked the submission before ordinary field-validation handling |
| “No materials yet” | Potentially normal state if nothing has been uploaded |

## Related Sections

- [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)
- [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
- [Lesson Planning and Templates](03b-Lesson-Planning-and-Templates.md)
- [Learning Materials and Notifications](06-Learning-Materials-and-Notifications.md)
- [Troubleshooting and Quick Reference](13-Troubleshooting-and-Quick-Reference.md)
