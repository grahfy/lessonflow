# End User Documentation Plan

## Goal
Create clear, in-depth, easy-to-read documentation for non-technical users so they can confidently operate the system without developer support for normal day-to-day workflows.

## Primary Audience
- Business owner / admin staff running bookings and invoices.
- Team members handling customer communication.
- New operators onboarding into the platform.

## Secondary Audience
- Technical support staff needing quick operational references.
- Stakeholders reviewing system capability and process fit.

## Success Criteria
- A new admin user can complete core workflows using docs alone.
- Common errors and edge cases are documented with simple recovery steps.
- Documentation is structured for fast lookup during live operations.
- Content stays synchronized with production behavior after feature updates.

## Documentation Set (Deliverables)
1. `Documentation/01-Getting-Started.md`
2. `Documentation/02-Admin-Login-and-Access.md`
3. `Documentation/03-Booking-Management.md`
4. `Documentation/04-Customer-Directory.md`
5. `Documentation/05-Invoice-Management.md`
6. `Documentation/06-Email-and-Notifications.md`
7. `Documentation/07-Reports-Outstanding-and-Follow-Up.md`
8. `Documentation/08-Troubleshooting-and-FAQs.md`
9. `Documentation/09-Glossary.md`
10. `Documentation/README.md` (documentation index and navigation map)

## Information Architecture
- Start with role-based outcomes, not technical internals.
- For every workflow, use:
  - purpose,
  - prerequisites,
  - step-by-step actions,
  - expected result,
  - troubleshooting,
  - related tasks.
- Keep each page focused to reduce cognitive load.

## Writing Standards
- Use plain language and short sentences.
- Prefer “click this, then this” instructions.
- Avoid engineering jargon unless defined in Glossary.
- Use consistent terms:
  - “booking request”, “confirmed booking”, “invoice”, “credit note”, “outstanding”.
- Include screenshots with callouts for all high-frequency workflows.
- Include “Why this matters” notes for critical decisions (for example, credit note vs delete).

## Content Requirements by Guide

### 01 Getting Started
- What the platform is.
- What each admin section does.
- First login checklist.
- Basic navigation map.

### 02 Admin Login and Access
- How to sign in.
- Session timeout behavior.
- Password/credential handling policy.
- What to do if login fails.

### 03 Booking Management
- Calendar views (day/week/month).
- Request approval/rejection.
- Editing/moving/cancelling bookings.
- Recurring series management.
- Sending booking reminders and custom emails.

### 04 Customer Directory
- Searching customers.
- Creating/updating customer details.
- Archive/delete behavior and historical links.
- Best practices for data quality.

### 05 Invoice Management
- Creating invoice from booking.
- Creating invoice from customer context.
- Adding/editing line items.
- GST mode basics for admins (with accountant disclaimer).
- Sending invoice email with PDF.
- Downloading and printing invoice PDFs.
- Mark paid/unpaid.
- Outstanding and aging filters.
- Sending reminders (single and bulk).
- Creating credit notes for sent/paid invoices.

### 06 Email and Notifications
- Which actions trigger emails automatically.
- Manual email actions available in admin.
- What happens when SMTP is not configured.
- How to verify an email was queued/sent.

### 07 Reports, Outstanding, and Follow-Up
- How to find overdue invoices.
- Recommended daily and weekly operating routines.
- Reminder cadence guide (7/14/30).
- End-of-week cashflow review checklist.

### 08 Troubleshooting and FAQs
- Common booking issues.
- Common invoice issues.
- Missing email troubleshooting path.
- PDF generation/download issues.
- Data correction guidance (including credit notes).

### 09 Glossary
- Plain-language definitions of every key term used in UI and docs.

## Documentation Format Template
Each guide should use this section order:
1. Overview
2. Before You Start
3. Step-by-Step Instructions
4. Expected Result
5. Common Mistakes
6. Troubleshooting
7. Related Guides

## Screenshot and Visual Plan
- Capture desktop screenshots for every major flow.
- Add mobile screenshots where behavior differs.
- Annotate screenshots with numbered callouts matching steps.
- Store image assets in `Documentation/assets/` with descriptive names.

## Execution Plan (Phased)

### Phase 1: Foundation
- Create `Documentation/README.md` index.
- Create guide skeleton files with standardized headings.
- Approve terminology list.

### Phase 2: Core Workflow Drafts
- Draft Getting Started, Booking Management, Customer Directory.
- Run first readability pass (non-technical reviewer).

### Phase 3: Billing & Communication Drafts
- Draft Invoice Management and Email/Notification guides.
- Validate against current UI and API behavior.

### Phase 4: Support Content
- Draft Reports/Follow-Up, Troubleshooting/FAQs, Glossary.
- Add cross-links between related guides.

### Phase 5: Visual Enrichment
- Capture/annotate screenshots.
- Add callouts and step references.
- Confirm screenshot freshness against latest UI.

### Phase 6: QA and Publish
- Test every guide against live workflow walk-through.
- Fix ambiguity and missing steps.
- Publish version `v1`.

## Review and QA Checklist
- Steps are complete and executable.
- Terms match UI labels exactly.
- No developer-only assumptions in user guides.
- Recovery paths exist for likely user errors.
- All links resolve and navigation index is complete.
- Screenshots match current interface.

## Ownership and Maintenance
- Documentation owner: Product/Operations lead (or assigned admin).
- Update trigger: any feature, UI label, workflow, env, or policy change.
- Review cadence: monthly quick audit + release-based update audit.
- Changelog file to track doc revisions and affected features.

## Suggested Timeline
- Week 1: Phases 1-2
- Week 2: Phases 3-4
- Week 3: Phases 5-6 and sign-off

## Final Acceptance
Documentation is considered complete when:
- A new admin can run booking + invoicing workflows unaided.
- A second reviewer confirms clarity and accuracy.
- Guides include screenshots and troubleshooting for top issues.
