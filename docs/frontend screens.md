### 1. Authentication & Onboarding Flow

These screens handle unauthenticated users and account recovery.
- **1.1. Welcome / Landing Screen**
  - **Purpose:** The entry point for unauthenticated users.
  - **Key UI:** App logo, brief value proposition, "Log In" button, "Sign Up" button, "Continue with Google" button.
- **1.2. Registration Screen (UC-1)**
  - **Purpose:** Account creation and initial onboarding.
  - **Key UI:** Email/Password input fields, Display Name, Username, a live preview of the **generated avatar** (no upload control), and a mandatory dropdown/selector for **Preferred Streaming Service**.
- **1.3. Login Screen (UC-2)**
  - **Purpose:** Authenticating existing users.
  - **Key UI:** Email/Password inputs, "Log In" button, "Forgot Password?" link.
- **1.4. Forgot Password / Recovery Screen (UC-17)**
  - **Purpose:** Requesting a password reset link.
  - **Key UI:** Email input field, "Send Reset Link" button, confirmation state (success message).
- **1.5. Create New Password Screen (UC-17)**
  - **Purpose:** The destination from the email reset link.
  - **Key UI:** "New Password" and "Confirm Password" inputs, "Save Password" button.

### 2. Main Navigation & Social Flows

These screens represent the core social and discovery aspects of the app.
- **2.1. Communities Dashboard (Home Screen)**
  - **Purpose:** The central hub displaying all the groups a user belongs to.
  - **Key UI:** List/Grid of joined Communities (Cover Image, Name), "Create New Community" FAB (Floating Action Button) or prominent button, Bottom/Top navigation bar to switch between Home, Search, My List, and Profile.
- **2.2. Global Search Screen (UC-5)**
  - **Purpose:** Finding other users on the platform.
  - **Key UI:** Search input bar, dynamic list of results (Profile Picture, Name, Username), "No results found" empty state.
- **2.3. Friends & Requests Screen (UC-7, UC-8)**
  - **Purpose:** Managing bidirectional social connections.
  - **Key UI:** Two tabs or sections: "My Friends" (with a "Remove Friend" option) and "Pending Requests" (with "Accept" and "Ignore" actions).
- **2.4. Public User Profile Screen (UC-6)**
  - **Purpose:** Viewing another user's details and initiating connections.
  - **Key UI:** User's display name, avatar, preferred service icon, rating history (their past reviews), and a dynamic connection button ("Add Friend", "Request Sent", or "Friends").

### 3. Community & Core Music Flow

These are the most heavily trafficked screens where the primary value exchange happens.
- **3.1. Community Feed (UC-11, UC-12, UC-18)**
  - **Purpose:** The main timeline for a specific group, displaying all music recommendations.
  - **Key UI:** * Header with Community Name and settings icon.
    - Input area: URL paste box and optional text comment field.
    - Feed of Post Cards: Each card shows the song metadata (Cover Art, Title, Artist), the author's comment, a "Save to Listen Later" bookmark icon, and an average star rating.
    - Context menu on own posts to "Delete Post".
- **3.2. Create Community Screen (UC-9)**
  - **Purpose:** Setting up a new group.
  - **Key UI:** Form for Community Name and Description, a live preview of the **generated cover graphic** (no upload control), and a multi-select list of current friends to invite.
- **3.3. Community Settings & Members Screen (UC-10, UC-14, UC-15)**
  - **Purpose:** Managing the group's roster and individual participation.
  - **Key UI:** List of current members. For Admins: "Generate Invite Link" button, "Remove User" actions next to member names. For all members: "Leave Community" button.
- **3.4. Post Detail / Feedback Screen (UC-16)**
  - **Purpose:** Viewing the detailed discussion and ratings for a specific recommendation.
  - **Key UI:** The primary song card at the top, a large average rating display, and a scrolling list of individual member reviews (User, Star Rating, Text Comment, Timestamp).

### 4. Personal Management Flows

Screens dedicated to individual user actions and backlog management.
- **4.1. "My List" / Listen Later Screen (UC-13)**
  - **Purpose:** The user's personal queue of bookmarked, unrated songs.
  - **Key UI:** List of saved song cards. Tapping a card opens it in their preferred external music app. Each card has a prominent "Rate & Review" action button.
- **4.2. Submit Rating Modal / Screen (UC-13)**
  - **Purpose:** The interface for leaving feedback on a listened-to track.
  - **Key UI:** 1-10 Star selection mechanism (slider or interactive stars), optional text input for a review, and a "Submit Rating" button.
- **4.3. My Profile / Settings Screen (UC-3, UC-4)**
  - **Purpose:** Managing personal account details and app preferences.
  - **Key UI:** Edit mode for Display Name and Preferred Streaming Service, with the generated avatar shown read-only. A highly visible "Log Out" button.

### 5. Cross-Cutting UI Conventions

These apply to every screen above and are not restated per screen.

- **Language: English only.** All copy, labels, errors, and empty states are in English. There is no internationalisation layer and no RTL support.
- **Mobile-first.** Every layout is designed at 375px width first and expanded upward with Tailwind's `sm:` / `md:` / `lg:` prefixes. The primary surface is an iPhone running the installed PWA; the desktop browser is secondary. Touch targets are at least 44x44px.
- **No image uploads.** Avatars and community covers are generated from initials and a colour derived deterministically from the entity id. Google users keep the picture Google supplies. No screen contains an upload control.
- **Three states, always.** Every screen that waits on the network defines a loading state (skeleton or spinner), an empty state, and an error state. A blank area is not a loading state.
- **The posting flow blocks.** Link conversion takes 3-8 seconds and the submit button blocks for its duration behind a spinner with explanatory copy. This is a designed wait, not an accident.
- **Offline.** Installed as a PWA, previously loaded content stays readable without a connection. Write actions (post, rate, bookmark) show an explicit "you're offline" state rather than failing silently or queueing invisibly. See `docs/deployment.md` §6.

