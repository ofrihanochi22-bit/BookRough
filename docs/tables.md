### Database Table Definitions

Below is the detailed breakdown of each table, including column types and constraints.

### 1. users Table

Stores the core authentication and profile data.
- **id** (UUID, Primary Key): Unique identifier for the user.
- **google_sub** (VARCHAR, Unique, Not Null): The `sub` claim from the Google identity token. **This is the account key.** It is stable for the lifetime of the Google account and is opaque — it identifies the account to Google, not a person to us.
- **display_name** (VARCHAR(50), Nullable until onboarding): The one user-chosen name, shown everywhere and used for search. Free text in any language (Hebrew, emoji, spaces), editable later, and unique through `display_name_key`. There is deliberately no separate `username`: profile URLs use `id`, so no URL-safe handle is needed.
- **display_name_key** (VARCHAR(50), Unique, Nullable): Hidden, server-derived normalised form of `display_name` (whitespace collapsed, lower-cased). It carries the uniqueness, so "Ofri" and "ofri " collide while each is still shown as typed. Never sent to a client.
- **profile_picture_url** (VARCHAR, Nullable): The `picture` URL supplied by Google. Held before onboarding only so it can be offered as a choice; kept afterwards only if the user chose it (`use_google_picture`), otherwise set to null and never stored again. When null the UI shows the generated avatar.
- **use_google_picture** (BOOLEAN, Not Null, Default false): The user chose their Google photo as their avatar during onboarding. False means the generated avatar.
- **preferred_service** (ENUM, Nullable until onboarding): 'SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE', 'TIDAL', 'DEEZER'. Deliberately no default, so "has not chosen" stays distinguishable from "chose Spotify".
- **role** (ENUM, Not Null, Default 'USER'): 'USER' or 'ADMIN'. Gates the administrative area (UC-19). Not editable through any API — it is set directly in the database.
- **created_at** (TIMESTAMP, Default Current Time).
- **updated_at** (TIMESTAMP, Not Null): Set on every write. Added in Phase 1; the admin area will use it.

> **🔴 There is deliberately no `email` column and no `password_hash` column.**
>
> Google Sign-In is the only authentication method, so no password exists to hash. Google's `name` claim (the person's real name) is discarded the same way as `email`; the only name stored is the `display_name` the user chooses. The `email` claim returned in the Google identity token is **read for verification and then discarded** — it is never written to the database, never logged, and never exposed through any endpoint including the admin area (UC-19).
>
> This is a data-minimisation decision: the operator should not hold user email addresses. The consequences are accepted knowingly:
> - The application can never send email to a user.
> - A user who loses access to their Google account cannot be recovered, and support cannot identify them.
> - Account linking across providers is moot, because there is only one provider.
>
> Do not add an email column back without an explicit new decision recorded here and in `docs/auth.md`.

### 2. communities Table

Stores the group details.
- **id** (UUID, Primary Key).
- **name** (VARCHAR, Not Null): Name of the group.
- **description** (TEXT, Nullable): Group bio or rules.
- **invite_token** (VARCHAR(64), Unique, Nullable): the community's one invite link (UC-15). 128 random bits, base64url. Created the first time an Admin asks for the link; replaced when an Admin resets it, which kills the old link at once. No expiry. A secret: returned only to Admins, never logged, never in any other response.
- **created_at** (TIMESTAMP, Default Current Time).
- **updated_at** (TIMESTAMP, updated automatically on every change).

No cover image column: covers are always generated from the name and id (CLAUDE.md §8). Names are not unique — communities are found by invite, never by name.

### 3. community_members Table (Junction Table)

Resolves the many-to-many relationship between users and communities.
- **user_id** (UUID, Foreign Key referencing users(id)).
- **community_id** (UUID, Foreign Key referencing communities(id)).
- **role** (ENUM CommunityRole, Not Null, Default 'MEMBER'): 'OWNER', 'ADMIN' or 'MEMBER'. Exactly one OWNER per community — the creator, until ownership is transferred — enforced by a partial unique index (community_members_one_owner, hand-written in a migration because Prisma cannot express it; `prisma db push` would drop it, so the project only uses migrations). The owner counts as an admin everywhere, cannot be demoted or removed, and alone can delete the community (UC-10, UC-14).
- **joined_at** (TIMESTAMP, Default Current Time).
- **updated_at** (TIMESTAMP, updated automatically on every change).
- (Composite Primary Key: user_id, community_id to prevent duplicate memberships. An index on community_id serves member counts. Both foreign keys cascade on delete, so removing a user or a community removes its memberships.)

