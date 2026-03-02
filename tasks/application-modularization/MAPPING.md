# Modularization Mapping Document

| Element | Current Value | Target Source |
| :--- | :--- | :--- |
| School Name | Melbourne Guitar School | `NEXT_PUBLIC_BRAND_NAME` (Env) |
| Primary Subject | Guitar | `NEXT_PUBLIC_PRIMARY_SUBJECT` (Env) |
| Location | Northcote | `NEXT_PUBLIC_PRIMARY_LOCATION` (Env) |
| Phone | 0401 489 437 | `NEXT_PUBLIC_CONTACT_PHONE` (Env) |
| Address | Rear 66/68 High St... | `NEXT_PUBLIC_CONTACT_ADDRESS` (Env) |
| Header Logo | `/images/mgs-logo.webp` | `NEXT_PUBLIC_LOGO_URL` (Env) |
| Invoice Logo | `/images/company-logo-invoice.webp` | `NEXT_PUBLIC_INVOICE_LOGO_URL` (Env) |
| Favicon | `/src/app/icon.png` | `NEXT_PUBLIC_FAVICON_URL` (Env) |
| Page Hero Images | Hardcoded in CSS/data | `PublicPageContent` (DB) |
| Page Text Content | Hardcoded in components | `PublicPageContent` (DB) |
| Email Templates | Hardcoded in `templates.ts` | `EmailTemplate` (DB) |
| Invoice Layout | Hardcoded in `template.ts` | `InvoiceTemplate` (DB) |
| Lesson Products | Hardcoded kinds | `InvoiceProductPreset` (DB) |
| Currency | AUD | `NEXT_PUBLIC_DEFAULT_CURRENCY` (Env) |
