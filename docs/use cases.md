## Use Cases

### UC-1: User Registration

- **Description:** A new user creates an account using **Google Sign-In** and completes onboarding by choosing a display name and a preferred streaming service.
- **Pre-conditions:** The user has a Google account and does not yet have a BookRough account linked to it.
- **Post-conditions:** A new User record is created containing their id, `google_sub`, display name, and preferred service. **No email address is stored.** The user is authenticated and logged in.
- **Trigger:** The user opens the app, chooses "Create account" and taps "Sign up with Google".
- **Step-by-step scenario (Success):**
  - The user chooses "Create account" on the Welcome screen and taps "Sign up with Google". (On an invite link, "Create account" is already chosen.)
  - The Google popup opens and the user grants consent.
  - The frontend receives a Google identity token and posts it to the backend.
  - The backend verifies the token signature and audience with Google, then reads the `sub` claim. **The `email` claim is discarded and never written to the database.**
  - No user exists for that `sub`, so the backend creates one and issues an app session JWT.
  - The system routes the user to the "Complete Your Profile" screen to choose a display name (any language, unique) and a Preferred Streaming Service (Spotify, Apple Music, YouTube, Tidal, Deezer).
  - The user submits; the system saves the profile and routes them to the Communities Dashboard.
- **Fail description (Alternative Scenario):** The user chooses a display name that is already taken. The system halts the profile step and displays "That display name is already taken." The account row already exists at this point, so the user stays on the onboarding screen until an available display name is supplied rather than being sent back to the start.

> **Note.** Registration and login are two choices, "Create account" and "Sign in", above one Google button (amended 2026-11-08, `docs/features/sign-in-sign-up.md`). "Create account" for a `sub` that already has an account simply signs in, with "You already have an account. Signing you in." There is still no email/password option — see `docs/auth.md`.

### UC-2: User Login

- **Description:** An existing user accesses their account via **Google Sign-In**. This is the only login method.
- **Pre-conditions:** The user previously registered, and is currently logged out.
- **Post-conditions:** The user's identity is verified, a session JWT is issued as an HttpOnly cookie, and the user reaches their dashboard.
- **Trigger:** The user opens the app and, with "Sign in" chosen, taps "Sign in with Google".
- **Step-by-step scenario (Success):**
  - The user taps "Sign in with Google".
  - The Google popup opens and returns an identity token to the frontend.
  - The frontend posts the token to the backend.
  - The backend verifies it with Google and looks up the user by the `sub` claim.
  - A matching user is found; the backend issues an app session JWT.
  - The system redirects the user to their Communities Dashboard.
- **Fail description (Alternative Scenario):** The Google token fails verification — it is expired, malformed, or was issued for a different audience. The backend returns `401`, no session is created, and the UI shows "Sign-in failed. Please try again." If no account exists for that Google account, the backend creates nothing and answers `404`; the UI says "No account for this Google account yet." and offers "Create account", which creates it with the same token, without a second Google popup.

> **Account recovery is Google's responsibility, not ours.** Because no email address and no password are stored, a user who permanently loses access to their Google account cannot be recovered by BookRough, and support cannot identify them. This is the accepted cost of not holding user email addresses.

### UC-3: User Logout

- **Description:** A currently authenticated user securely terminates their active session on the application.
- **Pre-conditions:** The user is currently logged into the application with an active, valid session.
- **Post-conditions:** The user's active session is completely terminated on both the client and server sides. The user must re-authenticate to access protected features.
- **Trigger:** The user taps or clicks the "Logout" button, found in the Home screen's header and at the bottom of My Profile.
- **Step-by-step scenario (Success):**
- The user is on Home, the screen the app opens on, or on My Profile.
- The user clicks "Sign out" in the Home header, or at the bottom of My Profile.
- The system asks "Sign out?", and Cancel leaves the user signed in. Offline, the confirmation is disabled ("You're offline. Connect to sign out."), because only the server can end the session.
- Upon confirmation, the backend invalidates the user's session token.
- The frontend clears any cached local user data and redirects the user to the public Welcome screen.
- **Fail description (Alternative Scenario):** The user attempts to log out, but their session token has already expired on the server (e.g., due to prolonged inactivity). The system detects the invalid token when the logout request is made, clears the local client data anyway, and drops the user back at the Welcome screen with a brief message stating "Session expired."

