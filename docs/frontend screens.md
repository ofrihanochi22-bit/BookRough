### 1. Authentication & Onboarding Flow

Google Sign-In is the only authentication method, so this group collapsed from five screens to two. Sign-up and login are the same button.

- **1.1. Welcome / Landing Screen (UC-1, UC-2)**
  - **Purpose:** The single entry point for unauthenticated users. Handles both registration and login.
  - **Key UI:** App logo, brief value proposition, and one **"Continue with Google"** button. Below it, a short line of copy setting expectations: that the app never asks for a password and never stores an email address.
  - **States:** idle; signing-in (button disabled with spinner while the popup is open and the token is being verified); error ("Sign-in failed. Please try again.").
  - **No** "Log In" / "Sign Up" split, **no** email or password fields, **no** "Forgot Password?" link.
- **1.2. Complete Your Profile Screen (UC-1)**
  - **Purpose:** Collect the fields Google cannot supply. Shown immediately after a first successful sign-in, and again on any later sign-in where onboarding was abandoned.
  - **Key UI:** Display Name input with live availability feedback (any language, must be unique), an avatar choice between the **generated avatar** (default, live preview) and the user's Google photo when one exists (no upload control), and a mandatory selector for **Preferred Streaming Service** with nothing pre-selected.
  - **States:** loading; validation error ("That display name is already taken."); submitting.
  - The dashboard is unreachable until this screen is completed.

> **Removed screens.** The former Registration (1.2), Login (1.3), Forgot Password (1.4), and Create New Password (1.5) screens have all been **withdrawn**. There are no passwords to enter or reset and no email address to send a link to - see `docs/auth.md` section 1.1 and the withdrawn UC-17. The catalog is now **fifteen** screens (thirteen after the withdrawal, plus Join Community / Invite Preview, added with UC-15 in Phase 2, and the Admin screen, added with UC-19). (It previously held sixteen; the "thirteen" figure quoted in earlier drafts of CLAUDE.md never matched the actual list and has been corrected.)

> **Administrative screens (UC-19)** are in group 5 below, specified in `docs/features/admin-panel.md`. They are reachable only for `users.role = 'ADMIN'`, they render the standard not-found page for everyone else, and **they cannot display an email address because none is stored.**

### 2. Main Navigation & Social Flows

These screens represent the core social and discovery aspects of the app.
- **2.1. Communities Dashboard (Home Screen)**
  - **Purpose:** The central hub displaying all the groups a user belongs to.
  - **Key UI:** List of joined Communities (generated cover, name, member count, an "Admin" label where the user is one), newest joined first, and a floating "Create community" button. A bottom tab bar switches between Home, Search, My List, and Profile; Search and My List show a "Coming soon" screen until their phases, and Profile is My Profile / Settings (4.3).
  - **States:** skeleton cards while loading; an empty state ("Start your first community") with a single Create button; an inline error with Try again.
- **2.2. Global Search Screen (UC-5)**
  - **Purpose:** Finding other users on the platform.
  - **Key UI:** Search input bar, dynamic list of results (Profile Picture, Display Name), "No results found" empty state.
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
    - Input area: URL paste box and optional comment (counter n/280) with Post. While the link converts, the button reads "Finding this track on other services…" and the fields are read-only; an invalid link shows the UC-11 message under the field with the draft kept.
    - Feed of Post Cards, newest first with Load more: the author and time, cover art, title, artist, an "Album" label for albums, the comment, an "Open in {your service}" button (the original link when your service has no match) and "Other services" (a sheet of every link). A post saved during an outage reads "Shared from {service}" with "Other services unavailable", and its author sees "Find on other services". The bookmark icon and average rating arrive in Phase 4 (UC-12, UC-16).
    - Context menu on own posts to "Delete Post" — arrives with Step 3.5 (UC-18).
    - States: post skeletons while loading; "Share the first song" when empty; "Couldn't load posts." with Try again; offline banner "You're offline. Connect to post." with posting disabled while the feed stays readable. Detail: `docs/features/posts-feed.md` §5.
