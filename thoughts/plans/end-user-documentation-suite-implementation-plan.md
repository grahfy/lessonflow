# End-User Documentation Suite Implementation Plan

## Overview
Author complete, detailed, easy-to-follow end-user documentation for Melbourne Guitar School operations in the `Documentation/` directory. The output should allow non-technical admins to run booking, customer, invoice, and follow-up workflows without developer assistance.

## Current State Analysis
- Product and feature overview is present in root README but is not a full procedural user manual (`README.md:1`, `README.md:53`).
- A high-level documentation strategy already exists and defines target guides, but those end-user guides are not yet authored (`Documentation/END_USER_DOCUMENTATION_PLAN.md:20`).
- Booking operations and customer management are concentrated in one dense admin surface (`src/components/admin-bookings-client.tsx:356`, `src/components/admin-bookings-client.tsx:704`).
- Invoice operations include reminder and credit-note workflows that must be reflected in user docs (`src/components/admin-invoices-client.tsx:583`, `src/components/admin-invoices-client.tsx:753`).
- Automated jobs now exist for invoice reminders and daily digest, requiring clear operations guidance (`src/app/api/jobs/invoice-reminders/route.ts:15`, `src/app/api/jobs/daily-bookings-digest/route.ts:10`).

### Key Discoveries
- There is already a documentation plan scaffold to build from, reducing structure risk (`Documentation/END_USER_DOCUMENTATION_PLAN.md:91`).
- Booking dialogs are complex enough that screenshot-led instructions are necessary for usability (`src/components/admin-bookings-client.tsx:1861`).
- Invoicing has advanced lifecycle states (send/remind/paid/credit note), so linear “happy path only” docs will be insufficient (`src/components/admin-invoices-client.tsx:741`).
- Email behavior differs when SMTP is disabled; docs must call this out to prevent user confusion (`src/lib/email/service.ts:44`).

## Desired End State
A versioned end-user documentation suite in `Documentation/` containing:
- onboarding and navigation orientation,
- end-to-end booking/customer/invoice procedures,
- reminder and outstanding follow-up routines,
- troubleshooting and FAQs,
- glossary and operational guardrails,
- screenshot asset plan and maintenance process.

## What We're NOT Doing
- Implementing new product features or UI changes.
- Rewriting developer-facing architecture docs.
- Building automated screenshot tooling in this phase.
- Translating docs into additional languages in this phase.

## Design Options
1. Single giant manual in one Markdown file.
   - Pros: one file to edit.
   - Cons: difficult navigation, poor readability for operators under time pressure.
2. Task-based multi-document suite with index and cross-links (selected).
   - Pros: easy lookup, better onboarding, clear ownership by workflow.
   - Cons: requires more structure discipline.
3. Developer-doc-first structure with user content appended.
   - Pros: easier for engineering team.
   - Cons: wrong audience hierarchy for end-user operations.

Selected approach: Option 2.

## Implementation Approach
- Use a modular documentation set in `Documentation/` with explicit task flows.
- Reuse the existing `END_USER_DOCUMENTATION_PLAN.md` as source scaffolding.
- Ground all procedures in current UI labels and route entry points.
- Standardize each guide with repeatable section structure to improve readability.
- Include operation-critical warnings (for example, delete vs credit note, SMTP fallback behavior).

## Resolved Decisions
- Include technical-user coverage for automation overrides:
  - Document owner/technical procedures for invoice reminder job payload overrides (`dryRun`, `stage`, `maxInvoices`, `customerId`).
- Screenshot capture approach:
  - Capture screenshots in this rollout and embed them directly in workflow guides.
- GST documentation stance:
  - Use a neutral operational disclaimer in end-user docs and avoid business-specific tax policy assertions unless accountant-approved wording is provided.

## Phase 1: Documentation Information Architecture and Standards

### Overview
Create the navigation/index layer and writing standards that all guides follow.