### UC-4: User Edits Account Details

- **Description:** An authenticated user updates their personal profile information, such as their display name, profile picture, or their preferred music streaming service.
- **Pre-conditions:** The user is logged into their account with an active session.
- **Post-conditions:** The user's updated information is successfully saved in the database and immediately reflected across the application's user interface.
- **Trigger:** The user navigates to the "Settings" or "Edit Profile" screen and modifies one or more fields.
- **Step-by-step scenario (Success):**
  - The user opens My Profile from the Profile tab; the fields are editable in place.
  - The user changes their Preferred Streaming Service from Spotify to Apple Music.
  - The user's avatar is regenerated automatically from their display name; there is nothing to upload.
  - The user clicks the "Save changes" button, enabled only once something has changed.
  - The system validates the inputs (display name length and uniqueness, a recognised streaming service).
  - The backend updates the User record in the database.
  - The system displays a "Profile updated" toast notification and the screen shows the saved values.
- **Fail description (Alternative Scenario):** The user attempts to save a display name that is already taken by another account. The system prevents the save action and displays an inline error message: "That display name is already taken."

> **Note on profile pictures.** Avatars are **generated**, not uploaded — initials over a colour derived deterministically from the user id. Users may choose the picture Google supplies during onboarding; the generated avatar is the default, and a declined photo is not stored. On My Profile the avatar can be switched both ways: "Use generated avatar" deletes the stored photo, and going back to the Google photo requires a fresh Google sign-in from the same account, which fetches the current photo (`docs/features/profile-settings.md` §4). Since 2026-11-08 a user may also upload their own photo on My Profile; the server re-encodes it to a small WebP without metadata (`docs/features/avatar-upload.md`). Community covers stay generated.

### UC-5: User Searches Other Users

- **Description:** A user searches the platform's directory to find other individuals using their display name.
- **Pre-conditions:** The user is logged into the application.
- **Post-conditions:** The system displays a list of user profiles that match the search query, allowing the searching user to view them or take further action.
- **Trigger:** The user opens the Search tab and types part of a name; the search runs as they type.
- **Step-by-step scenario (Success):**
  - The user opens the Search tab in the bottom tab bar.
  - The user types a name (e.g., "Danny").
  - The system looks through every user who has finished onboarding for a display name that contains the input, ignoring case, spacing and accents. Names that start with the input come first; at most 20 are shown, with a hint to type more.
  - The system populates a results list displaying the matching users' profile pictures and names.
  - The user taps on a specific result to view that person's profile: their avatar, name and streaming service, and their ratings in the communities the two of them share — never ratings from a community the searching user is not in. The same profile opens from any name on a post, a rating or a community's member list (`docs/features/find-people.md`).
- **Fail description (Alternative Scenario):** The user searches for a name that does not exist in the database or contains characters no name can contain. The system completes the search without an error and returns an empty state graphic with the text: "No users found matching this search. Try a different name."

### UC-6: User Sends Friendship Request

- **Description:** A user initiates a connection with another individual on the platform by sending them a friend request.
- **Pre-conditions:** The user is logged in, has navigated to the profile of a user they are not currently friends with, and no pending request already exists between them.
- **Post-conditions:** A pending relationship status is created in the database, and a notification is dispatched to the receiving user.
- **Trigger:** The user clicks or taps the "Add Friend" button on another user's profile.
- **Step-by-step scenario (Success):**
  - The user views the profile of a non-friend user.
  - The user taps the "Add Friend" button.
  - The system creates a pending request record in the database linking the two user IDs.
  - The UI updates the button from "Add Friend" to "Request sent". If the target had already sent the user a request, it is accepted instead and both become friends. The sender may cancel a pending request from the same profile.
  - The target user sees a badge counting pending requests on the Friends tab — the in-app notification; a log-only stub marks where a push channel would plug in (`docs/features/friend-requests.md`).
