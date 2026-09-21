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

### 3.5. Continuous Integration (CI) Rule

If you push code to GitHub and the tests fail, the PR cannot be merged. You can enforce this by setting up a simple GitHub Actions workflow file that runs npm run test every time you open a Pull Request.

