### System Testing Strategy & Conventions

### 1. Overview

The testing architecture follows the classic "Testing Pyramid." The base consists of many fast, isolated Unit Tests. The middle contains Integration and Component Tests to verify connected systems. The peak consists of a few slower, highly valuable End-to-End (E2E) tests that simulate real user behavior.

### 2. Types of Tests & Recommended Frameworks

### 2.1. Unit Testing (Backend & Frontend)

- **Description:** The smallest level of testing. You isolate a single function, class, or utility and test it independently from the rest of the application. It verifies that core logic works in a vacuum.
- **Target Areas:** Password hashing utilities, JWT generation functions, data formatting helpers, and complex frontend state reducers.
- **Recommended Framework:Vitest** (or **Jest**). Vitest is highly recommended if you are using modern build tools like Vite for your React app, as it is incredibly fast and shares the exact same API as Jest.

### 2.2. Component Testing (Frontend)

- **Description:** Testing individual React components in a simulated browser environment. You verify that the component renders correctly given specific props and that it responds appropriately to simulated user interactions (like clicking a button).
- **Target Areas:** The Star Rating UI, the "Create Community" form validation, and the Post Card display.
- **Recommended Framework:React Testing Library (RTL)** paired with **Vitest/Jest**. RTL is the industry standard because it encourages you to test your components exactly how a user interacts with them (e.g., finding a button by its text, not by its CSS class).

### 2.3. Integration Testing (Backend)

- **Description:** Testing how different parts of your backend work together. Instead of isolating a function, you test the entire request lifecycle: a request hits the API router, triggers the controller, queries a test database, and returns a JSON response.
- **Target Areas:** Database queries, authentication middleware, and API endpoint responses.
- **Recommended Framework:Supertest** paired with **Vitest/Jest**. Supertest allows you to simulate HTTP requests (GET, POST) directly against your Node/Express application without actually starting a live web server.

### 2.4. End-to-End (E2E) Testing (Full System)

- **Description:** The ultimate sanity check. These tests launch a real browser, navigate to your frontend URL, click buttons, wait for network responses, and verify the final UI state. It tests the frontend, backend, and database all at once.
- **Target Areas:** The core user loops: Logging in, creating a community, and successfully pasting a link to generate a universal recommendation.
- **Recommended Framework:Playwright**. **(Highly Recommended)**. Since you are already installing Playwright to build your backend music link scraper, using it for E2E testing is a massive architectural win. You won't have to learn a new tool (like Cypress), and you keep your dependency weight down.

### 3. Core Testing Conventions

To keep your test suite clean and maintainable, adhere to the following rules:

### 3.1. File Colocation

Keep your tests right next to the code they are testing, rather than burying them in a massive, separate /tests folder. It makes finding and updating them much easier.
- **Backend:** src/services/auth.service.ts -> src/services/auth.service.test.ts
- **Frontend:** src/components/PostCard.tsx -> src/components/PostCard.test.tsx

### 3.2. The "A.A.A." Pattern

Every single test you write must follow the Arrange, Act, Assert pattern to ensure readability.
- **Arrange:** Set up the initial state (e.g., create a mock user, seed the test database).
- **Act:** Execute the function or trigger the event you are testing (e.g., call the login API).
- **Assert:** Check that the outcome matches your expectations (e.g., expect the response status to be 200).
TypeScript
// Example of AAA Pattern
test('should return 400 if email is missing', async () => {
// 1. Arrange
const invalidPayload = { password: 'password123' };

// 2. Act
const response = await request(app).post('/api/auth/register').send(invalidPayload);

// 3. Assert
expect(response.status).toBe(400);
expect(response.body.error).toBe('Email is required');
});

### 3.3. Database State Isolation (Crucial for Integration)

Integration tests must **never** run against your production or local development database.
- Set up a separate test database (e.g., music_app_test_db).
- Before each test suite runs, wipe the database clean and run your schema migrations.
- Tests must not depend on each other. Test A should not fail just because Test B ran first and altered a database row.

### 3.4. Mocking External Boundaries

When writing unit or integration tests, **do not make actual network requests to third-party services.** * If testing the Google OAuth flow, mock the google-auth-library to return a fake verified token.
- If testing the route that uses your Playwright scraper, mock the generateUniversalLinks service so it instantly returns fake links instead of actually booting up a headless browser during the test. (Save the real browser interaction for your E2E tests).

