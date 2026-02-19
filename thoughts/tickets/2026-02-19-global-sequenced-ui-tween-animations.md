# Global Sequenced UI Tween Animations

## Status
`planned`

## Request Summary
Implement quick, sequential tween-based in/out animations for small UI elements across every active page in the Next.js site.

## Scope
- Apply to all route surfaces in `src/app`:
  - Public: `/`, `/lessons`, `/teacher`, `/vouchers`, `/contact`, `/book`, `/terms`.
  - Admin: `/admin/login`, `/admin/bookings`.
- Animate visible UI elements in sequence (for example headings, copy, cards, list items, fields, buttons, notices, calendar events, and dialog content).
- Use tween animations (JS tween engine), with reduced-motion compliance and mobile-safe performance.
- Include entry and exit choreography for route transitions and modal/dialog open-close flows.

## Constraints
- Keep existing content hierarchy, route structure, and form/admin behavior unchanged.
- Preserve accessibility and operability during animations (focus, keyboard, pointer, and form submission).
- Prevent performance regressions for dense admin views (calendar and dialog-heavy states).

## Resolved Decisions
- Use a route/dialog transition state machine with two-phase visibility (`visible` -> `exiting` -> unmount) so out animations complete before route swap or dialog teardown.
- Add a hard transition timeout fallback (for example ~280ms) so navigation and close actions cannot hang if a tween is interrupted.
- Animate only scoped, curated targets (`data-motion-root` + `data-motion-item`) rather than every DOM node.
- Enforce animation caps in dense views:
  - max animated items per sequence (public/admin roots),
  - month-view calendar cap per day cell, with overflow using instant render.
- Keep all transforms/opacity-only tweens, with `prefers-reduced-motion` short-circuit to immediate mode.
