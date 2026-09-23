## Use Cases

### UC-1: User Registration

- **Description:** A new user creates an account using **Google Sign-In** and completes onboarding by choosing a username, display name, and music preferences.
- **Pre-conditions:** The user has a Google account and does not yet have a BookRough account linked to it.
- **Post-conditions:** A new User record is created containing their id, `google_sub`, username, display name, and preferred service. **No email address is stored.** The user is authenticated and logged in.
- **Trigger:** The user opens the app and taps "Continue with Google".
- **Step-by-step scenario (Success):**
  - The user taps "Continue with Google" on the Welcome screen.
  - The Google popup opens and the user grants consent.
  - The frontend receives a Google identity token and posts it to the backend.
  - The backend verifies the token signature and audience with Google, then reads the `sub` claim. **The `email` claim is discarded and never written to the database.**
  - No user exists for that `sub`, so the backend creates one and issues an app session JWT.
  - The system routes the user to the "Complete Your Profile" screen to choose a username, a display name, and a Preferred Streaming Service (Spotify, Apple Music, YouTube, Tidal, Deezer).
  - The user submits; the system saves the profile and routes them to the Communities Dashboard.
- **Fail description (Alternative Scenario):** The user chooses a username that is already taken. The system halts the profile step and displays "That username is already taken." The account row already exists at this point, so the user stays on the onboarding screen until a valid username is supplied rather than being sent back to the start.

> **Note.** Registration and login are the same button. A returning user whose `sub` is already known is simply logged in (UC-2); a new `sub` becomes a new account. There is no separate "Sign Up" path and no email/password option — see `docs/auth.md`.

### UC-2: User Login

- **Description:** An existing user accesses their account via **Google Sign-In**. This is the only login method.
- **Pre-conditions:** The user previously registered, and is currently logged out.
- **Post-conditions:** The user's identity is verified, a session JWT is issued as an HttpOnly cookie, and the user reaches their dashboard.
- **Trigger:** The user opens the app and taps "Continue with Google".
- **Step-by-step scenario (Success):**
  - The user taps "Continue with Google".
  - The Google popup opens and returns an identity token to the frontend.
  - The frontend posts the token to the backend.
  - The backend verifies it with Google and looks up the user by the `sub` claim.
  - A matching user is found; the backend issues an app session JWT.
  - The system redirects the user to their Communities Dashboard.
- **Fail description (Alternative Scenario):** The Google token fails verification — it is expired, malformed, or was issued for a different audience. The backend returns `401`, no session is created, and the UI shows "Sign-in failed. Please try again."

> **Account recovery is Google's responsibility, not ours.** Because no email address and no password are stored, a user who permanently loses access to their Google account cannot be recovered by BookRough, and support cannot identify them. This is the accepted cost of not holding user email addresses.

### UC-3: User Logout

- **Description:** A currently authenticated user securely terminates their active session on the application.
- **Pre-conditions:** The user is currently logged into the application with an active, valid session.
- **Post-conditions:** The user's active session is completely terminated on both the client and server sides. The user must re-authenticate to access protected features.
- **Trigger:** The user taps or clicks the "Logout" button, typically found within their profile or settings menu.
- **Step-by-step scenario (Success):**
- The user navigates to their profile or settings page.
- The user clicks the "Logout" button.
- The system prompts the user to confirm their action (optional).
- Upon confirmation, the backend invalidates the user's session token.
- The frontend clears any cached local user data and redirects the user to the public Welcome screen.
- **Fail description (Alternative Scenario):** The user attempts to log out, but their session token has already expired on the server (e.g., due to prolonged inactivity). The system detects the invalid token when the logout request is made, clears the local client data anyway, and drops the user back at the Welcome screen with a brief message stating "Session expired."

### UC-4: User Edits Account Details

- **Description:** An authenticated user updates their personal profile information, such as their display name, profile picture, or their preferred music streaming service.
- **Pre-conditions:** The user is logged into their account with an active session.
- **Post-conditions:** The user's updated information is successfully saved in the database and immediately reflected across the application's user interface.
- **Trigger:** The user navigates to the "Settings" or "Edit Profile" screen and modifies one or more fields.
- **Step-by-step scenario (Success):**
  - The user navigates to their profile screen and selects "Edit Profile".
  - The user changes their Preferred Streaming Service from Spotify to Apple Music.
  - The user's avatar is regenerated automatically from their display name; there is nothing to upload.
  - The user clicks the "Save Changes" button.
  - The system validates the inputs (display name length, username uniqueness, a recognised streaming service).
  - The backend updates the User record in the database.
  - The system displays a "Profile updated successfully" toast notification and returns the user to their refreshed profile view.
