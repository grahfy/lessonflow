# Global Sequenced UI Tween Animations Implementation Plan

## Overview
Implement fast, sequential tween-based UI entry/exit animations across all active Next.js pages so visible elements animate one-after-another on load, navigation, and dialog transitions, while preserving accessibility and performance.

## Current State Analysis
- Global layout currently renders children directly in `<body>` with no shared client-side motion controller (`src/app/layout.tsx:11`).
- Public pages are mostly composed via shared shells (`SiteShell` and `PanelLayout`), which provides a strong central insertion point for cross-page animation instrumentation (`src/components/site-shell.tsx:13`, `src/components/panel-layout.tsx:30`).
- Motion is currently CSS-only and partial (buttons hover, notices, calendar events, dialogs); there is no global sequential tween orchestrator (`src/styles/globals.css:186`, `src/styles/globals.css:406`, `src/styles/globals.css:534`, `src/styles/globals.css:590`).
- Forms and notice blocks are repeated in reusable client components, making them suitable for standardized stagger targeting (`src/components/contact-form.tsx:50`, `src/components/booking-form.tsx:68`, `src/components/admin-login-form.tsx:37`).
- Admin booking UI renders dense dynamic trees (calendar events + layered dialogs) and needs targeted sequencing to avoid over-animating every node (`src/components/admin-bookings-client.tsx:480`, `src/components/admin-bookings-client.tsx:633`, `src/components/admin-booking-calendar.tsx:80`).

## Desired End State
- All active Next.js route surfaces (`/`, `/lessons`, `/teacher`, `/vouchers`, `/contact`, `/book`, `/terms`, `/admin/login`, `/admin/bookings`) use a shared tween orchestration model.
- Visible UI atoms (headings, paragraphs, list items, cards, fields, controls, notices, calendar events, dialog sections) animate in sequence with short, consistent tween timings.
- Route transitions include both:
  - quick staggered exit for the outgoing page container,
  - quick staggered entry for the incoming page container.
- Dialog and nested dialog transitions in admin also follow the same in/out sequencing pattern.
- Reduced-motion users receive instant/non-animated behavior.
- No regressions to navigation, form submission, admin mutations, or layout responsiveness.

### Key Discoveries
- Shared public shell composition is centralized and reusable (`src/components/site-shell.tsx:17`, `src/components/panel-layout.tsx:31`).
- Route nav currently relies on standard `Link` rendering with no exit interception (`src/components/site-shell.tsx:28`).
- Existing motion variables are available and can be extended for tween token parity (`src/styles/globals.css:18`).
- Admin overlay architecture already separates backdrop and panel layers, ideal for staged tween timelines (`src/components/admin-bookings-client.tsx:634`, `src/components/admin-bookings-client.tsx:799`).
- Reduced-motion baseline exists globally and should remain the safety fallback (`src/styles/globals.css:795`).

## What We're NOT Doing
- Animating legacy root HTML files (`index.html`, `lessons.html`, etc.) that are marked as migration reference surfaces (`README.md:99`).
- Redesigning page structure/content or changing booking/admin business logic.
- Replacing current CSS theme system with a full animation framework rewrite.
- Adding heavy timeline choreography to decorative background layers.

## Design Options
1. CSS-only stagger classes with keyframes and delay variables.
Pros: no JS dependency, simpler rollout.
Cons: weak runtime control for exit-before-navigation and dialog lifecycle sequencing.

2. React-first animation library (for example Framer Motion) at component boundaries.
Pros: ergonomic for React tree transitions.
Cons: broad refactor footprint and less direct tween-timeline control for mixed static/dynamic DOM.

3. GSAP tween orchestration with lightweight DOM-targeting conventions.
Pros: explicit tween timelines, strong stagger control, straightforward in/out choreography for page and modal containers.
Cons: requires disciplined selector scoping to avoid over-animation.

Selected approach: Option 3 (GSAP-based tween orchestration).

