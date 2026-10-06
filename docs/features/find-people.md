# Feature: Find people

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                               |
| ------------- | ----------------------------------------------------------------------------- |
| **Use cases** | UC-5 (search users, view their profile and rating history); UC-5 amended (§9) |
| **Phase**     | 5 — Step 5.1 of `DEVELOPMENT.md` (re-sliced, §0)                              |
| **Branch**    | `feat/find-people`                                                            |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged            |

---

## 0. How Phase 5 was re-sliced

`DEVELOPMENT.md` split Phase 5 by layer: schema (5.1), routes (5.2), all UI (5.3), tests (5.4). None of those could merge alone under CLAUDE.md §11. They become three PRs (decided 2026-10-06, option A), each with its own spec session:

| #   | Feature                      | Former steps                                                                  | Spec            |
| --- | ---------------------------- | ----------------------------------------------------------------------------- | --------------- |
| 1   | **Find people** (UC-5)       | 5.2 (search route), 5.3 (Search, Public Profile)                              | this document   |
| 2   | Friend requests (UC-6, UC-7) | 5.1 (`friends`), 5.2 (request, accept, ignore), 5.3 (profile button, Friends) | its own session |
| 3   | Unfriend (UC-8)              | 5.2 (unfriend), 5.3 (Remove Friend)                                           | its own session |

Step 5.4 dissolves: every feature ships its own tests (§15). The `friends` table is created by feature 2, the first feature that writes it. UC-9's friends picker on Create Community is not in any of the three; it is raised in feature 2's session.

## 1. Goal

A signed-in user opens the **Search** tab — until now a "Coming soon" screen — types part of a name, and sees every user whose display name contains it, ignoring case and accents. Tapping a result opens that person's **Public Profile**: their avatar, display name, the service they listen on, and the ratings they have left in communities the viewer is in, newest first, each opening its Post Detail. The same profile opens from anywhere a person's name already appears: a post's author, a rater on Post Detail, a member in Community Settings. Nothing here creates or changes data; the friend button arrives with feature 2.

## 2. Scope

**In scope**