- **Fail description (Alternative Scenario):** The user attempts to save a username that is already taken by another account. The system prevents the save action and displays an inline error message: "That username is already taken."

> **Note on profile pictures.** Avatars are **generated**, not uploaded — initials over a colour derived deterministically from the user id. Users who signed in with Google keep the picture Google supplies. There is no upload control anywhere in the product; see `docs/general.md` §4.1.

### UC-5: User Searches Other Users

- **Description:** A user searches the platform's directory to find other individuals using their username or display name.
- **Pre-conditions:** The user is logged into the application.
- **Post-conditions:** The system displays a list of user profiles that match the search query, allowing the searching user to view them or take further action.
- **Trigger:** The user taps the search icon/bar, types a query, and submits the search.
- **Step-by-step scenario (Success):**
  - The user taps the global search bar in the application header.
  - The user types a name (e.g., "Danny").
  - The system queries the database for User records where the username or display name partially or fully matches the input.
  - The system populates a results list displaying the matching users' profile pictures and names.
  - The user taps on a specific result to view that person's full profile and rating history.
- **Fail description (Alternative Scenario):** The user searches for a username that does not exist in the database or contains invalid special characters. The system completes the search but returns an empty state graphic with the text: "No users found matching this search. Try a different name."

### UC-6: User Sends Friendship Request

- **Description:** A user initiates a connection with another individual on the platform by sending them a friend request.
- **Pre-conditions:** The user is logged in, has navigated to the profile of a user they are not currently friends with, and no pending request already exists between them.
- **Post-conditions:** A pending relationship status is created in the database, and a notification is dispatched to the receiving user.
- **Trigger:** The user clicks or taps the "Add Friend" button on another user's profile.
- **Step-by-step scenario (Success):**
  - The user views the profile of a non-friend user.
  - The user taps the "Add Friend" button.
  - The system creates a pending request record in the database linking the two user IDs.
  - The UI instantly updates the button state from "Add Friend" to "Request Sent" or "Pending".
  - The system sends an in-app notification (and optionally a push notification) to the target user informing them of the new request.
- **Fail description (Alternative Scenario):** The target user has specific privacy settings enabled that prevent them from receiving incoming friend requests from strangers, or the target user has previously blocked the sender. When the user views the profile, the "Add Friend" button is either hidden entirely or disabled, preventing the trigger action from occurring.

### UC-7: User Accepts/Ignores a Friend Request

- **Description:** A user responds to an incoming friend request by either accepting the connection or dismissing (ignoring) it.
- **Pre-conditions:** The user is logged in and has at least one unresolved, pending friend request in their notifications or dedicated "Friends" tab.
- **Post-conditions:** If accepted, the database updates the relationship status to "Friends" for both users. If ignored, the pending request is deleted from the database. The notification is cleared in both cases.
- **Trigger:** The user taps either the "Accept" or "Ignore" button associated with a specific friend request.
- **Step-by-step scenario (Success - Accept):**
  - The user navigates to their pending friend requests list.
  - The user taps the "Accept" button next to a requester's name.
  - The backend updates the social graph, establishing a bidirectional "Friend" link between the two user IDs.
  - The system removes the request from the pending list.
  - The system notifies the original sender that their request was accepted. Both users can now easily invite each other to Communities.
- **Fail description (Alternative Scenario - Sender Deleted Account):** The user taps "Accept" on a request, but the user who originally sent the request has since deleted their account. The backend fails to find the sender's user ID. The system removes the "ghost" request from the UI and displays a brief error toast: "This request is no longer valid as the user account does not exist."

### UC-8: User Deletes a Friend

- **Description:** A user removes an existing friend from their connections list, severing the bidirectional social link between them.
- **Pre-conditions:** The user is logged in and currently has an established "Friend" relationship with the target user.
- **Post-conditions:** The relationship record is removed from the database. The users are no longer connected, which may restrict direct interactions depending on privacy settings.
- **Trigger:** The user navigates to their friends list or the target user's profile and taps the "Remove Friend" or "Unfriend" button.
- **Step-by-step scenario (Success):**
  - The user navigates to their dedicated "Friends" list.
  - The user selects the "Remove Friend" option next to the target user's name.
  - The system prompts the user with a confirmation dialog to prevent accidental deletions.
  - The user confirms the action.
  - The backend severs the connection in the database.
  - The UI updates instantly, removing the user from the friends list.