## Implementation Approach
- Introduce a shared motion orchestrator (client component + utility hook) that drives staggered `fromTo`/`to` tweens for scoped containers.
- Standardize motion targeting via `data-motion-root` and `data-motion-item` conventions, with fallback selector sets for existing semantic elements.
- Add a transition-aware link wrapper for internal route navigation so exit tween completes before router push.
- Reuse the same tween primitives for admin dialog open/close layers and form/notice insertions.
- Enforce reduced-motion and performance safeguards (skip animation for large node counts, avoid layout thrash, clean up timelines on unmount).

## Resolved Risk Closures
- Transition lifecycle closure:
  - Introduce a shared transition state contract (`idle` -> `entering` -> `idle`, `idle` -> `exiting` -> `navigating` -> `entering`).
  - Use two-phase mount for overlays/routes where exit motion is required (`isMounted` and `isVisible` flags).
  - Add watchdog timeout fallback (`~280ms`) so route/dialog actions complete even if timelines are interrupted.
- Calendar-density performance closure:
  - Cap animated nodes per sequence (for example `MAX_STAGGER_ITEMS_PUBLIC=36`, `MAX_STAGGER_ITEMS_ADMIN=24`).
  - Cap month-view event animation per day cell (for example first 6 events tweened, overflow instant).
  - Use transform/opacity-only tweens and skip restagger on data refresh when container size exceeds cap.
- Lifecycle coordination closure:
  - Centralize timeline registration and cancellation in orchestrator; always kill previous timelines before starting new transitions.
  - Block duplicate navigation while `exiting` is active; queue/ignore additional clicks until transition state returns to `idle`.

## Phase 1: Motion Foundation and Contracts

### Overview
Add the shared tween dependency and define motion contracts/tokens used across the app.

### Changes Required
#### 1. Tween Dependency
**File**: `package.json`
**Changes**: Add `gsap` dependency for tween timeline orchestration.

#### 2. Motion Tokens and Utility Classes
**File**: `src/styles/globals.css`
**Changes**:
- Add global motion tokens (enter/exit duration, stagger gap, distance, opacity baseline).
- Add optional utility classes/attributes for motion scope and opt-out.
- Preserve and extend reduced-motion behavior.

#### 3. Shared Orchestrator
**File**: `src/components/motion/tween-orchestrator.tsx` (new)
**Changes**:
- Add client-side orchestration utilities (`animateIn`, `animateOut`, cleanup helpers).
- Centralize default selectors and sequencing strategy.
- Implement transition state machine, timeline registry, and watchdog timeout fallback.

#### 4. Root Integration
**File**: `src/app/layout.tsx`
**Changes**:
- Wrap app children with client motion provider entrypoint.

#### 5. Presence Helpers
**File**: `src/components/motion/use-presence-exit.ts` (new)
**Changes**:
- Add reusable two-phase mount/unmount helper for exit-before-unmount behavior.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`

#### Manual Verification
- [x] Motion provider initializes without console errors.
- [x] No behavior changes when animations are disabled (reduced-motion mode).

---

## Phase 2: Public Route Container Sequencing

### Overview
Enable sequential in/out tweens for public route surfaces using shared shell-level instrumentation.

### Changes Required
#### 1. Motion Scopes in Shell Components
**File**: `src/components/site-shell.tsx`
**Changes**: Add route-level motion root and logical child group markers for header/main/footer sequencing.

**File**: `src/components/panel-layout.tsx`
**Changes**: Add stable motion item markers around kicker/title/lead/actions/content/secondary/visual clusters.

#### 2. Transition-Aware Internal Link Wrapper
**File**: `src/components/motion/tween-link.tsx` (new)
**Changes**:
- Wrap internal route navigation and trigger scoped exit tween before navigation.
- Preserve modifier-click/new-tab/default browser behaviors.
- Lock duplicate route transitions while exit is in progress and release via completion/timeout.

#### 3. Public Page Link Migration
**File**: `src/components/site-shell.tsx`
**File**: `src/app/page.tsx`
**File**: `src/app/lessons/page.tsx`
**File**: `src/app/teacher/page.tsx`
**File**: `src/app/vouchers/page.tsx`
**File**: `src/app/terms/page.tsx`
**Changes**: Replace relevant `Link` usage with motion-aware link wrapper where route exits should be animated.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`

