# Research: Application Modularization and Whitelabeling

## Objective
Identify all hardcoded dependencies on "Melbourne Guitar School" and specific guitar-related terminology to transform LessonFlow into a generic, whitelabel-ready music school management platform.

## 1. Hardcoded Identity & Branding
The following elements are currently hardcoded and must be moved to configuration (Env Vars or DB Settings):

- **School Name:** "Melbourne Guitar School" (Found in `branding.ts`, `layout.tsx`, `site-shell.tsx`, `seo-config.json`, and all public pages).
- **Primary Subject:** "Guitar" (Found in "Guitar Lessons", "Digital Guitar Lessons", "Guitar Teacher", etc.).
- **Primary Location:** "Northcote" (Found in contact pages, booking forms, and invoice footers).
- **Teacher Identity:** "Jon King" (Found in teacher profile, video showcase, and various lead texts).
- **Contact Details:** Phone (`0401 489 437`), Address (`Rear 66/68 High St...`), and specific email addresses.
- **Logos:** `/images/mgs-logo.webp` and `/images/company-logo-invoice.webp`.

## 2. Dynamic Content Areas (CMS Requirements)
To allow editing the "front end" without code changes, the following sections need a database-backed CMS:

- **Hero Sections:** Title, lead text, and background images for Home, Lessons, Teacher, and Contact pages.
- **Metrics:** Experience counters (e.g., "30+ Years of Playing").
- **Feature Blocks:** Marketing copy describing lesson formats and benefits.
- **SEO Metadata:** Page-specific titles and descriptions currently in `seo-config.json`.

## 3. Communication Templates
Outbound communication is currently hardcoded as HTML strings in `src/lib/email/templates.ts`.

- **Email Templates:** Subjects and bodies for booking confirmations, reminders, and notifications.
- **Email Signatures:** The branding block at the bottom of every email.
- **Invoice Templates:** The HTML/PDF layout including headers, footers, and payment instructions.
- **Placeholders:** A system is needed to inject variables like `{{customerName}}`, `{{lessonTime}}`, `{{invoiceNumber}}`, and `{{brandName}}`.

## 4. Business Logic & Products
- **Lesson Packages:** "Digital guitar lessons", "Educational books", etc., are hardcoded in invoice kind types and select fields.
- **Currencies:** Currently defaults to "AUD" in several formatting helpers.

## 5. Technical Architecture Analysis

### Current Configuration Foundation
- `src/lib/setup.ts`: Manages `.env` variables via the Setup Wizard. This is the best place for "Deployment-level" branding (Names, IDs).
- `src/lib/branding.ts`: Provides a thin layer for branding constants. Should be expanded to read from config.

### Proposed Database Models (Prisma)
- **`PublicPageContent`**: Stores JSON blobs of text/image data keyed by page path and section.
- **`EmailTemplate`**: Stores custom subjects and HTML bodies for system-triggered emails.
- **`InvoiceTemplate`**: Stores layout options, custom footers, and accent colors for financial documents.

### Admin UI Extension
- The `/admin/settings` route needs to be refactored into a multi-tab dashboard:
    - **General:** Branding, Location, Logos.
    - **Pages:** Frontend CMS for each public route.
    - **Emails:** Template editor with placeholders.
    - **Invoices:** Layout and signature customization.
    - **Products:** Manage lesson types and price presets.

## 6. Infrastructure & DevOps
- **Deployment Scripts:** `deploy/deploy.sh` and systemd services need to be parameterized to remove "melbourne-guitar-school" from logs and service names.
- **Assets:** School-specific images in `/public/images/` should be treated as "defaults" that can be overridden via URL or upload.
