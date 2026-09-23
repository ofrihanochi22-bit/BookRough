### Recommended Implementation Roadmap

By slicing vertically, you can organize your sprints logically. Here is a battle-tested order of operations for your specific app:

### How Each Feature Is Built

Within every phase below, work proceeds **one feature at a time** through four stages, defined in full in `CLAUDE.md` §15:

1. **Specification session** — a conversation, no code. Produces `docs/features/<name>.md`, which the developer approves before anything is implemented.
2. **Implementation** — the whole vertical slice, database through user interface, in one pass.
3. **Review and improvement** — read back what was built and fix naming, duplication, error handling, and missing states *before* tests are written, so tests are not written against a first draft.
4. **Tests** — the suite described in `docs/tests.md`, covering every good path and every bad path named in the specification.

Only after stage four is green does the feature get committed, pushed, and opened as a Pull Request. Do not begin the next feature's specification while the previous Pull Request is still open.

### Phase 0: Local Environment & Shared Infrastructure

Before any use case is implemented: local PostgreSQL via Docker Compose, environment files, the Express bootstrap with its error middleware and logger, the Vite frontend shell with its axios client and error boundary, and the code-quality tooling (ESLint, Prettier, Husky, commitlint). This phase produces no user-visible behaviour and is the only phase for which that is acceptable.

### Phase 1: The Foundation & Identity (Use Cases 1, 2, 3)

Do not build anything else until a user can securely log in and log out.
- **Database:** Set up your PostgreSQL instance and create the `users` table. There is no `password_resets` table - it was removed with UC-17.
- **Backend:** Implement Google identity-token verification and issue the app JWT. **This is all of authentication** - there are no email/password routes, and the `email` claim is discarded rather than stored (see `docs/auth.md`).
- **Frontend:** Build the Welcome screen with a single "Continue with Google" button, and the Complete Your Profile onboarding screen. Registration, Login, Forgot Password, and Create New Password screens no longer exist.
- **Result:** You have a secure, authenticated shell.

### Phase 2: Core Social Structures (Use Cases 4, 9, 10, 14, 15, 19)

Build the "rooms" before you build the furniture.
- **Database:** Create the communities and community_members tables.
- **Backend:** Create the CRUD (Create, Read, Update, Delete) routes for communities and the logic for generating/validating invite links.
- **Frontend:** Build the Home Dashboard, the "Create Community" modal, the Community Settings/Members list, and the User Profile editing screen.
- **Admin (UC-19):** Build the administrative area - user list and presentation settings, gated on `users.role = 'ADMIN'`. Pulled forward into this phase so the app can be managed while it is trialled with real friends. **It cannot display an email address, because none is stored.**
- **Result:** Users can exist in the app, form groups, and invite each other.

### Phase 3: The "Magic" Feature (Use Case 11 & Playwright Service)

Tackle your highest technical risk early. This is the core value of your app.
- **Database:** Create the posts table.
- **Backend:** Build the Playwright scraping service to hit squigly.link. Then, build the API route that accepts a user's link, runs the scraper, and saves the final data to the database.
- **Frontend:** Build the Community Feed UI and the input box for pasting links.
- **Result:** The core loop is functional. Friends can share links and see the converted outputs in a shared timeline.

### Phase 4: Engagement & Feedback (Use Cases 12, 13, 16)

Now that content exists, allow users to interact with it.
- **Database:** Create the ratings and bookmarks tables.
- **Backend:** Build the API routes for adding/removing bookmarks and submitting a star rating/comment.
- **Frontend:** Build the "My List" (Listen Later) screen, the rating modal, and update the Post UI to display the accumulated feedback and average scores.
- **Result:** The app is now "sticky" and encourages conversation.

### Phase 5: The Edge Cases (Use Cases 5, 6, 7, 8)

Polish the remaining social discovery features.
- **Database:** Create the friends table.
- **Backend:** Build the routes for global user search and managing friend requests.
- **Frontend:** Build the Global Search bar, the "Add Friend" actions on public profiles, and the dedicated Friends management tab.
- **Result:** A fully functional, feature-complete application.

### Phase 6: Shipping It

Feature-complete is not shipped. This phase turns a working local application into something a friend group can actually use.
- **CI:** Already in place since Phase 0 - confirm the nightly E2E run is green and that branch protection still requires every `pr.yml` check.
- **PWA:** Manifest, full icon set including the iOS sizes, service worker with app-shell precaching and an offline fallback, and the version-update prompt. Verify by installing on a real iPhone from Safari — not by trusting a Lighthouse score.
- **Hosting:** Make the provider decision that was deliberately deferred, against the free-tier terms in force at that moment. Work through the deployment checklist in `docs/deployment.md` §7.
- **Production hardening:** Rate limiting on the auth and posting endpoints, CORS locked to the production origin rather than a wildcard, secrets configured at the provider, and a verified end-to-end link conversion in production — the step most likely to fail, because Chromium's memory footprint on a small instance is not reproducible locally.
- **Result:** A public URL that works in a desktop browser and installs as a full-screen app on a phone.

