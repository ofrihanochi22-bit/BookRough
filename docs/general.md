### Product Requirements Document (PRD): Music Community App

### 1. Objective

To create a social platform that allows groups of friends to share music recommendations regardless of the streaming service they use, fostering conversation and feedback around the music.

### 2. Target Audience

Music enthusiasts, friend groups, and niche communities looking for an organized way to share, rate, and discover new music together.

### 3. Tech Stack

These are settled decisions, not options. The full reference is in `docs/tech stack.md`.

- **Language:** TypeScript, on both backend and frontend.
- **Backend:** Node.js with Express.
- **Frontend:** React with Vite, styled with Tailwind CSS.
- **Database:** PostgreSQL, accessed through Prisma ORM. **MongoDB was considered and rejected** — the data is relational (users belong to communities, ratings belong to posts and users), and the flexibility of a document store buys nothing here.
- **Link conversion:** A **server-side Playwright headless browser scraping squigly.link**. See `docs/link converter implementation guide.md`.
  - **The Odesli / Songlink API was evaluated and rejected.** The service has been degraded for several months and no longer returns links for most platforms, which defeats the purpose of the core feature. Scraping squigly.link is less elegant and slower, but it actually works. This trade-off is accepted knowingly, and its cost is reflected in the performance requirement in §5.
- **Delivery:** A deployed website that is also an **installable Progressive Web App**. See `docs/deployment.md`.

### 4. Functional Requirements

### 4.1. User Management

- **Sign Up & Login:** **Google Sign-In only.** There is no email/password option. The account key is the Google `sub` claim; **the email address is deliberately never stored** (see `docs/tables.md` and `docs/auth.md`). Sign-up and login are the same action — an unknown `sub` creates an account, a known one logs in.
- **Preferences:** During onboarding (and in settings), the user selects their **Preferred Streaming Service** (Spotify, Apple Music, YouTube, Tidal, Deezer). This selection determines which link format they see.
- **User Profile:** Profile picture, display name, and rating history.
- **Profile pictures are generated, not uploaded.** The avatar is the user's initials over a colour derived deterministically from their id, so the same user always renders identically. Users who sign in with Google keep the picture Google provides. **There is no image upload anywhere in the product** — no upload endpoint, no storage bucket, no image processing. The schema reserves the nullable `profile_picture_url` column so real uploads remain possible later without a migration.

### 4.2. Communities

- **Create Community:** A user can create a new community (Name, Description). The cover image is a **generated** graphic derived from the community name and id, consistent with the no-upload rule in §4.1.
- **Invite Members:** Community Admins can generate and send unique invite links.
- **Join Community:** Users can join via invite links or search (if the community is public).
- **Permissions:** Admins can remove users from the community.

### 4.3. Music Sharing & Conversion (Core Feature)

- **Post Recommendation:** A user pastes a link to a song/album from their service (e.g., Spotify).
- **Automated Processing (Backend):** The server identifies the song, fetches metadata (Artist, Title, Cover Art), and generates a **"Universal Link"** (or retrieves IDs for all other platforms).
- **Recipient View:** When another community member clicks the song, they are automatically directed to the specific service they defined in their preferences (e.g., an Apple Music user clicks a link sent from Spotify but is redirected to Apple Music).
- **Posting experience:** Conversion is **synchronous and blocking**. The user presses Submit, waits behind a spinner with explanatory copy, and the post appears fully converted. The post is never published in a half-finished state that fills in later.
- **Graceful failure:** If conversion fails or exceeds its time ceiling, the post is still saved with the original link and a quiet note that other services were unavailable. The user's content is never dropped.

### 4.4. Interaction & Rating

- **Rating:** Users can rate a shared song on a scale of 1 to 10 stars.
- **Feedback Loop:** The user who recommended the song receives a notification regarding the rating ("Danny rated your recommendation 9 stars!").
- **Comments (Optional):** Ability to add text feedback alongside the star rating.

### 4.5. Bookmarks ("Listen Later")

- Users can bookmark a song to save it for later.
- **"My List" Screen:** A dedicated view displaying all bookmarked songs that haven't been rated/listened to yet.

### 5. Non-Functional Requirements

- **Performance — link conversion.** The original target of "under 2 seconds" was written on the assumption of an API call and **is void**, because the Odesli API was rejected (§3). Driving a real headless browser against a live site costs 3–8 seconds and that cannot be optimised away.
  - **Current requirement: p95 under 10 seconds, hard ceiling 12 seconds**, after which the request is abandoned and the post is saved with its original link only.
  - Because the wait is long and unavoidable, it is handled as a **designed** experience: a spinner with copy explaining what is happening, never an ambiguous button state.
- **Performance — everything else.** Non-conversion API responses should return in under 300 ms. The feed must render meaningful content, including skeletons, within one second of navigation.
- **Concurrency.** Each conversion runs a Chromium instance, which is memory-expensive. Concurrent conversions are capped at **two**; further requests queue. This is a deliberate ceiling matched to a small deployment, not a scalability goal.
- **Scalability:** The system must support users belonging to multiple distinct communities. Target scale is a handful of friend groups, not a public network — capacity decisions should be sized accordingly rather than speculatively.
- **UX/UI:** Clean interface focused on Album Art and song details. **Mobile-First approach** is crucial as most music consumption happens on mobile devices. Layouts are designed at 375px width first and expand upward.
- **Language:** The interface is **English only**. There is no internationalisation layer and no RTL support.
- **Availability & install.** The product ships as a deployed website that is also an **installable PWA**, launchable full-screen from an iPhone home screen, with offline reading of already-loaded content. Write actions require connectivity. See `docs/deployment.md`.
- **Privacy by minimisation.** No user email addresses and no passwords are stored. The administrative area (UC-19) therefore cannot display personal data, because none exists in the system. The accepted cost: the product can never email a user, and an account whose Google login is lost cannot be recovered.
- **Security:** Session tokens are carried in `HttpOnly`, `Secure` cookies. No secret is ever committed to the repository.

### 6. High-Level Data Model

Here is a proposed structure for the core entities to assist with your TypeScript/DB setup:
- **User:**
  - id
  - username
  - preferredService (Enum: Spotify, AppleMusic, etc.)
  - communities (Array of Community IDs)
- **Community:**
  - id
  - name
  - members (Array of User IDs)
  - posts (Array of Post IDs)
- **Post (Song Recommendation):**
  - id
  - authorId (User)
  - communityId
  - songMetadata (Title, Artist, CoverImage)
  - externalLinks (Object mapping: service -> url)
  - ratings (Array of Rating objects)
- **Rating:**
  - userId
  - score (1-10)
  - comment (String)
  - timestamp

