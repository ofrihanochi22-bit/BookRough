### Tech Stack & Tooling Reference

### 1. Frontend Ecosystem (Client-Side)

The user-facing application where communities, feeds, and profiles live.
- **React:** The core UI library for building the interface.
- **Vite:** The build tool and development server. It is significantly faster and more modern than Create React App.
- **TypeScript:** For strong typing across your components and catching errors before runtime.
- **@react-oauth/google:** The specific library to handle the Google Login popup and token retrieval.
- **Zustand:** For global state management. Chosen over React Context and Redux because it is extremely lightweight and requires far less boilerplate for tracking the user's active session and preferred streaming service.
- **Tailwind CSS:** A utility-first CSS framework. It drastically speeds up styling and ensures a consistent UI without writing sprawling custom CSS files. Classes are written mobile-first and expanded upward with `sm:` / `md:` / `lg:`.
- **React Router:** Client-side routing.
- **Axios:** The HTTP client, configured as a single instance with a `401` interceptor and a global error toast.
- **vite-plugin-pwa:** Generates the service worker and wires up the web app manifest, turning the site into an installable, offline-capable PWA. Built on Workbox. See `docs/deployment.md` §6 for the full PWA scope.

**Not used, deliberately:** no i18n library (`react-i18next` or otherwise) — the UI is English-only; no component library beyond Tailwind; no image-upload or cropping library — avatars are generated.

### 2. Backend Ecosystem (Server-Side)

The API layer that handles business logic, database interactions, and authentication.
- **Node.js:** The JavaScript runtime for your server.
- **Express.js:** The lightweight web framework used to define your API routes (GET, POST, etc.) and middleware.
- **TypeScript:** To share data types (like your Post or User interfaces) between your backend and frontend.
- **Playwright:** The automation library used headlessly on the server to scrape squigly.link and generate universal music links.
- **jsonwebtoken(JWT):** The library used to generate and verify the secure session tokens that keep users logged in.
- **google-auth-library:** Google's official Node.js library used to cryptographically verify the identity tokens sent from your React frontend. This is the **only** authentication mechanism — `bcrypt` and password hashing have been removed from the stack, because no passwords exist.
- **Prisma ORM:** A modern Object-Relational Mapper. It reads your database schema and generates highly type-safe database clients, which pairs perfectly with a structured development workflow. Prisma is also what keeps the deployment provider-agnostic: moving the database means changing `DATABASE_URL`, nothing more.
- **Zod:** Runtime validation of every request body and parameter at the controller boundary, with the inferred TypeScript types reused downstream.
- **Pino:** Structured JSON logging with levels and context.
- **p-limit:** Caps concurrent Playwright scrapes at two. Each headless Chromium instance costs significant memory, and the deployment target is a small instance — without this cap, several friends posting at once will exhaust memory and take the server down.

### 3. Database & Infrastructure

Where your data lives and how the backend is packaged.
- **PostgreSQL:** The relational database storing all users, communities, posts, and ratings. MongoDB was considered and rejected — the data is relational.
- **Docker:** The containerization platform. This is not optional: the Node.js backend must be containerized from the `mcr.microsoft.com/playwright` base image so that Playwright has the exact OS-level dependencies (like Chromium and its system libraries) it needs to run in the cloud. The `Dockerfile` is the deployment unit.
- **Hosting:** **Not yet chosen.** The provider decision is deferred to Phase 6 so it can be made against free-tier terms that are current at that time. Until then all code stays provider-agnostic: environment-variable configuration only, no provider SDKs, no vendor-specific build steps. Candidates and the decision checklist are in `docs/deployment.md` §3.

### 4. Testing & Quality Assurance

The safety net to ensure your vertical slices remain functional as the app grows.
- **Vitest:** The test runner. It executes your unit and integration tests. It is faster than Jest and works seamlessly out-of-the-box with Vite projects.
- **React Testing Library (RTL):** Used alongside Vitest to render your React components in a virtual DOM and simulate user clicks and typing.
- **Supertest:** A library that allows you to send fake HTTP requests directly to your Express app in your integration tests, bypassing the need to have a live server running.
- **Playwright (for E2E Testing):** Reusing the library you installed for scraping, Playwright will also act as your end-to-end test runner, spinning up a real browser to test the full user journey from login to posting a link.

### 5. Third-Party Services & APIs

External platforms your app relies on to function.
- **Google Cloud Console:** The dashboard where you register your application to obtain the OAuth 2.0 Client ID required for Google Social Login. Remember that the production origin must be added to the authorised origins and redirect URIs at deploy time — a step that is easy to forget and produces a confusing failure.
- **squigly.link:** The external website your Playwright service will navigate to and scrape for music platform conversions. **This is the project's single largest external risk**: it is an unversioned dependency with no contract, and a layout change on their side breaks the core feature. The mitigations are the graceful-failure path (the post is saved regardless) and keeping the scraper's selectors isolated in one service file so a break is a small, local fix.

**Deliberately not used:** the Odesli / Songlink API, which has been degraded for months and no longer returns links for most platforms.

### 5.1. Code Quality Tooling

Enforced mechanically, so that conventions do not depend on discipline.
- **ESLint:** Static analysis across both packages, with a shared configuration. Runs in CI and blocks merge.
- **Prettier:** Deterministic formatting, so formatting never appears in a code review.
- **Husky + lint-staged:** A pre-commit hook that lints and formats only the staged files, keeping commits fast.
- **commitlint (`@commitlint/config-conventional`):** A commit-msg hook that rejects any message which is not a valid Conventional Commit. This turns the convention in `docs/git workflow.md` from a rule someone must remember into one the tooling guarantees. Bypassing it with `--no-verify` is not permitted.

### 6. Workflow & Documentation

Tools for maintaining code quality, tracking history, and documenting systems.
- **Git & GitHub:** For version control, feature branching, and storing your repository.
- **GitHub Actions:** The CI/CD service built into GitHub. Two workflows: `pr.yml` runs lint, typecheck, unit tests, and integration tests on every pull request and gates the merge; `main.yml` runs all of that plus the Playwright E2E suite on pushes to `main` and nightly. Full detail in `docs/tests.md` §4.
- **Vitest coverage (v8 provider):** Enforces the 80% line-coverage floor in CI.
- **Mermaid.js:** For keeping your project architecture thoroughly documented. Utilizing Mermaid within your markdown files allows you to treat your Entity-Relationship diagrams and sequence flows as code, ensuring they remain version-controlled alongside your actual application logic.

