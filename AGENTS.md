# Repository Guidelines

## Project Structure & Module Organization
This repository is a Next.js App Router application.

- Route entry points live in `src/app`:
  - Public: `/`, `/lessons`, `/teacher`, `/vouchers`, `/contact`, `/book`, `/terms`
  - Admin: `/admin/login`, `/admin/bookings`
  - APIs: `src/app/api/**`
- Shared UI and client behavior live in `src/components`.
- Global styles live in `src/styles/globals.css`.
- Shared data and utilities live in `src/lib`.
- Planning artifacts live in `thoughts/`:
  - `thoughts/tickets/`
  - `thoughts/research/`
  - `thoughts/plans/`

## Build, Test, and Development Commands
- `npm run dev`
  Starts the local app.
- `npm run lint`
  Runs ESLint checks.
- `npm run typecheck`
  Runs TypeScript type checks.
- `npm test`
  Runs tests.
- `npm run test:prepare`
  Resets/prepares the test database.

## Coding Style & Naming Conventions
- Use TypeScript for app/components code.
- Use 2-space indentation in TS/TSX/CSS.
- Keep reusable UI and behavior in `src/components` and `src/lib`.
- Keep route handlers and page composition in `src/app`.
- Use kebab-case CSS class names.
- For generated or modified code, add extensive, clean comments for all functions and key design choices.

## Testing Guidelines
- Run `npm run lint` and `npm run typecheck` before merge.
- Run `npm test` for behavior changes.
- Manually verify:
  - Public route navigation and active nav state.
  - Booking/contact/admin workflows.
  - Motion behavior in normal and reduced-motion modes.
  - Desktop/mobile layout behavior.

## Test Environment Sync Requirement
Whenever main changes are made, update test environment/config and docs in the same task.

Main changes include:
- Shared behavior changes (global CSS, navigation flow, route structure).
- Dependency/config/environment/schema updates.
- Any change that alters setup/runtime assumptions or verification steps.

Required actions:
- Update `.env.example`/test fixtures/setup docs as needed.
- Update manual verification steps if behavior changed.
- Re-run relevant checks in the updated environment.

## Commit & Pull Request Guidelines
Use Conventional Commits:
- `feat: add booking conflict warning`
- `fix: preserve public shell during route transitions`

Use multiline commit messages (`git commit -m "<title>" -m "<details>"`).

For PRs, include:
- Summary and rationale.
- List of changed routes/components.
- Before/after screenshots (desktop + mobile) for UI changes.
- Manual test checklist.

## Content & Asset Notes
Current visuals include placeholder image sources. Replace with licensed or client-approved assets before production release.
