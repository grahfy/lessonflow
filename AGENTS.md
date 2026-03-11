# Repository Guidelines

## Project Structure & Module Organization
This repository is a Next.js App Router application.

- Route entry points live in `src/app`:
  - Public: `/`, `/lessons`, `/teacher`, `/vouchers`, `/contact`, `/book`, `/terms`, `/videos`
  - Student: `/student/login`, `/student/portal`, `/student/materials`
  - Admin: `/admin/login`, `/admin/bookings`, `/admin/customers`, `/admin/invoices`, `/admin/reports`, `/admin/settings`, `/admin/manual`
  - APIs: `src/app/api/**`
- Shared UI and client behavior live in `src/components`.
- Shared global styles live in `src/styles/`, with route or feature-local styles moving into additional CSS files or CSS Modules where appropriate.
- Shared data and utilities live in `src/lib`.
- Prisma generated client in `src/generated/prisma/client`.
- Planning artifacts live in `thoughts/`:
  - `thoughts/tickets/`
  - `thoughts/research/`
  - `thoughts/plans/`

## Build, Test, and Development Commands
- `npm run dev`
  Starts the local development server.
- `npm run build`
  Builds the Next.js application for production.
- `npm run start`
  Starts the production server.
- `npm run lint`
  Runs ESLint checks using the ESLint CLI (`next lint` is deprecated and must not be used).
- `npm run typecheck`
  Runs TypeScript type checking without emitting files.
- `npm run test`
  Runs all unit/integration tests (prepares test DB first).
- `npm run test:prepare`
  Resets and prepares the test database.
- `npm run test:watch`
  Runs tests in watch mode for development.
- `npm run test:e2e`
  Runs Playwright end-to-end tests.
- `npm run prisma:generate`
  Generates Prisma client from schema.
- `npm run prisma:migrate`
  Runs Prisma database migrations.

### Running a Single Test
Vitest supports filtering tests via CLI. Use the `--` separator to pass arguments:
```bash
npm run test:prepare && node ./scripts/run-vitest-with-test-db.cjs run -- [test-name-pattern]
```
Example: `npm run test:prepare && node ./scripts/run-vitest-with-test-db.cjs run -- booking`

## Coding Style & Naming Conventions

### General
- Use TypeScript for all application and component code.
- Use 2-space indentation in TS/TSX/CSS files.
- Keep reusable UI and behavior in `src/components` and `src/lib`.
- Keep route handlers and page composition in `src/app`.
- Use kebab-case for CSS class names (e.g., `booking-form`, `admin-header`).

### Components
- Mark client components with `"use client"` directive at the top.
- Use functional components with explicit return types for exported components.
- Use `.tsx` extension for components with JSX, `.ts` for utilities.
- Colocate related files (e.g., `component-name.tsx` with `component-name.test.ts`).

### Imports & Paths
- Use the `@/` alias for absolute imports from the project root.
- Order imports: React/Next built-ins → external libraries → @/ imports → relative imports.
- Group imports with blank lines between groups.
```typescript
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { format } from "date-fns";
import { BookingForm } from "@/components/booking-form";
import { prisma } from "@/lib/db";
import { validateBooking } from "./utils";
```

### Types
- Use explicit types for function parameters and return values.
- Use discriminated unions for state machines (e.g., `BookingState`).
- Define types close to where they are used; export if reused across modules.
- Use Zod for runtime validation of external data (API responses, form inputs).
```typescript
type BookingState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };
```

### Error Handling
- Use try/catch with async/await for API calls and database operations.
- Set user-facing error states with descriptive messages.
- Validate inputs with Zod schemas before processing.
- Throw descriptive errors for missing environment variables.

### Functions & Comments
- Add JSDoc comments for exported functions explaining purpose and parameters.
- Use inline comments to explain non-obvious design decisions (prefix with `RATIONALE:` or `NOTE:`).
- Example:
```typescript
/**
 * Validates booking form submission data.
 * @param data - Raw form data from the booking form
 * @returns Validated booking data or throws ZodError
 */
export function validateBookingData(data: unknown) {
  // RATIONALE: We validate before DB operations to fail fast
  return bookingSchema.parse(data);
}
```

### Database & API
- Use Prisma with MariaDB adapter for database operations.
- Use the singleton pattern for Prisma client (see `src/lib/db.ts`).
- Validate API request bodies with Zod schemas.
- Return consistent response structures from API routes.

### CSS & Styling
- Use global CSS variables in `src/styles/globals.css` for theming, and prefer CSS Modules for feature-local frontend styling.
- Use Tailwind-style class composition or CSS modules.
- Avoid inline styles except for dynamic values.

## Testing Guidelines

### Running Tests
- Run `npm run lint` and `npm run typecheck` before committing.
- Run `npm test` for behavior changes.
- Run `npm run test:e2e` for full end-to-end workflows.
- Do not use `next lint` in this repository. Prefer the `npm` scripts or direct ESLint CLI commands instead.

### Test Organization
- Unit tests live alongside components: `src/components/foo.tsx` → `src/components/foo.test.ts`.
- E2E tests live in `tests/e2e/`.
- Use Vitest for unit/integration tests, Playwright for e2e.

### Manual Verification Checklist
After significant changes, verify:
- Public route navigation and active nav state
- Booking/contact/admin workflows
- Motion behavior in normal and reduced-motion modes
- Desktop/mobile layout behavior

## Test Environment Sync Requirement
When making main changes, update test environment/config and docs in the same task.

Main changes include:
- Shared behavior changes (global CSS, navigation flow, route structure)
- Dependency/config/environment/schema updates
- Any change that alters setup/runtime assumptions or verification steps

Required actions:
- Update `.env.example`/test fixtures/setup docs as needed
- Update manual verification steps if behavior changed
- Re-run relevant checks in the updated environment

## Commit & Pull Request Guidelines

### Commit Messages
Use Conventional Commits format:
- `feat: add booking conflict warning`
- `fix: preserve public shell during route transitions`
- `refactor: extract booking validation to shared lib`

Commit messages must be detailed and human-readable, not terse shorthand.
- Write a clear subject that describes the user-visible or engineering outcome.
- Write the body so an end-user or non-technical stakeholder can understand the fix or new feature without needing repo-specific context.
- Use a multiline body that explains what changed and why it was necessary.
- Write the body as full paragraphs, not sentence fragments or a bullet-only changelog.
- Do not use a subject-only commit message except for truly trivial housekeeping changes.
- Prefer plain language over internal abbreviations unless the abbreviation is already standard in the repo.
- Start with the customer-facing impact first, then add implementation detail only if it helps clarify scope.
- Prefer at least two short paragraphs when the change affects behavior, UI, architecture, data flow, or deployment.

Use multiline commit messages:
```bash
git commit -m "<title>" -m "<details>"
```

### PR Description
Include:
- Summary and rationale
- List of changed routes/components
- Before/after screenshots (desktop + mobile) for UI changes
- Manual test checklist

## Content & Asset Notes
- Current visuals include placeholder image sources
- Replace with licensed or client-approved assets before production release

## Technology Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.x
- **Database**: MariaDB with Prisma 7
- **Validation**: Zod
- **UI Components**: Radix UI
- **Animations**: GSAP
- **Icons**: Lucide React
- **Testing**: Vitest + Playwright
- **Linting**: ESLint with Next.js config

## Deployment Environment Policy
- Docker/Compose are for local development and testing only.
- Production runs on a low-power VPS using `systemd + nginx + MySQL/MariaDB`.
- Do not propose Docker as the production runtime path in deploy scripts or runbooks.
- Keep production deployment automation Docker-independent.