### Changes Required

#### 1. Documentation Index and Navigation
**File**: `Documentation/README.md` (new)
**Changes**:
- Add documentation landing page and quick-start links.
- Add “Who should read this?” by role.
- Add map of all guides with short summaries.

#### 2. Authoring Standard Template
**File**: `Documentation/_TEMPLATE.md` (new)
**Changes**:
- Define standard section order:
  - Overview
  - Before You Start
  - Step-by-Step Instructions
  - Expected Result
  - Common Mistakes
  - Troubleshooting
  - Related Guides
- Define style rules for plain-language instruction writing.

### Success Criteria

#### Automated Verification
- [x] Markdown files render without syntax errors in Git hosting preview.

#### Manual Verification
- [ ] A reviewer can find any major workflow from `Documentation/README.md` within 2 clicks.
- [x] Template is usable for all guides without custom structural exceptions.

---

## Phase 2: Core Admin Workflow Guides (Booking + Customer)

### Overview
Write complete procedural docs for booking and customer workflows.

### Changes Required

#### 1. Getting Started + Access Guide
**Files**:
- `Documentation/01-Getting-Started.md` (new)
- `Documentation/02-Admin-Login-and-Access.md` (new)
**Changes**:
- Explain admin entry points (`/admin/login`, `/admin/bookings`, `/admin/invoices`).
- Document first-login checks and session expectations.
- Document sign-out and common login failure handling.

#### 2. Booking Management Guide
**File**: `Documentation/03-Booking-Management.md` (new)
**Changes**:
- Document day/week/month views and status meanings.
- Provide approval/rejection/edit/move/cancel procedures.
- Include recurring-series cancellation and reminder email flows.
- Add “what to do if booking details conflict” guidance.

#### 3. Customer Directory Guide
**File**: `Documentation/04-Customer-Directory.md` (new)
**Changes**:
- Document searching, creating, editing, archiving customers.
- Document duplicate handling expectations and safe correction steps.
- Document customer-to-invoice navigation path.

### Success Criteria

#### Automated Verification
- [x] Internal links between Phase 2 docs resolve correctly.

#### Manual Verification
- [ ] A new admin can process one booking request end-to-end from docs alone.
- [ ] A new admin can create and update a customer profile without outside help.

---

## Phase 3: Billing and Follow-Up Guides

### Overview
Document invoicing, reminders, payment status, and credit-note correction flows in end-user language.

### Changes Required

#### 1. Invoice Management Guide
**File**: `Documentation/05-Invoice-Management.md` (new)
**Changes**:
- Document invoice creation from booking and customer contexts.
- Document line-item edits, GST mode usage, send/download/print steps.
- Document mark-paid/mark-unpaid behavior and outstanding filters.
- Document credit-note workflow and when to use it instead of delete.

#### 2. Email and Notification Guide
**File**: `Documentation/06-Email-and-Notifications.md` (new)
**Changes**:
- Explain automatic vs manual email actions.
- Explain SMTP enabled vs queued fallback behavior.
- Include verification checklist for “was email sent?”.
- Include technical-user appendix with cron reminder override payload examples.

#### 3. Outstanding and Follow-Up Guide
**File**: `Documentation/07-Reports-Outstanding-and-Follow-Up.md` (new)
**Changes**:
- Explain aging buckets and overdue handling process.
- Document single reminder and bulk reminder operations.
- Add daily/weekly operator routines.

### Success Criteria

#### Automated Verification
- [x] All command/route references are consistent with current README and route files.

#### Manual Verification
- [ ] Admin can run invoice lifecycle (create -> send -> paid) using docs only.
- [ ] Admin can run overdue reminder workflow using docs only.
- [ ] Admin can execute correction flow with credit note using docs only.

---

## Phase 4: Troubleshooting, FAQ, and Glossary

### Overview
Add high-value support content to reduce day-to-day support questions.

### Changes Required