#### Manual Verification
- [x] On public page load, visible UI elements enter quickly in sequence.
- [x] On internal link navigation, outgoing page performs quick sequential exit before route swap.
- [x] Header/nav active state and routing correctness remain intact.

---

## Phase 3: Form and Notice Sequencing

### Overview
Apply consistent stagger behavior to form-heavy routes and notice feedback blocks.

### Changes Required
#### 1. Contact/Booking/Admin Login Forms
**File**: `src/components/contact-form.tsx`
**File**: `src/components/booking-form.tsx`
**File**: `src/components/admin-login-form.tsx`
**Changes**:
- Mark form rows/fields/buttons/notice blocks as motion items.
- Trigger compact stagger on initial render and success/error notice transitions.

#### 2. Contact/Book/Admin Login Page Surfaces
**File**: `src/app/contact/page.tsx`
**File**: `src/app/book/page.tsx`
**File**: `src/app/admin/login/page.tsx`
**Changes**: Ensure consistent motion roots for these routes.

#### 3. Notice Lifecycle Hooks
**File**: `src/components/motion/use-notice-tween.ts` (new)
**Changes**: Provide helper for short in/out tweens on transient notices.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`

#### Manual Verification
- [ ] Form fields animate in sequence on page entry.
- [ ] Success/error notices animate in and out cleanly without layout jumps.
- [ ] Form submission and validation behavior remains unchanged.

---

## Phase 4: Admin Calendar and Dialog Motion

### Overview
Roll staggered tween behavior into dense admin interfaces with scoped and performance-aware sequencing.

### Changes Required
#### 1. Admin Dashboard Root and Panels
**File**: `src/components/admin-bookings-client.tsx`
**Changes**:
- Add motion roots for dashboard shell cards and panel sections.
- Apply stagger sequencing on data refresh transitions where safe.

#### 2. Calendar Event Entry/Exit Tweens
**File**: `src/components/admin-booking-calendar.tsx`
**Changes**:
- Add motion item markers for event chips/day cells.
- Sequence event animations per day/list container rather than global page-wide animation.
- Apply month/day sequence caps to prevent frame drops in dense ranges.

#### 3. Dialog + Nested Email Dialog Sequencing
**File**: `src/components/admin-bookings-client.tsx`
**File**: `src/styles/globals.css`
**Changes**:
- Replace isolated keyframe-only behavior with shared tween lifecycle hooks for backdrop/panel/content.
- Ensure close actions run exit tween before unmount.
- Implement two-phase dialog visibility state so unmount happens after exit or timeout fallback.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`

#### Manual Verification
- [x] Admin cards, calendar events, and dialog content animate in sequence.
- [x] Dialog close actions animate out without blocking interactions.
- [x] No regressions in admin actions (edit/move/cancel/approve/reject/notify/logout).

---

## Phase 5: Accessibility, Performance, and Safety Guardrails

### Overview
Harden motion behavior to remain safe under reduced motion, high element counts, and frequent re-renders.

### Changes Required
#### 1. Reduced Motion and Immediate Mode
**File**: `src/components/motion/tween-orchestrator.tsx`
**File**: `src/styles/globals.css`
**Changes**:
- Read `prefers-reduced-motion` and short-circuit tweens.
- Provide explicit no-motion class/data override for sensitive surfaces.