- **Fail description (Alternative Scenario):** A network connectivity drop occurs exactly as the user confirms the deletion. The backend request fails or times out. The system catches the timeout, leaves the friend in the list, and displays a temporary error banner: "Action failed. Please check your internet connection and try again."

### UC-9: User Creates a Group (Community)

- **Description:** A user creates a new Community to act as a group space for sharing music and invites their friends to join.
- **Pre-conditions:** The user is logged into the application.
- **Post-conditions:** A new Community record is created in the database containing an id and name. The creating user is automatically designated as a Community Admin.
- **Trigger:** The user taps the "Create Community" or "New Group" button from the main navigation or Communities tab.
- **Step-by-step scenario (Success):**
  - The user taps the "Create Community" button.
  - The system presents a creation form.
  - The user inputs the Community Name and Description. The cover graphic is generated from the name and id — there is no image to upload.
  - The system presents the user's friends list, allowing them to select friends to invite.
  - The user submits the form.
  - The backend creates the Community, assigns the creator as Admin, and generates unique invite links for the selected friends.
  - The user is redirected to the newly created Community's main feed.
- **Fail description (Alternative Scenario):** The user attempts to create the group without providing a required "Name" field. The system disables the final submit button, highlights the empty Name field in red, and displays helper text: "A Community name is required."

### UC-10: User Leaves a Group (Community)

- **Description:** A user voluntarily exits a Community they are currently a member of.
- **Pre-conditions:** The user is logged in and is actively listed in the members array of the target Community.
- **Post-conditions:** The user's ID is removed from the Community's members array. The user loses access to view, post, or rate songs within that specific Community.
- **Trigger:** The user taps the "Leave Community" button located within the Community's settings or options menu.
- **Step-by-step scenario (Success):**
  - The user navigates to the Community feed.
  - The user taps the context menu (e.g., three dots) to access Community options.
  - The user selects "Leave Community".
  - The system prompts for final confirmation ("Are you sure you want to leave this community?").
  - The user confirms.
  - The backend processes the request and removes the user's ID from the members array.
  - The user is automatically redirected back to their main Communities list or dashboard.
- **Fail description (Alternative Scenario):** The user is the sole Admin of the Community and attempts to leave. The system blocks the action to prevent the group from becoming orphaned. A modal appears stating: "You are the only Admin. Please assign another member as Admin or delete the Community before leaving."

### UC-11: User Sends a Message to a Friend/Group Chat (Post Recommendation)

- **Description:** A user shares a message in the form of a music recommendation (with optional text comments) to a Community feed.
- **Pre-conditions:** The user is logged in and is an active member of the Community where they are attempting to post.
- **Post-conditions:** A new Post record is added to the database containing the authorId, communityId, and songMetadata. The post is pushed to the posts array of the Community.
- **Trigger:** The user pastes a URL into the Community's input field and taps "Post" or "Send".
- **Step-by-step scenario (Success):**
  - The user opens the target Community.
  - The user pastes a link to a song/album from their preferred streaming service (e.g., Spotify) into the input area.
  - The user optionally types a text comment alongside the link.
  - The user taps "Post".
  - The backend automatically processes the link, identifies the song, fetches metadata (Artist, Title, Cover Art), and generates a "Universal Link".
  - The system publishes the post to the Community feed.
  - When other members view the post, the link automatically directs them to the specific service they defined in their own preferences.
- **Fail description (Alternative Scenario):** The user pastes a broken URL or a link that does not point to a supported music service. The backend attempts to fetch the metadata but fails. The system prevents the post from being published and alerts the user: "Invalid link. We couldn't retrieve the song information. Please ensure it's a valid link from a supported streaming service."

### UC-12: User Adds a Recommendation to Bookmarks ("Listen Later")

- **Description:** A user saves a music recommendation posted by a friend or community member to their personal "Listen Later" list for future listening.
- **Pre-conditions:** The user is logged in, viewing a Community feed, and sees a song recommendation post that they have not already bookmarked.
- **Post-conditions:** The specific Post ID is added to the user's bookmarks list in the database. The user interface updates to reflect that the song is saved.
- **Trigger:** The user taps the "Bookmark" or "Save for Later" icon located on a specific music recommendation post.
- **Step-by-step scenario (Success):**
  - The user browses the feed of one of their Communities.
  - The user spots a song recommendation they want to save for later.
  - The user taps the "Bookmark" icon on that specific post.
  - The backend processes the request and links the Post ID to the user's personal bookmarks collection.
  - The UI provides immediate visual feedback, changing the bookmark icon's state (e.g., from an outline to a filled icon) and displaying a brief "Added to Listen Later" toast notification.
