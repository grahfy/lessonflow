# Incremental Page Transitions Without Full Redraw Implementation Plan

## Overview
Replace full document navigation on the static marketing pages with scoped, in-page content swaps so only route-specific UI changes during transitions.

## Current State Analysis
- Route changes currently trigger hard navigation via `window.location.href`, causing full DOM reload and repaint (`assets/js/site.js:153`).
- Enter/exit animation is applied at the `body` level, so all persistent shell UI also animates out/in (`assets/js/site.js:151`, `assets/css/styles.css:49`).
- All root pages share a consistent shell container, navigation, content region (`main.view`), and footer structure (`index.html:14`, `lessons.html:14`, `teacher.html:14`, `vouchers.html:14`, `contact.html:14`, `terms.html:14`).
- Keyboard and swipe navigation already route through a centralized `navigate()` path (`assets/js/site.js:43`, `assets/js/site.js:72`, `assets/js/site.js:145`), which is the right integration point.

## Desired End State
- Switching between in-site pages keeps shared shell UI mounted (brand, nav chrome, overall shell container).
- Only route-specific regions are swapped:
  - `main.view` content
  - footer lead text (first footer line)
  - page metadata (`title`, `meta[name="description"]`, body page class)
- Transitions remain smooth and scoped to swap targets, not full-page redraw.
- Back/forward, arrow keys, swipe, and active-nav behavior remain correct.
- Failures gracefully fall back to hard navigation.

### Key Discoveries
- Hard reload trigger location: `assets/js/site.js:153`.
- Shared navigation interception path: `assets/js/site.js:23`.
- Shared route order used by keyboard/swipe: `assets/js/site.js:2`.
- Stable content swap boundary exists on every page: `index.html:31`, `lessons.html:31`, `teacher.html:31`, `vouchers.html:31`, `contact.html:31`, `terms.html:31`.
- Shared footer with page-specific lead line exists consistently: `index.html:62`, `lessons.html:71`, `teacher.html:62`, `vouchers.html:71`, `contact.html:62`, `terms.html:62`.

## What We're NOT Doing
- Rewriting to Next.js or introducing a framework router.
- Redesigning page layout, typography, color, or content structure.
- Removing current keyboard/swipe navigation affordances.
- Changing external link semantics (`mailto:`, `tel:`, absolute URLs).

## Design Options
1. Keep hard navigation and only adjust CSS transitions.
2. Move to hash-based single-page routing.
3. Progressive partial navigation using fetched HTML + scoped DOM replacement.

Selected approach: 3. It preserves the static-site model while eliminating full redraw behavior.

## Implementation Approach
- Add stable swap markers in each HTML page for route-varying regions.
- Refactor `navigate()` in `assets/js/site.js` to:
  - fetch target page HTML,
  - parse with `DOMParser`,
  - extract marked regions,
  - animate out current region,
  - swap only marked regions,
  - animate in updated region,
  - update history and active nav state.
- Add robust fallback path (`window.location.href`) on any partial-nav failure.
- Support `popstate` for back/forward consistency.

## Phase 1: Introduce Stable Swap Contracts

### Overview
Standardize markup anchors so JS can safely replace only route-varying sections.

### Changes Required
#### 1. Add Content Swap Markers
**File**: `index.html`
**File**: `lessons.html`
**File**: `teacher.html`
**File**: `vouchers.html`
**File**: `contact.html`
**File**: `terms.html`
**Changes**:
- Add stable attributes for primary content region and footer lead text (for example `data-swap="view"` and `data-swap="footer-lead"`).
- Ensure region structure remains identical across all pages for predictable extraction.

