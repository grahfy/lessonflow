# Melbourne Guitar School Modern Website Implementation Plan

## Overview
Build a modern, high-conversion, easy-to-edit website for Melbourne Guitar School by replacing the current Wix-based site with a code-first site and CMS-backed content model. The new site will preserve existing business content and offers while introducing a stronger visual identity, better structure, smoother animations, and maintainable editing workflows.

## Current State Analysis
- Repository is currently empty and has no existing web app scaffold, component system, or build pipeline.
- Current production site is Wix-hosted with key pages:
  - Home: `https://www.melbourneguitarschool.com.au/`
  - Gift Vouchers: `https://www.melbourneguitarschool.com.au/new-gift-vouchers`
  - Terms/Cancellation: `https://www.melbourneguitarschool.com.au/cancellation-policy`
  - Sitemap index/pages: `https://www.melbourneguitarschool.com.au/sitemap.xml`, `https://www.melbourneguitarschool.com.au/pages-sitemap.xml`
- Content currently exists as long-form sections on a single-page style home route plus separate policy/voucher pages.
- Contact pathways currently include phone, email, and form submission; this should be preserved.

## Desired End State
- A production-ready site with:
  - Strong modern visual direction (dark blue + dark purple system with high-contrast readable text colors).
  - Reusable section-based page architecture.
  - CMS-managed copy and key media so updates do not require code edits.
  - Motion system for hero, section reveals, and interaction states.
  - SEO-ready metadata, schema, and fast page loads.
  - Mobile-first responsiveness and accessibility compliance.

### Key Discoveries
- Existing USP/offer language includes introductory discount messaging and package offers from the home page: `https://www.melbourneguitarschool.com.au/`
- Core service framing is by lesson level (Beginner, Intermediate, Advanced): `https://www.melbourneguitarschool.com.au/`
- Teacher credibility content is central (30+ years, touring, endorsements): `https://www.melbourneguitarschool.com.au/`
- Social proof (multiple testimonials) is a key conversion section: `https://www.melbourneguitarschool.com.au/`
- Pricing structure includes 30 min and 1 hour lesson packages: `https://www.melbourneguitarschool.com.au/`
- Gift voucher funnel has dedicated conversion copy and terms linkage: `https://www.melbourneguitarschool.com.au/new-gift-vouchers`
- Cancellation, refund, and voucher expiry terms are explicit and must be preserved: `https://www.melbourneguitarschool.com.au/cancellation-policy`

## What We're NOT Doing
- Building custom online payments/checkout in v1 (keep current external/simple booking/payment path).
- Building a student portal, LMS, or authentication system.
- Rewriting business policy content beyond clarity/formatting improvements.
- Producing long-form blog architecture unless requested later.

## Implementation Approach
Use `Next.js` + `TypeScript` + `Tailwind CSS` for the frontend and `Sanity CMS` for editing. This gives:
- Strong DX and maintainability for future enhancements.
- Non-technical editing via Sanity Studio.
- Structured content schemas for sections, offers, testimonials, and policies.
- Good support for animation (Framer Motion) and SEO.

## Phase 1: Foundation and Design Tokens

### Overview
Bootstrap project, set up tooling, and define the visual system so all later UI work stays consistent.

### Changes Required

#### 1. App Scaffold and Tooling
**File**: `package.json`  
**Changes**: Initialize Next.js TypeScript app, lint/format/test scripts, CI-ready commands.

#### 2. Global Theme and Token System
**File**: `src/styles/globals.css`  
**Changes**: Define color variables (dark blue/purple core, accent and neutral ramps), type scale, spacing, radii, shadows, gradient presets.

#### 3. Base Layout and Shell
**File**: `src/app/layout.tsx`  
**Changes**: Add metadata defaults, global background treatment, typography setup, and shared shell wrappers.

### Success Criteria

#### Automated Verification
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`

#### Manual Verification
- [ ] Site renders on desktop and mobile with baseline theme active.
- [ ] Color contrast is readable on primary text surfaces.

---

## Phase 2: CMS and Content Modeling

### Overview
Create an editing workflow that makes routine updates easy without touching code.

### Changes Required

#### 1. Sanity Studio Setup
**File**: `sanity.config.ts`  
**Changes**: Configure datasets, structure, and desk navigation for site sections.

#### 2. Content Schemas
**File**: `sanity/schemas/index.ts`  
**Changes**: Define schemas for hero, offers, lesson levels, teacher profile, testimonials, pricing packages, contact block, policy page, gift voucher page.

#### 3. Data Access Layer
**File**: `src/lib/cms.ts`  
**Changes**: Implement GROQ queries and typed mappers for frontend use.

#### 4. Seed/Migration Content
**File**: `scripts/seed-content.ts`  
**Changes**: Seed initial content from current live site copy and business details.

### Success Criteria

#### Automated Verification
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`