- **Fail description (Alternative Scenario):** The user's device loses internet connectivity right as they tap the bookmark icon. The backend request fails to reach the server. The application catches the network error, reverts the icon back to its unsaved state, and displays an error banner: "Failed to save. Please check your connection and try again."

### UC-13: User Processes a Bookmarked Recommendation (Rate & Feedback)

- **Description:** A user accesses their "My List" screen, listens to a saved song, submits a rating with optional text feedback, and the system notifies the friend who recommended it.
- **Pre-conditions:** The user is logged in and has at least one unrated, saved song residing in their "My List" screen.
- **Post-conditions:** A Rating object (containing the score and optional comment) is appended to the original Post. The song is removed from the user's active "Listen Later" queue. A notification is dispatched to the author of the original post.
- **Trigger:** The user taps the "Rate" or "Mark as Listened" button on a song within their "My List" screen.
- **Step-by-step scenario (Success):**
  - The user navigates to the dedicated "My List" view to see their bookmarked songs.
  - The user taps on a saved song, which automatically directs them to their preferred streaming service to listen to it.
  - Returning to the app, the user taps the action button to rate the specific bookmark.
  - The system prompts the user to select a rating on a scale of 1 to 10 stars.
  - The user selects a star rating and optionally inputs a text comment into the feedback field.
  - The user submits the rating.
  - The backend creates a new Rating object associated with the Post and removes the item from the user's "My List".
  - The backend triggers a notification to the user who originally posted the recommendation (e.g., "[User] rated your recommendation 8 stars!").
- **Fail description (Alternative Scenario - Post Deleted):** The user attempts to rate a song from their "My List," but the original recommendation post was deleted by its author or a Community Admin while it was sitting in the user's queue. When the user submits the rating, the backend returns a "Post not found" error. The app removes the "ghost" bookmark from the UI and informs the user: "This recommendation is no longer available as the original post was deleted."

### UC-14: Admin Removes a User from a Community

- **Description:** A user with administrative privileges in a Community revokes another user's membership, removing their access to the group's feed and shared music.
- **Pre-conditions:** The acting user is logged in, holds Admin status within the specific Community, and the target user is currently listed in the Community's members array.
- **Post-conditions:** The target user's ID is removed from the Community's members array, and the Community ID is removed from the target user's communities array.
- **Trigger:** The Admin taps the "Remove User" or "Kick" button next to a specific member's name in the Community's member management screen.
- **Step-by-step scenario (Success):**
  - The Admin navigates to the specific Community's settings and opens the "Members" list.
  - The Admin locates the target user and taps the context menu next to their name.
  - The Admin selects "Remove from Community".
  - The system prompts the Admin with a confirmation dialog: "Are you sure you want to remove [User] from this community?"
  - The Admin confirms the action.
  - The backend successfully updates the database arrays.
  - The UI instantly removes the user from the Admin's visible member list.
- **Fail description (Alternative Scenario):** The Admin attempts to remove another user who also holds Admin privileges. The system prevents the removal and displays an error message: "Cannot remove an Admin. You must demote this user to a standard member before removing them."

### UC-15: User Joins a Community (via Invite Link)

- **Description:** A user gains access to a private or public Community by clicking a unique invitation link generated by a Community Admin.
- **Pre-conditions:** The user has the application installed, is logged into their account, and has received a valid, unexpired invite link (e.g., via SMS or external messaging).
- **Post-conditions:** The user is added to the Community's members array and gains immediate access to view, rate, and post recommendations in that group.
- **Trigger:** The user taps the unique invite URL on their device.
- **Step-by-step scenario (Success):**
  - The user clicks the external invite link.
  - The device's OS routes the link to the installed application (Deep Linking).
  - The app opens and displays a "Join Community" preview screen, showing the Community Name, Cover Image, and member count.
  - The user taps the "Join Community" button.
  - The backend validates the invite token and updates the database, linking the user ID and Community ID.
  - The system redirects the user directly into the newly joined Community's main feed.
- **Fail description (Alternative Scenario):** The user clicks an invite link that the Admin has since revoked or that has exceeded its expiration date. The app opens to the preview screen, but instead of joining, it displays an error state: "This invite link is invalid or has expired. Please request a new link from the Community Admin."

### UC-16: User Views Post Feedback (Ratings and Comments)

