# 2026-02-19 Incremental Page Transitions (No Full Redraw) Research

## Objective
Determine why page switches redraw the entire interface and identify a safe path to preserve shared UI while only changing route-specific content.

## Current Implementation Findings
- Navigation interception currently ends in a hard document navigation:
  - `assets/js/site.js:153` sets `window.location.href = href` after a timeout.
- The transition animation is body-wide, so enter/exit applies to the whole document:
  - `assets/js/site.js:151` adds `body.is-leaving`.
  - `assets/css/styles.css:49` defines full-body exit state.
- Link handling and gesture navigation are centralized and already route-aware:
  - `assets/js/site.js:23` intercepts `a[data-nav]` clicks.
  - `assets/js/site.js:38` handles ArrowLeft/ArrowRight.
  - `assets/js/site.js:63` handles swipe end and calls `jump()`.
- Static pages share a near-identical shell structure (`transition-curtain`, header, nav, `main.view`, footer), which provides stable swap boundaries:
  - `index.html:14`, `lessons.html:14`, `teacher.html:14`, `vouchers.html:14`, `contact.html:14`, `terms.html:14`.
- Route-specific content currently lives inside `main.view`, plus page metadata and a footer lead line:
  - `index.html:31`, `lessons.html:31`, `teacher.html:31`, `vouchers.html:31`, `contact.html:31`, `terms.html:31`.
  - Footer first line differs per page at `index.html:63` and equivalents in each route file.

## Problem Statement
Because navigation is implemented as full document navigation, browser parsing/reflow/paint restarts for each route. This makes transitions feel like a complete redraw even when most UI is unchanged.

## Options Considered
1. Keep hard navigation and only tune CSS timing.
   - Low effort, but still redraws everything.
2. Convert to hash routing with one HTML file.
   - Avoids redraws, but requires larger content architecture changes.
3. Progressive partial navigation (fetch + parse target HTML + swap scoped regions).
   - Preserves static-file model while reusing existing markup; cleanest fit for current codebase.

## Recommended Direction
Use progressive partial navigation:
- Intercept in-site navigation as today.
- Fetch target HTML.
- Parse with `DOMParser`.
- Replace only:
  - `main.view` subtree
  - page-specific footer lead text
  - `document.title`, meta description, and `body` page class
- Update active nav state and history (`pushState` / `popstate`).
- Keep fallback to hard navigation if fetch/parse/swap fails.

## Risk Notes
- Back/forward handling must load matching partials and avoid duplicate history entries.
- Rapid repeated clicks/swipes need navigation locking or request abort logic.
- Swapping only scoped regions requires stable selectors across all route files.