#### Manual Verification
- [ ] Non-dev user can edit hero text, pricing, and testimonials in CMS.
- [ ] Updated CMS values appear on the frontend after publish.

---

## Phase 3: Page Build and Section Components

### Overview
Implement complete page structure and migrate core messaging into reusable, composable sections.

### Changes Required

#### 1. Home Page Composition
**File**: `src/app/page.tsx`  
**Changes**: Compose hero, intro copy, lesson levels, teacher section, testimonials, pricing, CTA, contact blocks using CMS data.

#### 2. Gift Voucher Page
**File**: `src/app/gift-vouchers/page.tsx`  
**Changes**: Build dedicated conversion page with package highlights, process steps, and contact CTA.

#### 3. Terms and Policies Page
**File**: `src/app/terms/page.tsx`  
**Changes**: Implement clear structured cancellation/refund/voucher terms rendering from CMS content.

#### 4. Reusable Component Library
**File**: `src/components/sections/*.tsx`  
**Changes**: Create reusable section components so edits and layout changes are low-cost.

### Success Criteria

#### Automated Verification
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`

#### Manual Verification
- [ ] All core content from current site exists in the new IA.
- [ ] Navigation is clear and functional across desktop/mobile.
- [ ] Contact methods (phone/email/form) are clearly visible.

---

## Phase 4: Motion, Visual Polish, and Responsiveness

### Overview
Add intentional animation and visual atmosphere while preserving performance and clarity.

### Changes Required

#### 1. Motion System
**File**: `src/lib/motion.ts`  
**Changes**: Define reusable animation presets (hero intro, staggered reveal, section transition, CTA emphasis).

#### 2. Visual Enhancements
**File**: `src/components/visuals/*.tsx`  
**Changes**: Add gradient/mesh backgrounds, subtle texture overlays, decorative light effects, and interactive hover states.

#### 3. Responsive Tuning
**File**: `src/styles/globals.css`  
**Changes**: Finalize breakpoints, spacing compression, typography scaling, and touch targets for mobile.

### Success Criteria

#### Automated Verification
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`

#### Manual Verification
- [ ] Key animations run smoothly on modern devices.
- [ ] Motion does not block readability or primary CTAs.
- [ ] Layout remains polished across common viewport sizes.

---

## Phase 5: SEO, Forms, Launch Readiness, and Handover

### Overview
Finalize production concerns and deliver an editor-friendly operational handoff.

### Changes Required

#### 1. SEO and Structured Data
**File**: `src/app/layout.tsx`  
**Changes**: Add Open Graph/Twitter tags and `LocalBusiness` schema with current contact/location details.

#### 2. Form Handling
**File**: `src/app/api/contact/route.ts`  
**Changes**: Implement secure contact form submission endpoint (validation + anti-spam strategy).

#### 3. Redirects and URL Parity
**File**: `next.config.js`  
**Changes**: Add redirects from legacy Wix paths where required (`/new-gift-vouchers`, `/cancellation-policy`).

#### 4. Editor and Deployment Docs
**File**: `README.md`  
**Changes**: Add clear editing, preview, publish, and deployment instructions.

### Success Criteria

#### Automated Verification
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`

#### Manual Verification
- [ ] Metadata appears correctly in social preview validators.
- [ ] Contact form sends and handles errors gracefully.
- [ ] Client can update key content without code changes.

---

## Testing Strategy
- Unit tests for content mapping and utility functions.
- Component tests for core section rendering states (with and without optional CMS fields).
- E2E smoke tests for navigation, CTA flow, and form submission.
- Accessibility checks (keyboard navigation, labels, contrast).
- Lighthouse performance and SEO checks before launch.

## Performance Considerations
- Use optimized image delivery and lazy loading for below-the-fold media.
- Use animation transforms/opacity only; avoid layout-thrashing transitions.
- Keep third-party scripts minimal and defer non-critical scripts.
- Prefer server-rendered content for SEO-critical sections.

## Migration Notes
- Extract final approved copy from existing Wix pages and place into CMS seed entries.
- Preserve current phone, email, and address details:
  - `0401 489 437`
  - `melbourneguitarschool@gmail.com`
  - `Rear 66/68 High St, Northcote VIC 3070`
- Validate policy wording with owner before launch to avoid accidental legal wording changes.

## References
- Ticket: `thoughts/tickets/2026-02-19-lessonflow-modern-site.md`
- Live content source: `https://www.melbourneguitarschool.com.au/`
- Live content source: `https://www.melbourneguitarschool.com.au/new-gift-vouchers`
- Live content source: `https://www.melbourneguitarschool.com.au/cancellation-policy`
- Sitemap: `https://www.melbourneguitarschool.com.au/pages-sitemap.xml`
