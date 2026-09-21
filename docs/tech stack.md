### Tech Stack & Tooling Reference

### 1. Frontend Ecosystem (Client-Side)

The user-facing application where communities, feeds, and profiles live.
- **React:** The core UI library for building the interface.
- **Vite:** The build tool and development server. It is significantly faster and more modern than Create React App.
- **TypeScript:** For strong typing across your components and catching errors before runtime.
- **@react-oauth/google:** The specific library to handle the Google Login popup and token retrieval.
- **Zustand(Recommended) or React Context:** For global state management. Zustand is highly recommended for a project like this as it is extremely lightweight and requires much less boilerplate than Redux for tracking the user's active session and preferred streaming service.
- **Tailwind CSS (Optional but Recommended):** A utility-first CSS framework. It drastically speeds up styling and ensures a consistent UI without writing sprawling custom CSS files.

### 2. Backend Ecosystem (Server-Side)

The API layer that handles business logic, database interactions, and authentication.
- **Node.js:** The JavaScript runtime for your server.
- **Express.js:** The lightweight web framework used to define your API routes (GET, POST, etc.) and middleware.
- **TypeScript:** To share data types (like your Post or User interfaces) between your backend and frontend.
- **Playwright:** The automation library used headlessly on the server to scrape squigly.link and generate universal music links.
- **jsonwebtoken(JWT):** The library used to generate and verify the secure session tokens that keep users logged in.
- **bcrypt:** A cryptographic library used to securely hash and salt user passwords before storing them in the database.
- **google-auth-library:** Google's official Node.js library used to cryptographically verify the identity tokens sent from your React frontend.
- **Prisma ORM (Highly Recommended):** While you can use standard pg to write raw SQL, Prisma is a modern Object-Relational Mapper. It reads your database schema and generates highly type-safe database clients, which pairs perfectly with a structured development workflow.

### 3. Database & Infrastructure

Where your data lives and how the backend is packaged.
- **PostgreSQL:** The relational database storing all users, communities, posts, and ratings.
- **Docker:** The containerization platform. You will absolutely need this to containerize your Node.js backend so that Playwright has the exact OS-level dependencies (like Chromium) it needs to run successfully in the cloud.

### 4. Testing & Quality Assurance

The safety net to ensure your vertical slices remain functional as the app grows.
- **Vitest:** The test runner. It executes your unit and integration tests. It is faster than Jest and works seamlessly out-of-the-box with Vite projects.
- **React Testing Library (RTL):** Used alongside Vitest to render your React components in a virtual DOM and simulate user clicks and typing.
- **Supertest:** A library that allows you to send fake HTTP requests directly to your Express app in your integration tests, bypassing the need to have a live server running.
- **Playwright (for E2E Testing):** Reusing the library you installed for scraping, Playwright will also act as your end-to-end test runner, spinning up a real browser to test the full user journey from login to posting a link.

### 5. Third-Party Services & APIs

External platforms your app relies on to function.
- **Google Cloud Console:** The dashboard where you register your application to obtain the OAuth 2.0 Client ID required for Google Social Login.
- **squigly.link:** The external website your Playwright service will navigate to and scrape for music platform conversions.

### 6. Workflow & Documentation

Tools for maintaining code quality, tracking history, and documenting systems.
- **Git & GitHub:** For version control, feature branching, and storing your repository.
- **GitHub Actions:** The CI/CD service built into GitHub. It will read your .yml workflow files to automatically run your Vitest suite every time you open a Pull Request.
- **Mermaid.js:** For keeping your project architecture thoroughly documented. Utilizing Mermaid within your markdown files allows you to treat your Entity-Relationship diagrams and sequence flows as code, ensuring they remain version-controlled alongside your actual application logic.

