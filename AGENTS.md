# Repository Guidelines

## Project Structure & Module Organization
This repository is a static website with page-level HTML entry points at the root:
`index.html`, `lessons.html`, `teacher.html`, `vouchers.html`, `contact.html`, and `terms.html`.

Shared assets live in:
- `assets/css/styles.css` for global theme, layout, and responsive rules.
- `assets/js/site.js` for transitions, keyboard/swipe navigation, and page ordering (`PAGE_ORDER`).

Planning artifacts are kept in `thoughts/`:
- `thoughts/tickets/` for scoped requests.
- `thoughts/plans/` for implementation plans.

## Build, Test, and Development Commands
No build pipeline is required for local development.

- `python3 -m http.server 4173`
  Serves the site locally from the repository root.
- Open `http://127.0.0.1:4173/index.html`
  Starts from the home page and validates linked navigation.

## Coding Style & Naming Conventions
- Use 2-space indentation in HTML, CSS, and JavaScript.
- Keep filenames lowercase with `.html` suffix (for example, `gift-vouchers.html` if added).
- Use kebab-case CSS class names (for example, `panel-copy`, `site-header`).
- Keep reusable behavior in `assets/js/site.js`; avoid page-specific inline scripts.
- When adding a page, update navigation links across pages and append it to `PAGE_ORDER`.

## Testing Guidelines
There is currently no automated test framework in this repo. Use manual verification before merging:
- Confirm each page loads without console errors.
- Verify nav links, active link state, and `ArrowLeft`/`ArrowRight` page navigation.
- Verify swipe navigation on touch devices.
- Check layout at desktop and mobile widths, including no unintended page scrolling.

## Commit & Pull Request Guidelines
Git history is not available in this workspace snapshot, so no project-specific convention can be inferred. Use Conventional Commit style:
- `feat: add FAQ section to lessons page`
- `fix: correct contact email link`

For PRs, include:
- Clear summary and rationale.
- List of changed pages/assets.
- Before/after screenshots (desktop + mobile).
- Manual test checklist covering navigation and responsiveness.

## Content & Asset Notes
Current visuals include placeholder image sources. Replace with licensed or client-approved assets before production release.
