# Tech Stack: LessonFlow

## Core Technologies
- **Language:** [TypeScript](https://www.typescriptlang.org/) - Ensuring type safety and maintainability across the codebase.
- **Frontend:** [Next.js 15](https://nextjs.org/) (App Router) with [React 19](https://react.dev/) - Modern, performant web framework for building responsive user interfaces.
- **Backend:** [Node.js](https://nodejs.org/) via Next.js API Routes - Scalable server-side logic and API management.
- **Database:** [MySQL](https://www.mysql.com/) / [MariaDB](https://mariadb.org/) - Reliable relational database for storing project data.
- **ORM:** [Prisma](https://www.prisma.io/) - Intuitive and type-safe database access layer.

## UI & Styling
- **Styling:** Standard [CSS](https://developer.mozilla.org/en-US/docs/Web/CSS) - Using global and component-level CSS for maximum flexibility.
- **Primitives:** [Radix UI](https://www.radix-ui.com/) - Unstyled, accessible components for complex UI patterns.
- **Icons:** [Lucide React](https://lucide.dev/) - A clean and consistent icon set.
- **Animation:** [GSAP](https://gsap.com/) - Robust animation library for purposeful UI transitions.

## Testing & Quality
- **Unit/Integration Testing:** [Vitest](https://vitest.dev/) - Fast, modern test runner compatible with Vite.
- **E2E Testing:** [Playwright](https://playwright.dev/) - Reliable end-to-end testing for modern web apps.
- **Linting:** [ESLint](https://eslint.org/) - Enforcing code quality and consistency.
- **Validation:** [Zod](https://zod.dev/) - TypeScript-first schema declaration and validation.

## Infrastructure & Utilities
- **PDF Generation:** [pdf-lib](https://pdf-lib.js.org/) - Creating and modifying PDF documents programmatically.
- **Email:** [Nodemailer](https://nodemailer.com/) - Flexible email sending library.
- **Google APIs:** [googleapis](https://github.com/googleapis/google-api-nodejs-client) - Official Node.js client for Google APIs, including Gmail.
- **Authentication:** [bcryptjs](https://github.com/dcodeIO/bcrypt.js) - Secure password hashing.
- **Date Handling:** [date-fns](https://date-fns.org/) - Modern JavaScript date utility library.
- **Deployment:** Custom bash scripts for VPS/DigitalOcean self-hosting.
- **Updates:** Integrated web-triggered deployment wrapper with real-time log streaming (SSE) and database-backed deployment history.
- **Observability:** Database-backed system logs with integrated technical issue reporting.