- `GET /api/users/search?q=` — the whole directory, partial match (developer's choice, option A) (§4).
- `GET /api/users/:userId` — a Public Profile (§4).
- `GET /api/users/:userId/ratings` — their ratings in communities the viewer is in, keyset-paginated (developer's choice, option B) (§4).
- The Search screen replacing the tab's Coming soon, and the Public Profile screen at `/users/:userId` (§5).
- Names become profile links on feed cards and Post Detail (the author), Post Detail's rating rows (the rater), and Community Settings' member list (developer's choice, option B) (§5.3).
- Schema: the ratings-by-user index gains its sort order, for the history's keyset (§3).
- Logs no longer carry query strings: a search term is someone's name (§4, Logging).
- Doc updates (§9) and the Phase 5 re-slice in `DEVELOPMENT.md`.

**Out of scope** — deliberately

- Any friend state or button on the profile — feature 2 (UC-6). Until then the profile has no action.
- Hiding yourself from search, blocking, privacy settings (the directory is open by decision, option A). UC-6's "privacy settings" fail path belongs to feature 2's session.
- Showing the communities you share, their posts (recommendations), their join date, their role or admin status.
- Ratings from communities the viewer is not in (option C rejected: it leaks community content).
- Paging search results: at most 20, with a hint to type more (§4).
- Searching communities or songs; recent searches; suggestions ("people you may know").
- Names in the admin area becoming profile links (the admin lists are a separate surface, CLAUDE.md §17).
- Offline reading of search or profiles — arrives with the service worker in Phase 6.
- Visual design: every visual choice is a placeholder from existing tokens and primitives.

## 3. Data model changes

One index change, no new tables or columns.

Migration: `npx prisma migrate dev --create-only --name ratings_by_user_newest` (SQL inspected, applied, drift checked; `community_members_one_owner` and `ratings_score_range` confirmed present afterwards).

```prisma
model Rating {
  // …existing fields
  /// A user's ratings, newest first: the profile's history (find-people.md §3),
  /// `myScore`, and the account cascade.
  @@index([userId, createdAt(sort: Desc), id(sort: Desc)])   // replaces @@index([userId])
}
```

The new index starts with `user_id`, so it still serves `myScore` and the cascade when an account is deleted; the old one-column index is dropped rather than kept beside it.

Search needs no index: it scans `users.display_name_key` with `LIKE '%…%'`, which no B-tree serves. At the target scale (a handful of friend groups, CLAUDE.md §2) that is a sub-millisecond scan. A trigram index is the upgrade path if it ever matters.

## 4. API

All responses use the CLAUDE.md §4 envelope. All three endpoints require a signed-in, onboarded user: `requireAuth` on the route, and the service throws `403` "Finish your profile first." for a user mid-onboarding, as `community.service` and `invite.service` already do.

### Shapes

```ts
MemberUser {                       // existing — utils/communityMember.ts
  id: string;
  displayName: string;
  profilePictureUrl: string | null;
}

ProfileUser {                      // utils/profileUser.ts, field by field
  id: string;
  displayName: string;
  profilePictureUrl: string | null;
  preferredService: StreamingService;   // shown on the profile by decision (Q3); new to other users
}

ProfileRating {                    // utils/profileRating.ts, field by field
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  community: { id: string; name: string };
  post: {
    id: string;
    sourceService: StreamingService;
    kind: PostKind | null;
    title: string | null;
    artist: string | null;
    coverArtUrl: string | null;
    conversionPending: boolean;
  };
}
```

`ProfileUser` is the first shape that shows another user's `preferredService`. It still carries no `googleSub`, `displayNameKey`, `role`, `useGooglePicture`, `createdAt` or `updatedAt`. `ProfileRating.post` carries no links, author, comment or summary: the row is a pointer to Post Detail, which checks membership again.

### `GET /api/users/search?q=`

- **Request:** query `{ q: string }`, `.strict()`; `q` at most 200 characters. The server cleans it with the display-name cleaning (`cleanLine`) and derives its key with `displayNameKey` — so "OFRI", "ofri " and "Öfri" match the same people.
- **Behaviour:** every onboarded user (`display_name_key` not null) whose key **contains** the query's key, wildcards (`%`, `_`, `\`) matched literally. Ordered: names that **start with** the query first, then the rest, each alphabetically by key. At most **20**. The caller appears too, if they match (the client shows "You").
- **Success:** `200 { users: MemberUser[], hasMore: boolean }` — `hasMore` is true when more than 20 matched.
- **Errors:** `401`; `403` mid-onboarding (above); `422` "Type a name to search." — `q` missing, or blank after cleaning; `422` "The request query is invalid." — `q` over 200 characters or an unknown key. A query with characters no name can contain is not an error: it finds nobody (UC-5's fail path).

### `GET /api/users/:userId`

- **Success:** `200 { user: ProfileUser }`. The caller's own id works too (the client redirects to My Profile before asking).
- **Errors:** `401`; `403` mid-onboarding; `404` "User not found." — a malformed id, an unknown id, or a user who has not finished onboarding (they are not in the directory yet).

### `GET /api/users/:userId/ratings?before=`

- **Request:** query `{ before?: string }`, `.strict()` — the feed's opaque cursor (`encodeCursor` over the rating's `createdAt`, `id`).
- **Behaviour:** the target's ratings on posts in communities **the viewer is a current member of**, newest first, 20 per page (`PAGE_SIZE`). One query: `ratings.user_id = target AND post.community has a member row for the viewer`. A rating in a community the target has **left** is included (its members still see it on Post Detail); a community the viewer left drops out at once. On your own profile id, this is your history in your communities.
- **Success:** `200 { items: ProfileRating[], nextCursor: string | null }`.
- **Errors:** `401`; `403` mid-onboarding; `404` "User not found." (as above); `422` "The request query is invalid." — a cursor that does not decode, or an unknown key.

A stranger (no shared community) gets `200` with an empty list — not `403`: sharing no community is an ordinary state, and the profile itself is public by decision.

### Logging

- No new log lines: all three are reads.
- `redactPath` (used by the request logger and the error handler) now also replaces any query string with `?…`. A search term is a person's name, and `?name=` on the existing availability check is one too; cursors lose nothing by going. Invite tokens stay redacted as before.
- The request logger's serializer also drops pino-http's parsed `query` and `params` (they repeat the URL's name or token), and the logger removes the `referer` header: it is a page URL, so on a single-origin deployment it would carry `/search?q=<name>` or `/invite/<token>` (Stage 2, §10).

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 Search (`pages/Search.tsx`, route `/search`, replaces Coming soon)

- A heading "Search", and a search input (`type="search"`, label "Search people", placeholder "Display name"), focused on arrival.
- Searches **as you type**, 300 ms after the last keystroke; the query lives in the URL (`/search?q=…`, replace-navigation) so Back from a profile restores the results. Only the newest query's response is shown: a slower, older response that arrives late is dropped.
- Each result is one row — avatar, display name, and "You" on your own row — the whole row a link: to `/users/:id`, or `/profile` for yourself.
- **Before typing:** one line, "Find friends by their display name."
- **Loading:** three skeleton rows (the previous results are replaced, not dimmed).
- **Empty:** UC-5's copy — "No users found matching this search. Try a different name."
- **More than 20:** under the list, "Showing the first 20. Type more of the name to narrow it down."
- **Error:** `LoadError` — "Couldn't search right now." with Try again (re-runs the same query).
- **Offline:** the banner "You're offline. Connect to search." and the input disabled; results already on screen stay.

### 5.2 Public Profile (`pages/PublicProfile.tsx`, route `/users/:userId`, inside the tab layout)

- Your own id redirects to `/profile` (replace).
- **Header:** a large avatar, the display name as the heading, and "Listens on {service}" with the service's existing name from `lib/streamingServices.ts`. No action button in this feature.
- **Ratings** section, newest first. Each row links to `/posts/:postId`: the cover art (`CoverArt`, a placeholder when pending), the title and artist — or "Shared from {service}" for a pending post — the score "n/10", the comment (line breaks kept), and "in {community} · {relative time}". Load more at the end.
- The profile and its ratings load separately, so the header stays when the ratings fail (as Post Detail does).
- **Loading:** an avatar-and-name skeleton, and two rating-row skeletons.
- **Not found:** the standard not-found page.
- **Profile error:** `LoadError` with Try again.
- **Ratings empty:** "No ratings to show" / "You'll see {name}'s ratings from the communities you share."
- **Ratings error:** "Couldn't load ratings." with Try again, under the header. Load more failing keeps the loaded rows and shows the same message with Try again under them.
- **Offline:** nothing to disable (read-only); a failed load shows the error state.

### 5.3 Names become profile links

A shared helper (`lib/profileLinks.ts`) gives `/profile` for the viewer's own id and `/users/:id` otherwise. In each place, the avatar and name together become one link, at least 44 px tall:

- `PostCard` — the author line, in the feed and on Post Detail.
- Post Detail — each rating row's rater.
- Community Settings — each member row's avatar and name. The ⋯ menu stays a separate button beside it; the "You", "Owner" and "Admin" labels are unchanged. Blocked users stay plain text (they are not members).

### 5.4 Tab bar

`BottomNav`'s Search tab now opens the Search screen; its doc comment loses "Coming soon until Phase 5". `ComingSoon` is no longer routed anywhere — it is deleted, with its test usage in `TabLayout.test.tsx` replaced.

## 6. Edge cases & failure modes

- **Accents, case, spacing, geresh:** the query goes through the same `displayNameKey` as names, so "dani" finds "Daní" and "ג'ני" finds "ג׳ני".
- **Wildcards:** `%` or `_` in the query match those characters, not "anything" — escaped before the `LIKE`.
- **A query that cannot be a name** (emoji only, punctuation, 60 characters): searches normally and finds nobody — the empty state, never an error (UC-5).
- **A user mid-onboarding** has no `display_name_key`: never in results, and their profile is `404`.
- **A user renames** while you look at results: the next search shows the new name; the profile reads it fresh.
- **Typing fast:** only the newest query's response renders (§5.1). Tested by resolving responses out of order.
- **The viewer leaves or is removed from a community** while on a profile: the next page or reload drops those ratings; a tapped row's Post Detail shows not-found, as for any post you cannot see.
- **A post is deleted** after the history loaded: its rating is gone with it (cascade); a stale row leads to Post Detail's not-found.
- **The target was removed** from a community: removal already deleted their ratings there (post-detail.md §3.1), so none show.
- **Duplicate timestamps:** the keyset breaks ties on `id`, as the feed does.
- **Network drop mid-search:** the error state with Try again; the typed query stays in the field.
- **Admins:** an admin appears and is shown like anyone else — no role is exposed.

## 7. Test scenarios

**Unit — `profile.service` (search, profile, history)**

- ✅ Search matches part of a name, ignoring case and accents.
- ✅ Search orders names that start with the query first, then the rest, alphabetically.
- ✅ Search returns at most 20 and `hasMore: true` when 21 match; `false` at exactly 20.
- ✅ Search includes the caller when they match.
- ✅ Search treats `%` and `_` literally.
- ✅ Search finds nobody for a query no name contains (emoji, punctuation).
- ✅ Search finds nobody — no `422` — for a query of only combining marks or joiners (its key is empty).
- ❌ Search skips users who have not finished onboarding.
- ❌ Search with a blank query (after cleaning) throws `422` "Type a name to search."
- ❌ Search, profile and history throw `403` "Finish your profile first." for a caller mid-onboarding.
- ✅ Profile returns `ProfileUser` for an onboarded user, and for the caller's own id.
- ❌ Profile throws `404` for an unknown id and for a user mid-onboarding.
- ✅ History returns the target's ratings in communities the viewer is in, newest first, with the community and the post summary.
- ✅ History includes a rating in a community the target has left.
- ✅ History pages with the cursor, ties broken by id.
- ❌ History excludes ratings in communities the viewer is not in (including one the viewer left).
- ✅ History is empty, not an error, for a stranger.
- ❌ History throws `404` for an unknown or mid-onboarding target.
- ❌ History throws `422` for a cursor that does not decode.
- ✅ `redactPath` replaces a query string, keeps the path, and still redacts invite tokens.

**Unit — serialisers**

- ✅ `toProfileUser` has exactly its four keys (no `googleSub`, `displayNameKey`, `role`, dates).
- ✅ `toProfileRating` has exactly its keys; `post` has exactly its seven.

**Integration (Supertest)**

- ✅ `GET /users/search?q=` — `200` with matches and `hasMore`; each user has exactly `MemberUser`'s keys.
- ❌ `GET /users/search` — `422` without `q`, blank `q`, `q` over 200 characters, an unknown key.
- ❌ `GET /users/search` — `401` signed out; `403` mid-onboarding.
- ✅ `GET /users/:id` — `200` with exactly `ProfileUser`'s keys.
- ❌ `GET /users/:id` — `404` malformed id, unknown id, mid-onboarding target; `401` signed out.
- ✅ `GET /users/:id/ratings` — `200`, only shared-community ratings, paged with `nextCursor`.
- ✅ `GET /users/:id/ratings` — `200` empty for a stranger.
- ❌ `GET /users/:id/ratings` — `422` bad cursor; `404` unknown target; `401` signed out.
- ✅ The request log carries no searched name: `serializeRequest` drops `query` and `params` and redacts the URL, and the logger's redact paths remove the `referer` (unit-tested in `utils/redactPath.test.ts`, since the request logger is off under test).

**Component (Vitest + RTL)**

- ✅ Search: the hint before typing; results after typing (debounced), each a link; "You" on your own row, linking to `/profile`.
- ✅ Search: the "Showing the first 20" note when `hasMore`.
- ❌ Search: the UC-5 empty state.
- ❌ Search: the error state, and Try again re-runs the query.
- ❌ Search: an older response arriving after a newer one is not shown (proved failing without the guard).
- ❌ Search: offline banner and disabled input.
- ✅ Search: the query is restored from `?q=` on arrival.
- ✅ Public Profile: header (name, avatar, "Listens on …") and rating rows linking to Post Detail; a pending post reads "Shared from …".
- ✅ Public Profile: Load more appends the next page.
- ❌ Public Profile: not-found page on `404`; header error with Try again.
- ❌ Public Profile: ratings empty state with the name; ratings error under a header that stays.
- ✅ Public Profile: your own id redirects to `/profile`.
- ✅ `PostCard`: the author is a link to their profile (to `/profile` on your own post).
- ✅ Post Detail: each rater is a link.
- ✅ Community Settings: each member row's name is a link, and the ⋯ menu still opens separately.
- ✅ Tab bar: Search opens the Search screen (replaces the Coming soon test).

**E2E** — a golden loop: discovery is how friends connect.

- Two accounts share a community; B rates A's post. A opens the Search tab, types part of B's name, opens B's profile, sees that rating, and opens it to Post Detail. A third account that shares no community finds B by name and sees "No ratings to show". (Chromium and iPhone WebKit; isolated accounts, no global state.)

## 8. Open questions & risks

- None at approval.
- Risk, accepted by decision (Q2, option A): anyone who signs in can list every display name and avatar by searching letter by letter. No email or real name is stored (CLAUDE.md §5), so a name and an avatar are all that is exposed; a user who chose their Google photo exposes that photo.

## 9. Doc updates in this PR

- `docs/use cases.md` + `.docx`: UC-5 — the Search tab (not a header bar), the whole directory, case- and accent-insensitive partial match, at most 20 results, the profile's history limited to communities you share, profiles reachable from names elsewhere.
- `docs/frontend screens.md` + `.docx`: 2.1 (Search is no longer Coming soon), 2.2 Global Search (live search, its states), 2.4 Public User Profile (contents, states, the names that open it, no button until feature 2).
- `docs/tables.md` + `.docx`: `ratings` — the user index's sort order.
- `docs/features/post-detail.md`: Merged ticked.
- `DEVELOPMENT.md`: the Phase 5 re-slice and Step 5.1's entry per §13.

## 10. Decisions log

| Date       | Decision                                                                                                                                                                       | Reason                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | Phase 5 re-sliced into three features: Find people; Friend requests; Unfriend (option A)                                                                                       | Vertical slicing (§11); reviewable PRs, like Phase 4                                                                                                                            |
| 2026-10-06 | No `username`: search matches `display_name` through `display_name_key` only                                                                                                   | The column was dropped on 2026-10-01 (google-auth.md); Step 5.2's wording predates that                                                                                         |
| 2026-10-06 | Search covers the whole directory, partial match (option A)                                                                                                                    | Exactly UC-5; finds friends outside your groups. Enumeration of names and avatars is the accepted cost                                                                          |
| 2026-10-06 | The profile shows name, avatar, preferred service, and ratings in communities the viewer is in (option B)                                                                      | UC-5's rating history without leaking community content to non-members                                                                                                          |
| 2026-10-06 | No join date on the profile                                                                                                                                                    | Data minimisation; nothing asked for it                                                                                                                                         |
| 2026-10-06 | Profiles open from search and every name already shown: post authors, raters, community members (option B)                                                                     | "Who rated my song?" is how people find each other; the path to Add Friend in feature 2                                                                                         |
| 2026-10-06 | "Communities you share" means the viewer's current ones; the target's ratings in a community they left still show                                                              | The rule is "only what you could already see", and members still see those ratings on Post Detail                                                                               |
| 2026-10-06 | At most 20 search results with a "type more" hint; no paging                                                                                                                   | A friend-scale directory; a name narrows fast                                                                                                                                   |
| 2026-10-06 | Prefix matches first, then alphabetical                                                                                                                                        | Typing the start of a name is the common case                                                                                                                                   |
| 2026-10-06 | You appear in your own results as "You", linking to My Profile; your own profile id redirects there                                                                            | One profile screen for yourself, with its editing                                                                                                                               |
| 2026-10-06 | Live search, 300 ms debounce, query kept in the URL, newest response wins                                                                                                      | No submit step on a phone; Back restores results; no flicker from late responses                                                                                                |
| 2026-10-06 | A stranger's history is `200` empty, not `403`                                                                                                                                 | Sharing no community is an ordinary state                                                                                                                                       |
| 2026-10-06 | `redactPath` drops query strings from logs                                                                                                                                     | A search term (and `?name=` on the availability check) is someone's name — CLAUDE.md §4 bans raw PII in logs                                                                    |
| 2026-10-06 | `ratings` user index becomes `(user_id, created_at DESC, id DESC)`, replacing `(user_id)`                                                                                      | Serves the history's keyset and still serves `myScore` and the cascade                                                                                                          |
| 2026-10-06 | `ComingSoon` deleted                                                                                                                                                           | No tab uses it after this feature                                                                                                                                               |
| 2026-10-06 | Stage 2: the request log also drops pino-http's parsed `query` and `params`, and the `referer` header                                                                          | Seen in the browser check: the URL was redacted but `query: { q }` still logged the name. A same-origin referer would carry the search page's `?q=` and the invite page's token |
| 2026-10-06 | Stage 2: `GET /api/users/<anything>` is now the profile route, so a signed-out request for an unknown one-segment path is `401`, not `404`                                     | The route's purpose; the existing "unknown /users path" test moves to a two-segment path                                                                                        |
| 2026-10-06 | Stage 2: names link through one `PersonLink` component (avatar + name, ≥ 44 px)                                                                                                | The same link in four places                                                                                                                                                    |
| 2026-10-06 | Stage 3: `422` only for a blank cleaned query; a query whose key is empty finds nobody; the Search screen trims `?q=`                                                          | `/code-review`: a lone accent or ZWJ, or `?q=%20`, hit a 422 and an error screen that Try again could never clear                                                               |
| 2026-10-06 | Stage 4: the log scenario is a unit test of the exported `serializeRequest` and `REDACTED_LOG_PATHS`; the screens doc lists where names link under 2.4, not in 3.1 / 3.3 / 3.4 | The request logger is off under test; one place in the screens doc says where a profile opens from                                                                              |
