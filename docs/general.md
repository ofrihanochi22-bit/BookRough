### Product Requirements Document (PRD): Music Community App

### 1. Objective

To create a social platform that allows groups of friends to share music recommendations regardless of the streaming service they use, fostering conversation and feedback around the music.

### 2. Target Audience

Music enthusiasts, friend groups, and niche communities looking for an organized way to share, rate, and discover new music together.

### 3. Tech Stack

- **Language:** TypeScript (Highly recommended for both Backend and Frontend for type safety).
- **Backend:** Node.js (Can use frameworks like NestJS or Express).
- **Frontend:** React.
- **Database:** MongoDB (Suitable for flexible social structures) or PostgreSQL (If strict relational data is preferred).
- **3rd Party Integrations:** Music Link API (e.g., Odesli / Songlink API) to translate songs between different services.

### 4. Functional Requirements

### 4.1. User Management

- **Sign Up & Login:** Registration via Email/Password or Social Login (Google).
- **Preferences:** During onboarding (and in settings), the user selects their **Preferred Streaming Service** (Spotify, Apple Music, YouTube, Tidal, Deezer). This selection determines which link format they see.
- **User Profile:** Profile picture, display name, and rating history.

### 4.2. Communities

- **Create Community:** A user can create a new community (Name, Description, Cover Image).
- **Invite Members:** Community Admins can generate and send unique invite links.
- **Join Community:** Users can join via invite links or search (if the community is public).
- **Permissions:** Admins can remove users from the community.

### 4.3. Music Sharing & Conversion (Core Feature)

- **Post Recommendation:** A user pastes a link to a song/album from their service (e.g., Spotify).
- **Automated Processing (Backend):** The server identifies the song, fetches metadata (Artist, Title, Cover Art), and generates a **"Universal Link"** (or retrieves IDs for all other platforms).
- **Recipient View:** When another community member clicks the song, they are automatically directed to the specific service they defined in their preferences (e.g., an Apple Music user clicks a link sent from Spotify but is redirected to Apple Music).

### 4.4. Interaction & Rating

- **Rating:** Users can rate a shared song on a scale of 1 to 10 stars.
- **Feedback Loop:** The user who recommended the song receives a notification regarding the rating ("Danny rated your recommendation 9 stars!").
- **Comments (Optional):** Ability to add text feedback alongside the star rating.

### 4.5. Bookmarks ("Listen Later")

- Users can bookmark a song to save it for later.
- **"My List" Screen:** A dedicated view displaying all bookmarked songs that haven't been rated/listened to yet.

### 5. Non-Functional Requirements

- **Performance:** Link conversion/metadata fetching should take less than 2 seconds to ensure a smooth posting experience.
- **Scalability:** The system must support users belonging to multiple distinct communities.
- **UX/UI:** Clean interface focused on Album Art and song details. **Mobile-First approach** is crucial as most music consumption happens on mobile devices.

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

