---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [public, ui, ux, typography, forms, captcha]
keywords: [replace site font with overpass, home buttons justified, lessons voucher teacher videos buttons justified, contact map button centered, terms ellipsis removal, captcha input new image inline]
patterns: [src/styles/globals.css, src/app/layout.tsx, src/app/page.tsx, src/app/lessons/page.tsx, src/app/vouchers/page.tsx, src/app/teacher/page.tsx, src/app/videos/page.tsx, src/app/contact/page.tsx, src/app/terms/page.tsx, src/components/captcha.tsx, src/components/image-modal.tsx, src/components/booking-form.tsx, src/components/contact-form.tsx, src/components/student-login-form.tsx, src/components/admin-login-form.tsx]
---

# FEAT: Global Overpass Font Migration and Public Page Alignment Polish

## Description

Migrate the website typography to Google Font Overpass and fix public-page alignment issues for buttons/cards, contact map CTA presentation, terms page copy cleanup, and CAPTCHA control layout.

## Context

Public routes currently rely on Sora/Space Grotesk and mixed CTA alignment behaviors. CAPTCHA components render input and refresh button on separate rows, reducing efficiency.

## Requirements

### Functional Requirements
- Replace primary UI font stack with Google Font `Overpass` across public, student-login, and admin-login entry surfaces.
- Home page:
  - make the three primary action buttons visually justified/aligned.
  - make the three metric/info boxes visually justified/aligned (adjust width constraints if required).
- Lessons, vouchers, teacher, and videos pages:
  - make each bottom two-button row justified with consistent widths.
- Contact page:
  - center the Google Maps location button.
  - remove the visible surrounding list-style box treatment around that map trigger.
- Terms page:
  - remove literal placeholder text `...` from rendered content.
  - justify the bottom two CTA buttons if needed.
- CAPTCHA field everywhere it appears:
  - render answer input and `New image` button on one horizontal row on desktop.
  - preserve accessible stacking on narrow mobile widths.

### Non-Functional Requirements
- Keep WCAG-friendly contrast after font and layout changes.
- Avoid layout shifts that break existing responsive breakpoints.
- Preserve existing form validation and CAPTCHA behavior.

## Current State

- `src/styles/globals.css` imports Sora and Space Grotesk.
- Public page CTA groups use mixed wrappers and uneven width behavior.
- Terms page includes a literal `...` placeholder line.
- `CaptchaField` renders input then button in block flow.

## Desired State

Unified Overpass typography, consistent CTA alignment across requested public pages, cleaned terms copy, refined contact map CTA presentation, and inline CAPTCHA controls for faster interaction.

## Research Context

### Keywords to Search
- `@import fonts.googleapis.com` - update font import definitions.
- `.home-actions`, `.button-row`, `.metrics` - normalize equal-width alignment.
- `map-button` and `ImageModal` trigger styles - center and remove boxed wrapper styling.
- `terms-list` ellipsis content source - remove placeholder content path.
- `CaptchaField` layout classes - inline input/button treatment.

### Patterns to Investigate
- `src/styles/globals.css`
- `src/app/page.tsx`
- `src/app/lessons/page.tsx`
- `src/app/vouchers/page.tsx`
- `src/app/teacher/page.tsx`
- `src/app/videos/page.tsx`
- `src/app/contact/page.tsx`
- `src/app/terms/page.tsx`
- `src/components/captcha.tsx`

### Key Decisions Made
- Overpass becomes the default body/interface font; specialty monospace stacks remain unchanged.
- CTA justification means equal visual weight and aligned edges, not forced identical text lengths.
- CAPTCHA inline layout must gracefully stack at mobile breakpoints.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

### Manual Verification
- [ ] Public pages render with Overpass typography.
- [ ] Home action buttons and three metric boxes are aligned/justified.
- [ ] Lessons/vouchers/teacher/videos bottom CTA pairs are justified and balanced.
- [ ] Contact map button is centered with no surrounding list box artifact.
- [ ] Terms page has no visible `...` placeholder text and CTA row is justified.
- [ ] CAPTCHA input + `New image` button appear side-by-side on desktop and remain usable on mobile.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`

## Notes

- Validate both dark/light gradient contexts so new font rendering remains readable.
