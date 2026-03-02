# TODO: LessonFlow Modularization & Whitelabeling

## Phase 0: Deep Audit & Mapping [audit]
- [x] **Grep Audit** [audit]
  - [x] Search for "Melbourne Guitar School", "MGS"
  - [x] Search for "Guitar" (careful with code references vs content)
  - [x] Search for "Jon King", "Northcote"
  - [x] Search for phone: "0401 489 437", address: "Rear 66/68 High St"
- [x] **Asset Audit** [audit]
  - [x] List all hardcoded image paths in `public/images/`
  - [x] Audit `globals.css` for school-specific backgrounds/colors
- [x] **Product Audit** [audit]
  - [x] Identify hardcoded `InvoiceLineItem` kinds (e.g., `digital_guitar_lessons`)
  - [x] Check for hardcoded lesson fees or durations
- [x] **Mapping Document** [audit]
  - [x] Create a consolidated mapping of elements to dynamic sources (Env vs DB)

## Phase 1: Foundation & Core Configuration [backend][database]
- [x] **Database Schema Expansion** [database]
  - [x] Add `PublicPageContent` model to `schema.prisma`
  - [x] Add `EmailTemplate` model to `schema.prisma`
  - [x] Add `InvoiceTemplate` model to `schema.prisma`
  - [x] Run migration: `npx prisma migrate dev --name modular_content_models`
- [x] **Config & Branding Layer** [backend]
  - [x] **Setup Wizard Expansion** (`src/lib/setup.ts`):
    - [x] Add `NEXT_PUBLIC_BRAND_NAME`
    - [x] Add `NEXT_PUBLIC_PRIMARY_SUBJECT`
    - [x] Add `NEXT_PUBLIC_PRIMARY_LOCATION`
    - [x] Add `NEXT_PUBLIC_LOGO_URL`, `NEXT_PUBLIC_FAVICON_URL`
    - [x] Add `NEXT_PUBLIC_CONTACT_PHONE`, `NEXT_PUBLIC_CONTACT_ADDRESS`
  - [x] **Refactor Branding Library** (`src/lib/branding.ts`):
    - [x] Update constants to use `process.env` with defaults
    - [x] Implement `getSubjectLabel()` helper
    - [x] Implement `getBrandTitle()` helper

## Phase 2: Communications & Invoices [backend][frontend]
- [x] **Email Customization** [backend]
  - [x] Implement Placeholder Engine (`src/lib/email/placeholders.ts`)
  - [x] Refactor `EmailService` to check `EmailTemplate` table first
- [x] **Invoice Customization** [backend][frontend]
  - [x] Refactor `src/lib/invoices/template.ts` (HTML) for dynamic branding
  - [x] Refactor `src/lib/invoices/pdf.ts` (PDF) for dynamic layout/colors
  - [x] Connect Invoice generators to `InvoiceTemplate` settings

## Phase 3: Content Management (CMS) [backend][frontend]
- [x] **Dynamic Content API** [backend]
  - [x] Create `GET /api/admin/content`
  - [x] Create `POST /api/admin/content`
  - [x] Implement `getContent(pagePath, sectionKey)` server utility
- [x] **Public Site Refactor** [frontend]
  - [x] Update `HomePage` (`src/app/page.tsx`) to use dynamic content
  - [x] Update `LessonsPage` (`src/app/lessons/page.tsx`) to use dynamic content
  - [x] Update all other public pages (Teacher, Contact, Vouchers, Terms)

## Phase 4: Admin Whitelabel Dashboard [frontend]
- [x] **Reorganize Admin Settings**
  - [x] Implement multi-tab layout in `/admin/settings`
- [x] **Editor Components**
  - [x] Build `AdminContentEditor.tsx` (CMS)
  - [x] Build `AdminEmailTemplateEditor.tsx` (Email)
  - [x] Build `AdminInvoiceTemplateEditor.tsx` (Invoices)
  - [x] Build `AdminProductManager.tsx` (Integrated with `AdminPresetsEditor.tsx`)

## Phase 5: Infrastructure & Finalization [devops][seo]
- [x] **SEO Modularization** [seo]
  - [x] Interpolate `seo-config.json` in `src/lib/seo.ts` (Refactored to use branding constants directly)
- [x] **DevOps Refactor** [devops]
  - [x] Parameterize `deploy/deploy.sh` with `APP_NAME`
  - [x] Update systemd service template
- [x] **Extended Script Parameterization** [devops]
  - [x] Parameterize `deploy/backup.sh`
  - [x] Parameterize `deploy/cron.sh`
  - [x] Parameterize `deploy/maintenance.sh`
  - [x] Parameterize `deploy/setup-packages.sh`
  - [x] Parameterize `deploy/setup-ssl.sh`
  - [x] Update `deploy/README.md` to be generic
  - [x] Update Nginx configs (`nginx.conf`, `nginx-http.conf`) to use placeholders/generic names
- [x] **Smart .env Merging** [devops]
  - [x] Update `deploy/deploy.sh` to merge missing keys from `.env.example` into `shared/.env`
- [x] **Clean Asset Handling** [frontend]
  - [x] Update all image components to use configured URLs

## Phase 6: Verification & Handover [test][docs]
- [x] **Automated Testing** [test]
  - [x] Create `tests/whitelabel-config.test.ts`
  - [x] Create `tests/email-placeholders.test.ts`
  - [x] Create `tests/cms-content.test.ts`
- [x] **Clean Setup Verification** [test]
- [x] **Documentation** [docs]
  - [x] Add Customization guide to `README.md`