#### 2. Metadata Consistency
**File**: `index.html`
**File**: `lessons.html`
**File**: `teacher.html`
**File**: `vouchers.html`
**File**: `contact.html`
**File**: `terms.html`
**Changes**:
- Confirm one canonical description meta tag per page for deterministic updates.
- Keep page-specific body class (`page-*`) as route identity source.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`

#### Manual Verification
- [x] All route files include the same swap markers.
- [x] Existing visual output remains unchanged before JS refactor.

---

## Phase 2: Implement Partial Navigation Engine

### Overview
Replace hard navigation path with scoped DOM swap while preserving existing input methods.

### Changes Required
#### 1. Refactor Navigate Flow
**File**: `assets/js/site.js`
**Changes**:
- Replace `window.location.href` path in `navigate()` with `navigatePartial()` flow for internal pages.
- Keep existing early returns for modified-click and external links.
- Keep `leaving` lock semantics and convert to request-aware lock/reset behavior.

#### 2. Add Fetch/Parse/Swap Utilities
**File**: `assets/js/site.js`
**Changes**:
- Add utility to fetch target HTML (with optional small cache map).
- Parse target document with `DOMParser`.
- Extract and swap:
  - marked `main.view` region
  - marked footer lead line
  - `document.title`
  - `meta[name="description"]`
  - body page class (`page-*`)
- Re-run `fitToViewport()` after swap.

#### 3. Scoped Transition Classes
**File**: `assets/css/styles.css`
**Changes**:
- Introduce transition classes for swap targets (`.view` and footer lead) instead of full `body` transition for in-site route changes.
- Keep existing full-body transition as fallback path only.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`

#### Manual Verification
- [x] Header and nav shell remain visually persistent during route changes.
- [x] Only content region and page-specific footer line transition.
- [x] Arrow keys and swipe still navigate in the same route order.
- [x] No console errors during rapid nav clicks.

---

## Phase 3: History, Resilience, and Fallbacks

### Overview
Ensure browser navigation correctness and safe degradation.

### Changes Required
#### 1. History Integration
**File**: `assets/js/site.js`
**Changes**:
- Push route changes via `history.pushState`.
- Handle `window.popstate` to load previous/next page content through same partial-swap pipeline.
- Keep direct-load/deep-link behavior unchanged.

#### 2. Concurrency and Failure Handling
**File**: `assets/js/site.js`
**Changes**:
- Cancel or ignore stale in-flight requests for rapid interactions.
- Add timeout/error handling and immediate fallback to `window.location.href` if partial path fails.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`

#### Manual Verification
- [x] Browser Back/Forward updates content correctly without full redraw.
- [x] If fetch/parse fails, user is still navigated via hard reload.
- [x] Opening links with modifier keys/new tab still works.

---

## Phase 4: Verification and Test-Environment Sync

### Overview
Update verification docs and run full regression pass per repository guidelines.

### Changes Required
#### 1. Manual Test Documentation
**File**: `README.md`
**Changes**:
- Add explicit verification steps for partial transitions:
  - persistent shell behavior
  - scoped content swap
  - popstate behavior
  - fallback behavior on forced failure

#### 2. Regression Walkthrough
**File**: `assets/js/site.js`
**File**: `assets/css/styles.css`
**File**: `index.html`
**File**: `lessons.html`
**File**: `teacher.html`
**File**: `vouchers.html`
**File**: `contact.html`
**File**: `terms.html`
**Changes**:
- Validate no regressions in active-nav state, keyboard navigation, swipe, and contact CTA behavior.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`

#### Manual Verification
- [x] Every page loads and transitions with no console errors.
- [x] Shared shell is not visually redrawn on in-site route changes.
- [x] Mobile and desktop behavior remains responsive and consistent.
- [x] Updated README steps match implemented behavior.

---

## Testing Strategy
- Static checks: run `npm run lint`.
- Manual smoke run with `python3 -m http.server 4173` and full route traversal.
- Validate all navigation paths:
  - header link clicks
  - CTA link clicks
  - ArrowLeft/ArrowRight
  - swipe gestures
  - browser back/forward
- Validate fallback by simulating a failed fetch and confirming hard navigation still works.

## Performance Considerations
- Swap only minimal DOM regions instead of replacing full document.
- Reuse event delegation/listeners from initial page load where possible.
- Guard against overlapping transitions/request races.
- Optionally cache parsed responses for adjacent-route navigation speed.

## Migration Notes
- No URL changes and no route-file renames.
- Fully backward compatible: hard navigation remains fallback path.
- Rollout can be done in one PR because changes are localized to static pages, `site.js`, and CSS transition scoping.

## References
- Ticket: `thoughts/tickets/2026-02-19-incremental-page-transitions-no-full-redraw.md`
- Research: `thoughts/research/2026-02-19-incremental-page-transitions-no-full-redraw-research.md`
- Navigation source: `assets/js/site.js`
- Transition styles: `assets/css/styles.css`