#### 2. Node Count and Scope Caps
**File**: `src/components/motion/tween-orchestrator.tsx`
**Changes**:
- Limit max animated items per sequence.
- Ignore hidden/offscreen/inert elements by default selector filtering.
- Enforce explicit public/admin/calendar cap constants and fallback to immediate rendering above threshold.

#### 3. Cleanup/Concurrency Controls
**File**: `src/components/motion/tween-orchestrator.tsx`
**File**: `src/components/motion/tween-link.tsx`
**Changes**:
- Kill prior timelines before starting new ones.
- Prevent double-navigation and stale timeline leaks.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test`

#### Manual Verification
- [x] Reduced-motion mode shows no disruptive animation.
- [x] Mobile and desktop remain responsive during rapid navigation.
- [x] No console warnings/errors from timeline lifecycle issues.

---

## Phase 6: Verification and Documentation Sync

### Overview
Close the feature with explicit test-environment and verification documentation updates.

### Changes Required
#### 1. Manual QA Checklist Update
**File**: `README.md`
**Changes**:
- Add motion verification steps for public/admin routes.
- Add reduced-motion validation step.

#### 2. Optional Frontend Motion Test Coverage
**File**: `tests/ui-motion-orchestrator.test.ts` (new)
**Changes**:
- Add unit coverage for selector filtering/order and reduced-motion fallback behavior.

### Success Criteria
#### Automated Verification
- [x] `npm run test`
- [x] `npm run lint && npm run typecheck && npm run build`

#### Manual Verification
- [x] Sequential in/out tween behavior validated on all active routes.
- [x] Navigation, forms, admin workflows, and dialogs function exactly as before.
- [x] Test environment docs reflect updated motion verification process.

---

## Testing Strategy
- Static checks: `npm run lint`, `npm run typecheck`, `npm run build`.
- Regression checks: `npm run test` with focus on form/admin flows.
- Motion-specific unit tests for orchestrator fallback and selector ordering.
- Manual route walkthrough across all public/admin pages for enter/exit sequencing.
- Accessibility check with OS/browser reduced-motion enabled.

## Performance Considerations
- Animate scoped containers, not the entire DOM tree.
- Cap animated-node count per sequence to avoid frame drops in admin calendar states.
- Use transforms/opacity-only tweens for compositing-friendly animation.
- Clean up timelines on dependency changes/unmount to prevent memory churn.

## Migration Notes
- Legacy static HTML pages remain unchanged and out of runtime scope.
- Roll out in phases, validating public routes first, then admin-heavy surfaces.
- Keep existing CSS animation fallbacks during migration; remove duplicate paths after parity.

## References
- Ticket: `thoughts/tickets/2026-02-19-global-sequenced-ui-tween-animations.md`
- Shared layout root: `src/app/layout.tsx:11`
- Public shell: `src/components/site-shell.tsx:13`
- Shared panel layout: `src/components/panel-layout.tsx:17`
- Existing global motion rules: `src/styles/globals.css:18`
- Existing notice animation: `src/styles/globals.css:406`
- Existing calendar/dialog animation: `src/styles/globals.css:534`
- Admin dashboard render surface: `src/components/admin-bookings-client.tsx:480`
- Calendar event rendering: `src/components/admin-booking-calendar.tsx:80`
- Form-heavy components: `src/components/contact-form.tsx:50`, `src/components/booking-form.tsx:68`, `src/components/admin-login-form.tsx:37`

## Deviations from Plan

### Phase 4: Admin Calendar and Dialog Motion
- **Original Plan**: Keep CSS keyframe fallbacks during migration and remove duplicate animation paths later.
- **Actual Implementation**: Removed overlapping CSS keyframe entry animations for notices, calendar events, and dialogs in the same rollout.
- **Reason for Deviation**: Prevented double-entry motion and lifecycle conflicts once GSAP-based in/out orchestration became the primary path.
- **Impact Assessment**: Low risk; reduced-motion immediate mode remains intact and build/test checks passed.
- **Date/Time**: 2026-02-19
