# Incremental Page Transitions Without Full Redraw

## Status
`implemented`

## Request Summary
When changing pages on the main marketing site, avoid full-page redraws. Keep persistent UI in place and only swap the text/UI elements that actually change so transitions look cleaner.

## Scope
- Apply to root static pages:
  - `index.html`
  - `lessons.html`
  - `teacher.html`
  - `vouchers.html`
  - `contact.html`
  - `terms.html`
- Keep header/nav shell persistent during in-site navigation.
- Replace only route-varying regions (primary content and page metadata).
- Preserve existing navigation inputs:
  - nav link clicks
  - keyboard arrows
  - touch swipe left/right
- Preserve deep-link entry behavior and browser back/forward behavior.

## Non-Goals
- Rewriting the site into a framework/router.
- Redesigning layout, copy, or visual theme.
- Changing contact actions (`mailto:`/`tel:`) or external-link behavior.

## Constraints
- No build step requirement; continue to run as static files.
- Maintain accessibility semantics and current active-nav behavior.
- Keep graceful fallback to full navigation when partial swap fails.