### 3.5. Test Both the Good Path and the Bad Path

This is the convention that matters most in this project, and the one most often skipped.

For every unit of behaviour, the happy path is the **cheapest** test to write and the **least** informative. Production breaks on the paths nobody exercised: the malformed payload, the expired token, the resource deleted between load and click, the third-party service that timed out.

The rule: **every scenario named in the feature specification gets a test, and the failure scenarios are named explicitly, one by one.** A feature specification that lists "handles errors" has not specified anything. It must list *which* errors, *what triggers* each, and *what the user sees*.

A pull request containing only happy-path tests is sent back for revision, regardless of its coverage percentage.

### 3.6. Coverage Threshold

- **80% line coverage is enforced in CI** via the Vitest coverage reporter (v8 provider). Falling below it fails the build and blocks the merge.
- The threshold is a **floor that catches untested branches, not a target to be gamed**. Never write an assertion-free test whose only purpose is to execute a line and lift the number. Such a test is worse than no test: it consumes maintenance effort and provides false confidence.
- Files genuinely not worth testing — the generated Prisma client, configuration barrels, `main.tsx` — are excluded in the Vitest config, each with a comment explaining why. Excluding a file is honest; padding it is not.

### 4. Continuous Integration & Delivery

CI is enforced through two GitHub Actions workflows. The split exists because different test layers have very different costs, and a pull-request pipeline that takes ten minutes stops being used.

### 4.1. `pr.yml` — gates every Pull Request

Triggered on every pull request targeting `main`. **All four jobs must pass before the PR can be merged**, enforced through a GitHub branch protection rule on `main`, not merely by convention.

| Job | Command | Purpose |
|---|---|---|
| `lint` | `npm run lint` | ESLint across both packages |
| `typecheck` | `tsc --noEmit` | Type errors caught before runtime |
| `test:unit` | `vitest run --coverage` | Unit tests, both packages, with the 80% floor applied |
| `test:integration` | `vitest run --config integration` | Supertest against a `postgres:16` service container running `music_app_test_db`, freshly migrated |

Jobs run in parallel. Target wall-clock for the whole workflow is **under roughly three minutes**, so the feedback loop stays fast enough to actually use.

### 4.2. `main.yml` — runs after merge and nightly

Triggered on pushes to `main` and on a nightly schedule. Runs everything in `pr.yml`, plus:

| Job | Command | Purpose |
|---|---|---|
| `test:e2e` | `playwright test` | The full end-to-end suite against a built frontend and a live backend |

**Why E2E is deliberately kept off the pull-request path:** installing browser binaries and driving real user flows costs several minutes, and E2E is by a wide margin the flakiest layer. A flaky test that blocks every merge gets ignored or disabled, which is worse than having no test. Catching a regression at merge time rather than at PR time is the accepted trade-off, and it is the standard arrangement in the industry for exactly this reason.

The nightly run exists because the scraper depends on a live external site. A layout change at squigly.link can break the core feature without a single line of our code changing, and the nightly E2E run is what discovers it.

**A red `main` or a red nightly run takes priority over starting the next feature.** A broken main branch that is allowed to stay broken defeats the entire purpose of the gate.

### 4.3. Continuous Delivery

Deployment is **not** automated from CI at this stage. `main` is kept deployable at all times, and the deploy itself is triggered deliberately. The hosting provider and the eventual deploy mechanism are a Phase 6 decision — see `docs/deployment.md` §3.

### 5. Definition of Done for a Feature

A feature is Done only when **all** of the following hold:

- Unit tests cover every service function's success case and every error branch it can throw.
- Integration tests cover every new endpoint's success case plus `400`/`422`, `401`, `403`, and `404` as applicable.
- Component tests cover every new interactive screen: renders, validates, shows its error state.
- E2E tests cover the feature only if it forms part of a golden user loop. Do not duplicate at the E2E layer what an integration test already proves.
- Every scenario listed in the feature specification has a corresponding test.
- The full suite passes and coverage is at or above the threshold.
- `DEVELOPMENT.md` has been updated with what was built and how to verify it.

Tests are never deferred to a follow-up pull request. A feature merged without its tests is not a delivered feature; it is a liability that someone has agreed to pay for later.