- **Fail description (Alternative Scenario):** The target account no longer exists or has not finished onboarding: the request is refused with "User not found." Any signed-in user may send a request to anyone else — there are no privacy settings and no blocking (withdrawn by decision, `docs/features/friend-requests.md` §10); an unwanted request is ignored (UC-7).

### UC-7: User Accepts/Ignores a Friend Request

- **Description:** A user responds to an incoming friend request by either accepting the connection or dismissing (ignoring) it.
- **Pre-conditions:** The user is logged in and has at least one unresolved, pending friend request in their notifications or dedicated "Friends" tab.
- **Post-conditions:** If accepted, the database updates the relationship status to "Friends" for both users. If ignored, the pending request is deleted from the database; the sender is not told, sees "Add Friend" again, and may send a new request. The Friends tab badge drops in both cases.
- **Trigger:** The user taps either the "Accept" or "Ignore" button associated with a specific friend request.
- **Step-by-step scenario (Success - Accept):**
  - The user opens the Friends tab, whose badge counts pending requests; requests are listed first, newest first.
  - The user taps the "Accept" button next to a requester's name.
  - The backend updates the social graph, establishing a bidirectional "Friend" link between the two user IDs.
  - The system removes the request from the pending list.
  - The system notifies the original sender that their request was accepted (a log-only stub for now), and both see each other under "Your friends". Inviting friends to a community arrives with Phase 5, Step 5.5 (UC-9's picker).
- **Fail description (Alternative Scenario - Sender Deleted Account):** The user taps "Accept" on a request, but the user who originally sent the request has since deleted their account. The backend fails to find the sender's user ID. The system removes the "ghost" request from the UI and displays a brief error toast: "This request is no longer valid as the user account does not exist." A request that was cancelled or answered elsewhere meanwhile shows "This request is no longer available." instead.

### UC-8: User Deletes a Friend

- **Description:** A user removes an existing friend from their connections list, severing the bidirectional social link between them.
- **Pre-conditions:** The user is logged in and currently has an established "Friend" relationship with the target user.
- **Post-conditions:** The relationship record is removed from the database. The users are no longer connected. Direct recommendations between them stay visible to both; nothing new can be sent, and a new rating or an edit is refused until they are friends again (UC-20). The other person is not told; either of them may send a new request later (`docs/features/unfriend.md`).
- **Trigger:** The user taps the ⋯ next to the friend on the Friends tab, or the "Friends" button on the friend's profile.
- **Step-by-step scenario (Success):**
  - The user opens the Friends tab (or the friend's profile).
  - The user taps the ⋯ next to the friend's name (or the "Friends" button on the profile).
  - The system prompts the user with a confirmation dialog to prevent accidental deletions.
  - The user confirms the action.
  - The backend severs the connection in the database.
  - The UI updates instantly, removing the user from the friends list.
- **Fail description (Alternative Scenario):** A network connectivity drop occurs exactly as the user confirms the deletion. The backend request fails or times out. The system catches the timeout, leaves the friend in the list, and displays a temporary error toast: "Action failed. Please check your internet connection and try again."

### UC-9: User Creates a Group (Community)

- **Description:** A user creates a new Community to act as a group space for sharing music and invites their friends to join.
- **Pre-conditions:** The user is logged into the application.
- **Post-conditions:** A new Community record is created in the database containing an id and name. The creating user becomes its Owner — an Admin who cannot be demoted or removed and who alone can delete the community.
- **Trigger:** The user taps the "Create Community" or "New Group" button from the main navigation or Communities tab.
- **Step-by-step scenario (Success):**
  - The user taps the "Create Community" button.
  - The system presents a creation form.
  - The user inputs the Community Name and Description. The cover graphic is generated from the name and id — there is no image to upload.
  - The system presents the user's friends list, allowing them to select friends to invite.
  - The user submits the form.
  - The backend creates the Community and makes the creator its Owner. The selected friends each receive an invitation on their Friends tab, which they accept (joining as Members) or decline; nobody is added without saying yes. Admins can invite more friends later from the community's Invite friends panel (`docs/features/invite-friends.md`).
  - The user is redirected to the newly created Community's page (its feed, once posts exist in Phase 3).
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
- **Fail description (Alternative Scenario):** The user is the community's Owner and attempts to leave. The system blocks the action so the community is never left without an owner: "You're the owner. Transfer ownership to another member or delete the community before leaving." Admins and members can always leave; leaving never blocks them from rejoining.

### UC-11: User Posts a Recommendation to a Community

- **Description:** A user shares a music recommendation — a song or album link from Spotify, Apple Music, YouTube, Tidal or Deezer — or a track, album or set from Bandcamp or SoundCloud, or a YouTube video of a live performance, shared without conversion — with an optional comment of up to 280 characters — to a Community feed. Sending one to a single friend is UC-20.
- **Pre-conditions:** The user is logged in and is an active member of the Community where they are attempting to post.
- **Post-conditions:** A new Post record is added to the database containing the authorId, communityId, and songMetadata. The post is pushed to the posts array of the Community. The author may later edit the comment, never the song; an edited comment shows "· edited" (docs/features/edit-post-comment.md).
- **Trigger:** The user pastes a URL into the Community's input field and taps "Post" or "Send".
- **Step-by-step scenario (Success):**
  - The user opens the target Community.
  - The user pastes a link to a song/album from their preferred streaming service (e.g., Spotify) into the input area.
  - The user optionally types a text comment alongside the link.
  - The user taps "Post".
  - The backend converts the link through squigly.link while the user sees "Finding this track on other services…", fetching the metadata (Artist, Title, Cover Art) and the matching link on each supported service.
  - The system publishes the post to the Community feed.
  - When other members view the post, its main button opens it in the service they defined in their own preferences, falling back to the original link when that service has no match; "Other services" lists every link found.
  - A Bandcamp or SoundCloud link is never converted: the server reads its title, artist and cover from the platform, and the post's one button reads "Listen on Bandcamp" or "Listen on SoundCloud" for every viewer. A YouTube link converts as before; when squigly.link finds it on no other service — a live session such as KEXP or NPR Tiny Desk — it is kept as a video with one "Watch on YouTube" button (`docs/features/link-only-posts.md`).
- **Fail description (Alternative Scenario):** The user pastes a broken URL, a link that is not a song or album on a supported service (a playlist, an artist), a link squigly.link answers "could not be found" for (a YouTube video is refused only when YouTube itself confirms it is gone, and is otherwise saved as a video), or a Bandcamp or SoundCloud link the platform answers "not found" for. The system prevents the post from being published, keeps the draft, and alerts the user: "Invalid link. We couldn't retrieve the song information. Please ensure it's a valid link from a supported streaming service." If the conversion cannot run at all — squigly.link unreachable, slower than the 12-second ceiling, or its page unreadable — the post is still published with the original link and a quiet "Other services unavailable" note, and its author can tap "Find on other services" later.

### UC-12: User Adds a Recommendation to Bookmarks ("Listen Later")

- **Description:** A user saves a music recommendation posted by a friend or community member to their personal "Listen Later" list for future listening.
- **Pre-conditions:** The user is logged in, viewing a Community feed or a direct recommendation (UC-20), and sees a song recommendation post that they have not already bookmarked, written by someone else: a user cannot bookmark their own post.
- **Post-conditions:** The specific Post ID is added to the user's bookmarks list in the database. The user interface updates to reflect that the song is saved. The bookmark is private: nobody else can see who saved a post. It stays in the user's list if they later leave the Community or are removed from it. Once the user has rated a post, it can no longer be bookmarked (UC-13).
- **Trigger:** The user taps the "Bookmark" or "Save for Later" icon located on a specific music recommendation post.
- **Step-by-step scenario (Success):**
  - The user browses the feed of one of their Communities.
  - The user spots a song recommendation they want to save for later.
  - The user taps the "Bookmark" icon on that specific post.
  - The backend processes the request and links the Post ID to the user's personal bookmarks collection.
  - The UI provides immediate visual feedback, changing the bookmark icon's state (e.g., from an outline to a filled icon) and displaying a brief "Added to Listen Later" toast notification.
- **Fail description (Alternative Scenario):** The user's device loses internet connectivity right as they tap the bookmark icon. The backend request fails to reach the server. The application catches the network error, reverts the icon back to its unsaved state, and displays an error banner: "Failed to save. Please check your connection and try again." Tapping the filled icon again removes the bookmark ("Removed from Listen Later"). If the post was deleted meanwhile, the icon reverts and the user is told "This post is no longer available." (`docs/features/bookmarks-my-list.md`)

### UC-13: User Processes a Bookmarked Recommendation (Rate & Feedback)

- **Description:** A user accesses their "My List" screen, listens to a saved song, submits a rating with optional text feedback, and the system notifies the friend who recommended it.
- **Pre-conditions:** The user is logged in and has at least one unrated, saved song residing in their "My List" screen, and is still a member of that song's Community, or for a direct recommendation still friends with its sender (UC-20), who may also rate it from Received. A song from a Community the user has left or been removed from shows "You're no longer in {Community}" instead of the rate button.
- **Post-conditions:** A Rating object (containing the score and optional comment) is appended to the original Post. The song is removed from the user's active "Listen Later" queue. A notification is dispatched to the author of the original post (for now a logged stub; a real channel arrives later, `docs/features/rate-post.md` §4.2). The rater can later edit the score and comment from Post Detail (UC-16), and the feed shows the rater "You rated n/10" on the post.
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
- **Fail description (Alternative Scenario - Post Deleted):** The user attempts to rate a song from their "My List," but the original recommendation post was deleted by its author or a Community Admin while it was sitting in the user's queue. When the user submits the rating, the backend returns a "Post not found" error. The app removes the "ghost" bookmark from the UI and informs the user: "This recommendation is no longer available as the original post was deleted." A second rating of the same post (from another tab) is refused with "You already rated this post." and the song leaves the list; a user can never rate their own post.

### UC-14: Admin Removes a User from a Community

- **Description:** A user with administrative privileges in a Community revokes another user's membership, removing their access to the group's feed and shared music.
- **Pre-conditions:** The acting user is logged in, holds Admin status within the specific Community, and the target user is currently listed in the Community's members array.
- **Post-conditions:** The target user is removed from the Community and blocked: they lose access to its feed, and no invite link lets them rejoin (they see the UC-15 invalid-link message) until an Admin unblocks them from the Community Settings & Members screen. Their posts in this Community are deleted with the removal, permanently; leaving voluntarily (UC-10) keeps a member's posts. Songs the removed user had already saved from this Community stay in their My List (`docs/features/bookmarks-my-list.md` §3.2). Their ratings in this Community are deleted with the removal too, permanently; leaving keeps them (`docs/features/post-detail.md` §3.1).
- **Trigger:** The Admin taps the "Remove User" or "Kick" button next to a specific member's name in the Community's member management screen.
- **Step-by-step scenario (Success):**
  - The Admin navigates to the specific Community's settings and opens the "Members" list.
  - The Admin locates the target user and taps the context menu next to their name.
  - The Admin selects "Remove from Community".
  - The system prompts the Admin with a confirmation dialog: "Are you sure you want to remove [User] from this community?"
  - The Admin confirms the action.
  - The backend successfully updates the database arrays.
  - The UI instantly removes the user from the Admin's visible member list.
- **Fail description (Alternative Scenario):** The Admin attempts to remove another user who also holds Admin privileges. The system prevents the removal and displays an error message: "Cannot remove an Admin. You must demote this user to a standard member before removing them." The Owner cannot be removed or demoted at all; ownership only moves when the Owner transfers it. When a member is made an Admin, or receives ownership, they are notified (UC-21, `docs/features/role-notifications.md`); a demotion stays silent.

### UC-15: User Joins a Community (via Invite Link)

- **Description:** A user gains access to a private or public Community by clicking a unique invitation link generated by a Community Admin.
- **Pre-conditions:** The user has received a valid invite link (e.g., via SMS or external messaging). They do not need to be signed in, or even to have an account: the preview offers Google sign-in, and a new user completes their profile and is brought back to it.
- **Post-conditions:** The user is added to the Community's members array and gains immediate access to view, rate, and post recommendations in that group.
- **Trigger:** The user taps the unique invite URL on their device.
- **Step-by-step scenario (Success):**
  - The user clicks the external invite link.
  - The link opens BookRough in the browser. (On iPhone that is Safari: iOS does not route links into an installed home-screen app. Membership is stored on the server, so the community appears in the installed app as well.)
  - The app opens and displays a "Join Community" preview screen, showing the Community Name, Cover Image, and member count.
  - The user taps the "Join Community" button.
  - The backend validates the invite token and updates the database, linking the user ID and Community ID.
  - The system redirects the user directly into the newly joined Community's page (its feed, once posts exist in Phase 3).
- **Fail description (Alternative Scenario):** The user clicks an invite link that an Admin has since reset. The preview screen displays an error state instead: "This invite link is invalid or has expired. Please request a new link from the Community Admin."

> **Who has the link.** Each community has one invite link. Only its Admins can see it, share it, and reset it; resetting is what "revoked" means, and there is no expiry date. Joining twice is harmless: an existing member is told they are already in and taken to the community. Specified in docs/features/communities-invites.md. Alongside the link, Admins can invite their friends in the app; a pending invitation is cleared when the person joins by the link or is removed (`docs/features/invite-friends.md`).

### UC-16: User Views Post Feedback (Ratings and Comments)

- **Description:** A user expands a specific music recommendation post to view the accumulated star ratings and text comments left by other community members.
- **Pre-conditions:** The user is logged in, viewing a Community feed, and is a current member of the post's Community, or one of the two people a direct recommendation is between (UC-20). Ratings are visible to every member, whether or not they have rated themselves.
- **Post-conditions:** The user interface displays a detailed breakdown of the post's feedback, including the average score and individual member reviews.
- **Trigger:** The user taps on the body of a specific post card (avoiding the external music link itself) or taps a dedicated "View Ratings" button. The feed card also shows the average and the number of ratings.
- **Step-by-step scenario (Success):**
  - The user scrolls through the Community feed and identifies a post of interest.
  - The user taps the post to open the detailed view.
  - The system queries the database for the ratings array associated with that specific Post ID.
  - The UI renders the detailed view, displaying the calculated average star rating prominently at the top.
  - Below the average, the system lists individual rating entries, displaying the rater's display name, their specific star score (1-10), their optional text comment, and the timestamp.
- **Fail description (Alternative Scenario):** A database lag occurs while fetching the ratings array for a highly popular post. The system displays a loading skeleton or spinner for 3 seconds. If the fetch times out, the system displays a placeholder: "Could not load comments at this time." with Try again, while the post card stays visible. On this screen the user can edit their own rating, score and comment, with no "edited" marker (`docs/features/post-detail.md`).

### UC-17: *(withdrawn)* User Resets Password

> **This use case has been withdrawn and is intentionally left numbered so that UC-18 keeps its identity.**
>
> BookRough stores no passwords and no email addresses: Google Sign-In is the only authentication method (UC-1, UC-2). There is therefore nothing to reset and no address to send a reset link to. The `password_resets` table has been removed from the schema, and the Forgot Password and Create New Password screens have been removed from the screen catalog.
>
> Password recovery is handled entirely by Google, outside this application.

### UC-18: User Deletes a Post (Song Recommendation)

- **Description:** The original author of a music recommendation permanently removes their post from a Community feed. A Community's Admins and its Owner can delete any post in that Community the same way — a member's, a fellow Admin's, the Owner's, or a former member's (`docs/features/posts-delete.md`).
- **Pre-conditions:** The user is logged in, viewing a Community feed, and either their User ID matches the authorId of the target Post or they are an Admin or the Owner of that Community. A direct recommendation is deleted by its sender only, for both people; its recipient hides it instead (UC-20).
- **Post-conditions:** The Post record, including its associated ratings array, is permanently deleted from the database and removed from the Community's posts array.
- **Trigger:** The user taps the "Delete Post" option within the specific post's context menu.
- **Step-by-step scenario (Success):**
  - The user locates a post they previously authored in the feed.
  - The user taps the context menu (e.g., three dots) on their post.
  - The user selects "Delete Post" from the dropdown.
  - The system prompts the user with a destructive action warning: "Are you sure you want to delete this recommendation? This will also delete all ratings and comments associated with it." An Admin deleting someone else's post is asked instead: "Delete [Author]'s recommendation? This will also delete all ratings and comments on it. [Author] won't be notified."
  - The user confirms the deletion.
  - The backend deletes the Post record and cascades the deletion to any child data.
  - The UI instantly removes the post from the visible feed.
- **Fail description (Alternative Scenario):** The user's device loses network connectivity immediately after confirming the deletion. The backend request fails. The system catches the error, leaves the post visible in the feed, and displays a temporary error banner: "Could not delete post. Check your connection and try again." If someone else deleted the post first, it simply disappears with "This post was already deleted." A plain member can never delete another member's post: the server refuses it.

### UC-19: Administrator Manages the Application

- **Description:** The application owner signs into an administrative area to review the user base and adjust presentation configuration without touching the database directly.
- **Pre-conditions:** The user is authenticated and their `users.role` is `ADMIN`.
- **Post-conditions:** The requested configuration change is persisted and takes effect for all users. The action is recorded in an audit trail.
- **Trigger:** An administrator navigates to the admin area.
- **Step-by-step scenario (Success):**
  - The administrator signs in through the normal Google flow (UC-2).
  - The system recognises the `ADMIN` role and exposes the admin area; it is invisible and inaccessible to everyone else.
  - The administrator views the user list: display name, preferred service, join date, and activity counts.
  - The administrator adjusts a presentation setting (for example a theme colour or a piece of static copy).
  - The system saves the change, records who made it and when, and applies it for all users.
- **Fail description (Alternative Scenario):** A non-admin user navigates directly to an admin URL or calls an admin endpoint. The backend returns `403` and the frontend shows the standard not-found page rather than confirming that an admin area exists.

> **Privacy constraint — the reason this use case exists in this form.** The user list **cannot show an email address, because none is stored** (UC-1). Nothing in the admin area identifies a real person: it shows only what the user chose to display. This is a deliberate data-minimisation decision, not an oversight.
>
> **Honest limit:** this reduces *incidental* exposure. It is not a cryptographic guarantee — the operator runs the server and can change the code. The protection is that there is no personal data in the system to expose in the first place.
>
> **Decided scope** (`docs/features/admin-panel.md`). The area shows two read-only lists - users and communities - and three presentation settings: an announcement banner for signed-in users, an accent colour from a fixed palette, and the Welcome tagline. Every settings change is recorded with who made it, the old and new value, and when, and the last 20 changes are shown on the settings screen. The admin can delete, suspend or edit nobody — the one exception is removing a user's photo, which returns them to the generated avatar (`docs/features/avatar-upload.md`) — and the settings list is fixed in code.

### UC-20: User Sends a Recommendation to a Friend

- **Description:** A user sends a music recommendation — the same song or album link and optional comment as a post — directly to one friend, with no community in common. The recipient sees it in their own streaming service. Posting to a Community (UC-11) is unchanged and exists alongside this.
- **Pre-conditions:** The user is logged in, has finished onboarding, and has an accepted friendship with the recipient.
- **Post-conditions:** A Post record with a recipient and no community exists, visible only to the two of them. The sender may edit its comment while they are friends (docs/features/edit-post-comment.md). The recipient is notified (UC-21), and the Recommendations row counts it until they open Received. The item stays visible to both after unfriending; a new rating or an edit then needs friendship again.
- **Trigger:** The user taps "Send a song" on the Recommendations screen or on a friend's profile.
- **Step-by-step scenario (Success):**
  - The user opens Recommendations from the Friends tab and taps "Send a song", then picks one friend. From a friend's profile, that friend is already chosen.
  - The user pastes a link and optionally adds a comment of up to 280 characters.
  - The user taps "Send". The backend converts the link exactly as for a post, while the user sees "Finding this track on other services…".
  - The system saves the item and shows "Sent to {name}". It appears under Sent.
  - The recipient sees a notification (UC-21), opens Recommendations, and finds it under Received. Its main button opens the service they chose, falling back to the original link.
  - The recipient can rate it there, save it to My List, or hide it. The sender sees the rating under Sent and on Post Detail.
- **Fail description (Alternative Scenario):** The recipient is not a friend — a stranger, a pending request in either direction, or someone who unfriended the sender, even during the conversion. The system refuses with "You can only send songs to friends.", saves nothing, and keeps the draft. A link that is invalid is refused as in UC-11, and Bandcamp, SoundCloud and live YouTube videos are shared without conversion exactly as there (`docs/features/link-only-posts.md`). If the conversion cannot run, the item is still saved with the original link and a quiet "Other services unavailable" note, and the sender can tap "Find on other services" later.

> **Not a chat.** One friend per send, one sender comment, one rating comment, and no replies. A recipient hides an item for themselves only, and the sender is not told; the sender deletes it for both. Specified in docs/features/direct-recommendations.md.

### UC-21: User Receives Notifications

- **Description:** A user is told, inside the app, when something concerns them: a new post in one of their communities (grouped per community while unread), a direct recommendation (UC-20), the first rating of their post (UC-13), a friend request or an accepted one (UC-6, UC-7), an invitation to a community (UC-9), being made an admin or the owner of one (UC-14), or a reply to them in a discussion (UC-22). There is no push and no email.
- **Pre-conditions:** The user is logged in and has finished onboarding.
- **Post-conditions:** Each event leaves a notification for the person it concerns. Reading one marks only that one; "Mark all as read" marks the rest. The user never sees a notification about a community they no longer belong to or a post they can no longer open.
- **Trigger:** A count on the Home tab, or the bell in the Home header.
- **Step-by-step scenario (Success):**
  - A friend posts in a community the user belongs to.
  - The Home tab and the bell in the Home header show a count.
  - The user taps the bell and sees "Dana posted in Friday Jazz", newest first, with unread rows marked.
  - The user taps it: it is marked read, the count drops, and the community's feed opens.
  - More posts in the same community while it is unread share one row: "3 new posts in Friday Jazz".
- **Fail description (Alternative Scenario):** The user is offline: the list shows what was last loaded, and marking read is disabled with "You're offline. Connect to mark them as read." If a notification cannot be written, the post, rating, request or invitation that caused it is still saved; only the notice is lost. A user removed from a community stops seeing its notifications. Specified in docs/features/notifications.md.

### UC-22: User Discusses a Recommendation

- **Description:** Anyone who can see a post comments on it without rating, or replies to someone's review. Each post comment and each review opens one flat thread; a reply to a reply joins the same thread, labelled with who it answers.
- **Pre-conditions:** The user is logged in, has finished onboarding, and can see the post: a member of its community, or one of the two people a direct recommendation is between, while they are still friends.
- **Post-conditions:** The comment is saved and shown to everyone who can see the post. The person replied to (the post's author for a post comment) is notified (UC-21), grouped per post while unread. The author may edit it (marked "· edited") or delete it; a community's admins and owner may delete any comment there.
- **Trigger:** "Add a comment" in the Discussion on Post Detail, or "Reply" under a review or comment.
- **Step-by-step scenario (Success):**
  - Noam opens a post in Friday Jazz and reads Dana's review.
  - He taps Reply under it, writes "You'd love their live version" and sends.
  - The reply appears in the review's thread, and Dana's bell shows "Noam replied to you on Blue".
  - Dana opens it, lands on the post, and replies back in the same thread.
- **Fail description (Alternative Scenario):** An empty comment or one over 500 characters is refused before sending. Offline, Send and Reply are disabled with "You're offline. Connect to comment." A reply to a comment deleted meanwhile is refused with "That comment is gone." After unfriending, a direct recommendation's discussion stays readable but takes no new comments. A deleted comment with replies reads "Comment deleted" and keeps its thread. Specified in docs/features/discussion-threads.md.
