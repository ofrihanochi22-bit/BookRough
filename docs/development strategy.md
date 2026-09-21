### Recommended Implementation Roadmap

By slicing vertically, you can organize your sprints logically. Here is a battle-tested order of operations for your specific app:

### Phase 1: The Foundation & Identity (Use Cases 1, 2, 3, 17)

Do not build anything else until a user can securely log in and log out.
- **Database:** Set up your PostgreSQL instance and create the users and password_resets tables.
- **Backend:** Implement the Google OAuth token verification and standard email/password Auth routes (using JWTs).
- **Frontend:** Build the Welcome screen, Registration, Login, and Google Auth button integration.
- **Result:** You have a secure, authenticated shell.

### Phase 2: Core Social Structures (Use Cases 4, 9, 10, 14, 15)

Build the "rooms" before you build the furniture.
- **Database:** Create the communities and community_members tables.
- **Backend:** Create the CRUD (Create, Read, Update, Delete) routes for communities and the logic for generating/validating invite links.
- **Frontend:** Build the Home Dashboard, the "Create Community" modal, the Community Settings/Members list, and the User Profile editing screen.
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