#### 1. Troubleshooting and FAQ
**File**: `Documentation/08-Troubleshooting-and-FAQs.md` (new)
**Changes**:
- Document top support issues and recovery steps:
  - login failures,
  - booking edit mistakes,
  - invoice send/reminder confusion,
  - PDF download issues,
  - queued email behavior.

#### 2. Glossary
**File**: `Documentation/09-Glossary.md` (new)
**Changes**:
- Define all operational terms used across guides.
- Include synonyms users may search for.

### Success Criteria

#### Automated Verification
- [x] No unresolved TODO markers remain in end-user docs.

#### Manual Verification
- [ ] Operator can resolve at least 80% of common support questions via docs.
- [ ] Glossary terms match UI labels and wording.

---

## Phase 5: Visual Assets and Readability Polish

### Overview
Improve usability with screenshots, callouts, and readability cleanup.

### Changes Required

#### 1. Documentation Assets
**Files**:
- `Documentation/assets/` (new directory)
- image files named per workflow (new)
**Changes**:
- Add desktop screenshots for each major workflow in this rollout.
- Add mobile screenshots where UI differs significantly in this rollout.
- Add callout references that match steps in docs.

#### 2. Final Readability Pass
**Files**: all `Documentation/*.md`
**Changes**:
- Simplify long paragraphs.
- Convert dense explanation into numbered actions.
- Add “Expected Result” after each critical procedure.

### Success Criteria

#### Automated Verification
- [x] All image paths in docs resolve.

#### Manual Verification
- [ ] Non-technical reviewer can complete target tasks without external clarification.
- [x] Screenshots match current UI labels and button names.

---

## Phase 6: Release, Governance, and Maintenance

### Overview
Publish docs and define an update process so they stay accurate.

### Changes Required

#### 1. Documentation Governance
**Files**:
- `Documentation/README.md`
- `Documentation/CHANGELOG.md` (new)
**Changes**:
- Define update triggers (UI changes, workflow changes, policy changes).
- Define owner and review cadence.
- Add change log entries for doc versions.

#### 2. Handover Checklist
**File**: `Documentation/README.md`
**Changes**:
- Add onboarding checklist for new admins.
- Add periodic operational checklist (daily/weekly/monthly tasks).

### Success Criteria

#### Automated Verification
- [x] Documentation tree committed with index, guides, and changelog.

#### Manual Verification
- [ ] Stakeholder sign-off confirms docs are production-ready for end users.
- [x] Maintenance owner and review cadence are explicitly documented.

---

## Testing Strategy
- Use guided task walkthroughs with a non-technical reviewer as primary quality test.
- Validate every documented workflow against current UI labels and button text.
- Use a broken-link pass and markdown preview checks before publication.
- Re-run quick documentation audit whenever booking/invoice features change.

## Performance Considerations
- Keep guides split by workflow to reduce scanning time.
- Keep critical procedures within first screen length where possible.
- Use screenshot callouts sparingly to avoid cognitive overload.

## Migration Notes
- This is an additive documentation initiative; no data/schema migration required.
- Existing `Documentation/END_USER_DOCUMENTATION_PLAN.md` should be retained as meta-planning history.
- Root `README.md` remains product/developer overview; end-user procedures move to dedicated guides.

## References
- Ticket: `thoughts/tickets/2026-02-19-end-user-documentation-suite.md`
- Research: `thoughts/research/2026-02-19_end-user-documentation-suite-research.md`
- Existing doc strategy scaffold: `Documentation/END_USER_DOCUMENTATION_PLAN.md`
- Product overview baseline: `README.md`
- Booking operations surface: `src/components/admin-bookings-client.tsx`
- Invoice operations surface: `src/components/admin-invoices-client.tsx`
- Jobs and operations automation: `src/app/api/jobs/daily-bookings-digest/route.ts`, `src/app/api/jobs/invoice-reminders/route.ts`