- **3.2. Create Community Screen (UC-9)**
  - **Purpose:** Setting up a new group.
  - **Key UI:** A full-screen form (not a modal, so the phone's back gesture works) for Community Name and Description, with a live preview of the generated cover graphic (neutral until the community exists, since its colour comes from the id; no upload control). In place of the friends multi-select, a static "Invite friends" card until friends exist (Phase 5).
  - **States:** required-name error ("A Community name is required."); submitting ("Creating…"); offline banner. On success the user lands on the community's page, which shows the cover, name, description, member line, and a "Posts are coming soon" panel until Phase 3. A community the user is not in renders the standard not-found page.
- **3.3. Community Settings & Members Screen (UC-10, UC-14, UC-15)**
  - **Purpose:** Managing the group's roster and individual participation.
  - **Key UI:** Opened from a "Settings" button on the community page. Everyone: the member list (avatar, name, "You", an "Owner" / "Admin" label) and "Leave community" with a confirmation — the Owner instead sees the transfer-or-delete message. Admins: editable name and description with "Save changes"; the invite panel (also on the community page, and opening once by itself after a community is created); a ⋯ menu on rows they may act on — "Make admin", "Make member", "Remove from community" (confirmation; removal also blocks and deletes their posts here); and a "Blocked" list with "Unblock". The Owner additionally: "Make owner" (confirmation) and "Delete community", confirmed with a warning and an "I understand this can't be undone" checkbox.
  - **States:** loading skeleton; load error with Try again; not a member → the standard not-found page; actions in progress keep their sheet open; offline banner disables every action while the list stays readable.
- **3.4. Post Detail / Feedback Screen (UC-16)**
  - **Purpose:** Viewing the detailed discussion and ratings for a specific recommendation.
  - **Key UI:** The primary song card at the top, a large average rating display, and a scrolling list of individual member reviews (User, Star Rating, Text Comment, Timestamp).
- **3.5. Join Community / Invite Preview (UC-15)**
  - **Purpose:** What a friend sees when they open an invite link — signed in or not, with an account or not.
  - **Key UI:** The community's generated cover, name and member count under "You're invited to". Signed out: the Google sign-in with "Continue with Google to join"; a new user completes their profile and returns here. Signed in: a "Join community" button, or "You're already in this community." with an Open link.
  - **States:** loading skeleton; joining ("Joining…"); invalid or reset link (the UC-15 message, with a link home); other load failure (Try again); offline (Join disabled).

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
  - **Key UI:** The fields are editable in place: the avatar, Display Name (with the same live availability check as onboarding) and Preferred Streaming Service. One "Save changes" button, enabled only once something changed, sends only the changed fields and toasts "Profile updated". A visible "Sign out" button at the bottom.
  - **Avatar:** with the Google photo in use, "Use generated avatar" (the photo is deleted). With the generated avatar, a Google button fetches the current photo through a fresh Google sign-in from the same account; a different account or an account with no photo shows an inline message.
  - **States:** a name problem shows on the name's status line, other save failures inline above Save; offline shows a banner and disables Save and the avatar actions, while Sign out stays available.

### 5. Administration (UC-19)

Reachable only by an onboarded user whose `users.role` is `ADMIN` (set in the database). Everyone else - signed-out visitors included - gets the standard not-found page at every `/admin` URL, so the area is never confirmed to exist. Full detail: `docs/features/admin-panel.md`.

- **5.1. Admin Screen (UC-19)**
  - **Purpose:** Let the owner see who uses BookRough and which communities exist, and adjust presentation settings.
  - **Entry:** an "Admin area" link on My Profile, shown only to admins.
  - **Key UI:** heading "Admin" and tabs, each with its own URL:
    - **Users** (`/admin/users`): a count, then one row per user - avatar, display name (or "Not finished signing up"), an "Admin" badge, service, join date, number of communities. No email exists to show; a Google photo appears only if the user chose it.
    - **Communities** (`/admin/communities`): a count, then one row per community - generated cover, name, member count, created date, owner's display name (or "No owner").
    - **Settings** (`/admin/settings`): an on/off switch and text (up to 140 characters) for the announcement banner; five named accent colours as swatches; the Welcome tagline (up to 80 characters) with "Reset to default". One "Save changes", enabled only once something changed and everything is valid, sends only what changed and toasts "Settings saved"; field problems show under the field, other failures inline; offline disables Save. Below, the last 20 changes, e.g. "Ofri changed the accent colour from Purple to Green", with "Deleted account" for an author whose account is gone.
  - List rows are read-only; nothing opens a profile or a community, and nothing deletes anything.
  - **How the settings apply** (everywhere, not just here): the app fetches them at start without waiting on them, defaults until then or on failure. The accent colour is applied app-wide by name; the tagline is Welcome's subtitle; the banner is a slim plain-text bar at the top of every tabbed screen for signed-in users, dismissible, and shown again when its text changes. Other users get a change on their next app load.
  - **States:** skeleton rows while loading; "No communities yet."; an inline error with Try again; a `403` (role removed mid-session) turns the area into the not-found page.

### 6. Cross-Cutting UI Conventions

These apply to every screen above and are not restated per screen.

- **Language: English only.** All copy, labels, errors, and empty states are in English. There is no internationalisation layer and no RTL support.
- **Mobile-first.** Every layout is designed at 375px width first and expanded upward with Tailwind's `sm:` / `md:` / `lg:` prefixes. The primary surface is an iPhone running the installed PWA; the desktop browser is secondary. Touch targets are at least 44x44px.
- **No image uploads.** Avatars and community covers are generated from initials and a colour derived deterministically from the entity id. Google users may choose the picture Google supplies during onboarding; the generated avatar is the default. No screen contains an upload control.
- **Three states, always.** Every screen that waits on the network defines a loading state (skeleton or spinner), an empty state, and an error state. A blank area is not a loading state.
- **The posting flow blocks.** Link conversion takes 3-8 seconds and the submit button blocks for its duration behind a spinner with explanatory copy. This is a designed wait, not an accident.
- **Offline.** Installed as a PWA, previously loaded content stays readable without a connection. Write actions (post, rate, bookmark) show an explicit "you're offline" state rather than failing silently or queueing invisibly. See `docs/deployment.md` §6.