### 4. friends Table

Manages the bidirectional social graph and pending requests (UC-6, UC-7, UC-8).
- **requester_id** (UUID, Foreign Key referencing users(id)): The person who sent the invite.
- **addressee_id** (UUID, Foreign Key referencing users(id)): The person receiving the invite.
- **status** (ENUM, Not Null): 'PENDING', 'ACCEPTED'. Accepting updates the row in place; ignoring, cancelling or removing a friend (UC-8) deletes it. An updated_at timestamp is set on every write — for a friendship, when it was accepted.
- **created_at** (TIMESTAMP, Default Current Time).
- (Composite Primary Key: requester_id, addressee_id. One row per pair in either direction, enforced by the hand-written unique index friends_one_per_pair on the LEAST and GREATEST of the two ids; the hand-written CHECK friends_not_self forbids a row to yourself. Both live in the add_friends migration and are invisible to Prisma (`docs/features/friend-requests.md` §3). Indexed on addressee_id, status and created_at, newest first, for incoming requests and the Friends tab badge. Both foreign keys cascade, so deleting either user deletes the row — UC-7's ghost request.)

### 5. posts Table

The core entity for music recommendations (UC-11, `docs/features/posts-feed.md` §3). Metadata and links come from the link converter (squigly.link); all of them are null while `conversion_pending` is true.
- **id** (UUID, Primary Key).
- **author_id** (UUID, Foreign Key referencing users(id)).
- **community_id** (UUID, Foreign Key referencing communities(id)).
- **original_url** (VARCHAR(2048), Not Null): The link the user pasted, trimmed. Always present — the fallback link every viewer can open.
- **source_service** (ENUM `StreamingService`, Not Null): The service the pasted link belongs to, derived from its host.
- **kind** (ENUM `PostKind`, Nullable): `TRACK` or `ALBUM`, from squigly's JSON-LD type; null while pending.
- **song_title** (VARCHAR(300), Nullable): From the link converter; for an album, the album name.
- **song_artist** (VARCHAR, Nullable).
- **song_cover_art_url** (VARCHAR, Nullable).
- **universal_link_spotify** (VARCHAR(2048), Nullable): Output from the link converter — one column per `StreamingService`, so every viewer gets their own service.
- **universal_link_apple** (VARCHAR, Nullable).
- **universal_link_youtube** (VARCHAR, Nullable): squigly's YouTube Music link.
- **universal_link_tidal** (VARCHAR, Nullable).
- **universal_link_deezer** (VARCHAR, Nullable).
- **text_comment** (TEXT, Nullable): The author's optional comment — at most 280 characters, line breaks kept.
- **created_at** (TIMESTAMP, Default Current Time).
- **conversion_pending** (BOOLEAN, Default false): True when the conversion could not run (squigly.link down, a timeout, an unreadable page); the author can retry it.
- **updated_at** (TIMESTAMP): Set on every write.
- (Indexed on community_id, created_at and id, newest first, for the feed; and on author_id, community_id, for removal. Cascades: deleting the community or the author deletes the posts; removing a member deletes their posts in that community — UC-14.)

### 6. ratings Table

Stores the feedback on specific posts (UC-13, UC-16, `docs/features/rate-post.md` §3). A rating is final once written.
- **id** (UUID, Primary Key).
- **post_id** (UUID, Foreign Key referencing posts(id)).
- **user_id** (UUID, Foreign Key referencing users(id)): The person leaving the review.
- **score** (SMALLINT, Not Null): An integer from 1 to 10, checked by the API and by the hand-written database constraint ratings_score_range.
- **comment** (TEXT, Nullable): Optional text feedback, at most 280 characters, line breaks kept.
- **created_at** (TIMESTAMP, Default Current Time).
- (Unique Constraint on post_id and user_id to ensure a user can only rate a specific post once; indexed on user_id, created_at and id, newest first, for a user's ratings — a Public Profile's history (`docs/features/find-people.md` §3) — and the rater's own score. Cascades: deleting the post, its community or the rater deletes the rating. A rating is kept when its rater leaves the community, and deleted when they are removed from it (UC-14, `docs/features/post-detail.md` §3.1). An updated_at timestamp records edits and is not shown.)

### 7. bookmarks Table

Powers the "Listen Later" queue (UC-12, `docs/features/bookmarks-my-list.md` §3). Private: only its user ever sees a bookmark, and no count of savers exists.
- **user_id** (UUID, Foreign Key referencing users(id)).
- **post_id** (UUID, Foreign Key referencing posts(id)).
- **created_at** (TIMESTAMP, Default Current Time): when it was saved; My List lists newest first.
- (Composite Primary Key: user_id, post_id, so a post is saved at most once per user. Indexed on user_id, created_at and post_id, newest first, for My List; and on post_id, for the cascade. Cascades: deleting the post or the user deletes the bookmark. A bookmark is kept when its user leaves or is removed from the post's community.)

### 8. community_bans Table

People removed from a community, who cannot rejoin through any invite link until an admin unblocks them (UC-14). Every removal creates a row; leaving voluntarily does not.
- **community_id** (UUID, Foreign Key referencing communities(id), cascade on delete).
- **user_id** (UUID, Foreign Key referencing users(id), cascade on delete).
- **banned_by_id** (UUID, Nullable, Foreign Key referencing users(id), set to null if that admin's account is deleted): who removed them.
- **created_at** (TIMESTAMP, Default Current Time).
- (Composite Primary Key: community_id, user_id).

### 9. app_settings Table

The administrative area's presentation settings (UC-19, `docs/features/admin-panel.md` §3.2). One row per setting that has ever been changed; a missing row means the default.
- **key** (ENUM `SettingKey`, Primary Key): `ANNOUNCEMENT`, `ACCENT_COLOR` or `WELCOME_TAGLINE`. The list is fixed; a new setting needs a new spec, never just a new row.
- **value** (JSONB, Not Null): validated in code against the setting's rules before every write - the announcement is `{ enabled, text }` (plain text, at most 140 characters), the accent colour a palette name (`purple`, `blue`, `green`, `orange`, `pink`), the tagline plain text of 1-80 characters. A stored value that fails the rules reads as the default.
- **updated_at** (TIMESTAMP, Not Null): set on every write.

### 10. setting_changes Table

The history of settings changes. Rows are inserted, never updated or deleted by the app.
- **id** (UUID, Primary Key).
- **key** (ENUM `SettingKey`, Not Null): which setting.
- **old_value** (JSONB, Not Null): the value it replaced (the default if the setting had never been changed).
- **new_value** (JSONB, Not Null): the value after.
- **changed_by_id** (UUID, Nullable, Foreign Key referencing users(id), set to null if that admin's account is deleted): who changed it; the entry outlives the account.
- **changed_at** (TIMESTAMP, Default Current Time). Indexed newest first, for "the last 20 changes".

### 11. community_invitations Table

Pending invitations to join a community, sent by its Admins to their friends (UC-9's picker, `docs/features/invite-friends.md` §3). A row is deleted once accepted or declined.
- **community_id** (UUID, Foreign Key referencing communities(id), cascade on delete).
- **user_id** (UUID, Foreign Key referencing users(id), cascade on delete): the invited person.
- **invited_by_id** (UUID, Nullable, Foreign Key referencing users(id), set to null if that admin's account is deleted): who invited them; the invitation outlives the inviter's role and account.
- **created_at** (TIMESTAMP, Default Current Time).
- (Composite Primary Key: community_id, user_id, so a person is invited at most once per community. Indexed on user_id and created_at, newest first, for their invitations and the Friends tab badge; and on invited_by_id, for the set-null. Joining by the invite link or being removed from the community deletes a pending invitation.)

> **The former table 8 (`password_resets`) has been removed.** It existed to hold recovery tokens emailed to users. With no passwords and no email addresses there is nothing to recover and nowhere to send a link, so the table, the endpoints, and the screens that used it are all withdrawn (UC-17).
>
> **The schema is eleven tables:** `users`, `communities`, `community_members`, `community_bans`, `friends`, `posts`, `ratings`, `bookmarks`, `app_settings`, `setting_changes`, `community_invitations`.
>
> The administrative area's settings (`app_settings`, `setting_changes`) were designed in that feature's specification session - `docs/features/admin-panel.md`.
