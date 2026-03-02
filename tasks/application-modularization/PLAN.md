# Implementation Plan: LessonFlow Modularization & Whitelabeling

Transform LessonFlow into a generic, whitelabel-ready music school management platform by decoupling it from "Melbourne Guitar School" and guitar-specific terminology.

## Phase 0: Deep Audit & Hardcoded Element Identification
**Goal:** Map all school-specific references to dynamic sources.

1.  **Grep Audit**: Search for "Melbourne Guitar School", "MGS", "Guitar", "Jon King", "Northcote", and specific contact info (phone/address).
2.  **Asset Audit**: Identify all hardcoded images in `public/images/` and CSS-based backgrounds in `globals.css`.
3.  **Product Audit**: Identify hardcoded lesson packages (e.g., "digital_guitar_lessons") in invoice logic and types.
4.  **Mapping Document**: Create a temporary mapping of identified elements to their new sources (Env Var vs. DB).

## Phase 1: Core Configuration & Branding Layer
**Goal:** Establish the foundational settings for the platform.

1.  **Prisma Schema Update**:
    - Add `PublicPageContent` model for CMS data (titles, leads, hero images).
    - Add `EmailTemplate` model for customizable subject/body.
    - Add `InvoiceTemplate` model for layout and brand customization.
    - Run `npx prisma migrate dev --name modular_content_models`.
2.  **Setup Wizard Expansion (`src/lib/setup.ts`)**:
    - Add `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_PRIMARY_SUBJECT`, `NEXT_PUBLIC_PRIMARY_LOCATION`.
    - Add `NEXT_PUBLIC_LOGO_URL`, `NEXT_PUBLIC_FAVICON_URL`.
    - Add `NEXT_PUBLIC_CONTACT_PHONE`, `NEXT_PUBLIC_CONTACT_ADDRESS`.
3.  **Refactor `src/lib/branding.ts`**:
    - Use `process.env` values with existing school details as defaults.
    - Export helpers for dynamic strings (e.g., `getSubjectLabel()`).

## Phase 2: Communication & Financial Customization
**Goal:** Modularize emails and invoices.

1.  **Placeholder Engine**: Implement a utility in `src/lib/email/placeholders.ts` to replace `{{customerName}}`, `{{invoiceNumber}}`, `{{lessonTime}}`, etc.
2.  **Refactor Email Service**:
    - Modify `sendEmail` to try fetching from the `EmailTemplate` table first.
    - Implement fallback logic to hardcoded templates in `templates.ts`.
3.  **Invoice Template Refactor**:
    - Update `src/lib/invoices/template.ts` (HTML) and `pdf.ts` (PDF) to use dynamic headers, footers, and brand colors.
    - Fetch layout options from the `InvoiceTemplate` table.

## Phase 3: Public Content Management (CMS)
**Goal:** Enable live frontend editing.

1.  **Admin Content API**: Create routes to GET and POST page section data.
2.  **Dynamic Content Utility**: Create a server-side helper `getContent(pagePath, sectionKey)` to resolve DB content with hardcoded defaults.
3.  **Page Refactor**:
    - Update `src/app/page.tsx` (Home), `lessons/page.tsx`, etc., to use the dynamic content utility.
    - Replace hardcoded subject and location strings with variables from `branding.ts`.

## Phase 4: Admin UI Refactor (Whitelabel Dashboard)
**Goal:** Centralize all customization options.

1.  **Reorganize `/admin/settings`**: Implement a multi-tab interface:
    - **Branding**: Identity, Logos, and Contact details.
    - **Frontend Pages**: Section-by-section CMS editor.
    - **Emails**: Template and signature editor.
    - **Invoices**: PDF/HTML layout and style customization.
    - **Products**: Manage school-specific lesson packages and fees.
2.  **Editor Components**:
    - `AdminContentEditor.tsx`: Form-based editor for page text/images.
    - `AdminEmailTemplateEditor.tsx`: Template editor with placeholder legends.
    - `AdminInvoiceTemplateEditor.tsx`: Layout and theme picker.

## Phase 5: SEO, DevOps & Infrastructure
**Goal:** Finalize the whitelabeling for deployment.

1.  **SEO Config Interpolation**: Update `src/lib/seo.ts` to replace placeholders in `seo-config.json` at runtime.
2.  **Parameterize Deployment**: Update `deploy/deploy.sh` and systemd files to use an `APP_NAME` variable.
3.  **Generic Asset Handling**: Update all `<img>` and `Image` tags to prefer configured URLs over hardcoded paths.

## Verification & Completion
1.  **Run Tests**: Ensure `npm test` passes and no regressions in financial logic.
2.  **Setup Check**: Perform a clean setup via `/setup` with a "Piano School" configuration.
3.  **Documentation**: Update `README.md` with instructions for new customization features.