- **Description:** A user expands a specific music recommendation post to view the accumulated star ratings and text comments left by other community members.
- **Pre-conditions:** The user is logged in, viewing a Community feed, and the target post has at least one rating attached to it.
- **Post-conditions:** The user interface displays a detailed breakdown of the post's feedback, including the average score and individual member reviews.
- **Trigger:** The user taps on the body of a specific post card (avoiding the external music link itself) or taps a dedicated "View Ratings" button.
- **Step-by-step scenario (Success):**
  - The user scrolls through the Community feed and identifies a post of interest.
  - The user taps the post to open the detailed view.
  - The system queries the database for the ratings array associated with that specific Post ID.
  - The UI renders the detailed view, displaying the calculated average star rating prominently at the top.
  - Below the average, the system lists individual rating entries, displaying the rater's username, their specific star score (1-10), their optional text comment, and the timestamp.
- **Fail description (Alternative Scenario):** A database lag occurs while fetching the ratings array for a highly popular post. The system displays a loading skeleton or spinner for 3 seconds. If the fetch times out, the system displays a placeholder: "Could not load comments at this time. Pull to refresh."

### UC-17: *(withdrawn)* User Resets Password

> **This use case has been withdrawn and is intentionally left numbered so that UC-18 keeps its identity.**
>
> BookRough stores no passwords and no email addresses: Google Sign-In is the only authentication method (UC-1, UC-2). There is therefore nothing to reset and no address to send a reset link to. The `password_resets` table has been removed from the schema, and the Forgot Password and Create New Password screens have been removed from the screen catalog.
>
> Password recovery is handled entirely by Google, outside this application.

### UC-18: User Deletes a Post (Song Recommendation)

- **Description:** The original author of a music recommendation permanently removes their post from a Community feed.
- **Pre-conditions:** The user is logged in, viewing a Community feed, and their User ID matches the authorId of the target Post.
- **Post-conditions:** The Post record, including its associated ratings array, is permanently deleted from the database and removed from the Community's posts array.
- **Trigger:** The user taps the "Delete Post" option within the specific post's context menu.
- **Step-by-step scenario (Success):**
  - The user locates a post they previously authored in the feed.
  - The user taps the context menu (e.g., three dots) on their post.
  - The user selects "Delete Post" from the dropdown.
  - The system prompts the user with a destructive action warning: "Are you sure you want to delete this recommendation? This will also delete all ratings and comments associated with it."
  - The user confirms the deletion.
  - The backend deletes the Post record and cascades the deletion to any child data.
  - The UI instantly removes the post from the visible feed.
- **Fail description (Alternative Scenario):** The user's device loses network connectivity immediately after confirming the deletion. The backend request fails. The system catches the error, leaves the post visible in the feed, and displays a temporary error banner: "Could not delete post. Check your connection and try again."

### UC-19: Administrator Manages the Application

- **Description:** The application owner signs into an administrative area to review the user base and adjust presentation configuration without touching the database directly.
- **Pre-conditions:** The user is authenticated and their `users.role` is `ADMIN`.
- **Post-conditions:** The requested configuration change is persisted and takes effect for all users. The action is recorded in an audit trail.
- **Trigger:** An administrator navigates to the admin area.
- **Step-by-step scenario (Success):**
  - The administrator signs in through the normal Google flow (UC-2).
  - The system recognises the `ADMIN` role and exposes the admin area; it is invisible and inaccessible to everyone else.
  - The administrator views the user list: username, display name, preferred service, join date, and activity counts.
  - The administrator adjusts a presentation setting (for example a theme colour or a piece of static copy).
  - The system saves the change, records who made it and when, and applies it for all users.
- **Fail description (Alternative Scenario):** A non-admin user navigates directly to an admin URL or calls an admin endpoint. The backend returns `403` and the frontend shows the standard not-found page rather than confirming that an admin area exists.

> **Privacy constraint — the reason this use case exists in this form.** The user list **cannot show an email address, because none is stored** (UC-1). Nothing in the admin area identifies a real person: it shows only what the user chose to display. This is a deliberate data-minimisation decision, not an oversight.
>
> **Honest limit:** this reduces *incidental* exposure. It is not a cryptographic guarantee — the operator runs the server and can change the code. The protection is that there is no personal data in the system to expose in the first place.
>
> **Scope detail is deliberately not specified here.** Exactly which settings are configurable, and what the audit trail records, are decided in this feature's specification session and written to `docs/features/admin-panel.md` before implementation begins.
