# Feature: Communities — create and dashboard

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                       |
| ------------- | ------------------------------------------------------------------------------------- |
| **Use cases** | UC-9 (create a community)                                                             |
| **Phase**     | 2 — merges Step 2.1, the create/read half of 2.2 and the dashboard/create half of 2.5 |
| **Branch**    | `feat/communities-create`                                                             |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged                    |

---

## 0. How Phase 2 was re-sliced

`DEVELOPMENT.md` split Phase 2 by layer: schema (2.1), backend (2.2, 2.3, 2.4), all screens (2.5), deep links (2.6), tests (2.7). Most of those could not merge alone under CLAUDE.md §11 ("don't merge backend only"). Steps 2.1–2.7 become four vertical features (decided 2026-10-03), each specified in its own session:

| #   | Feature                               | Former steps                       | Spec                        |
| --- | ------------------------------------- | ---------------------------------- | --------------------------- |
| 1   | **Communities: create and dashboard** | 2.1, 2.2 (create/read), 2.5 (part) | this document               |
| 2   | Invites and joining                   | 2.2 (invites), 2.3 (accept), 2.6   | `communities-invites.md`    |
| 3   | Membership management                 | 2.3 (leave/kick), 2.5 (settings)   | `communities-membership.md` |
| 4   | My Profile / Settings                 | 2.4, 2.5 (profile)                 | `profile-settings.md`       |

Step 2.7 dissolves: every feature ships its own tests (§15). The admin area (2.8, 2.9, UC-19) gets its own spec session after these.

## 1. Goal

A signed-in user lands on a real Communities Dashboard instead of the `/home` placeholder. They can create a community by typing a name and an optional description, become its admin, and land on that community's page. Every community they belong to appears on the dashboard with a generated cover. A bottom tab bar is in place for the whole app, and Sign out stays one tap away on the Profile tab. Nobody else can join yet — that is feature 2.

## 2. Scope

**In scope**

- Migration: `communities`, `community_members`, the `CommunityRole` enum.
- `POST /api/communities`, `GET /api/communities`, `GET /api/communities/:id`.
- Community name and description rules (§4), server-authoritative with a client mirror.
- `toPublicCommunity` serialiser.
- Screens: Communities Dashboard (replaces the `/home` placeholder), Create Community, Community page shell, minimal Profile tab, a shared "Coming soon" screen for Search and My List, the bottom tab bar.
- Generated cover component reusing the avatar generator (§5.2).
- E2E: the golden loop extended to "create a community and see it on the dashboard"; the Phase 1 suite updated for the new home screen.
- Doc updates (§9): `tables`, `use cases`, `frontend screens` (each `.md` + `.docx`), `DEVELOPMENT.md` (re-slice + this step's entry).

**Out of scope** — deliberately

- Invite links, the invite preview, joining — feature 2. **No `invite_token` column in this migration**; feature 2 decides whether it is a column or its own table (UC-15 mentions expiry).
- Inviting friends from the create form. The `friends` table is Phase 5. The form shows a static "Invite friends" card instead (§5.4); UC-9 is amended to say the picker arrives in Phase 5.
- Leaving, kicking, promoting, editing or deleting a community; the Community Settings & Members screen — feature 3.
- Editing the profile; re-choosing a declined Google photo — feature 4. The Profile tab here only shows the user and Sign out.
- Posts and the feed — Phase 3. The community page is a shell.
- Search and My List — Phases 5 and 4. Their tabs open a "Coming soon" screen.
- A cap on how many communities a user can create, and rate limiting. Small trusted audience; revisit in the admin area or Phase 6 hardening.
- Visual design. Every visual choice here is a placeholder built from the existing tokens and primitives; design is specified in a later stage (developer's preference, 2026-10-03).
- Offline reading of the dashboard — arrives with the service worker in Phase 6.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_communities`

```prisma
enum CommunityRole {
  ADMIN
  MEMBER
}

/// docs/features/communities-create.md §3.
/// No cover_image_url: covers are always generated from the name and id (CLAUDE.md §8).
model Community {
  id          String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  /// Shown as typed. Not unique — communities are found by invite, never by name.
  name        String            @db.VarChar(100)
  description String?
  createdAt   DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime          @updatedAt @map("updated_at") @db.Timestamptz(3)
  members     CommunityMember[]

  @@map("communities")
}

model CommunityMember {
  userId      String        @map("user_id") @db.Uuid
  communityId String        @map("community_id") @db.Uuid
  role        CommunityRole @default(MEMBER)
  joinedAt    DateTime      @default(now()) @map("joined_at") @db.Timestamptz(3)
  updatedAt   DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  community   Community     @relation(fields: [communityId], references: [id], onDelete: Cascade)

  @@id([userId, communityId])
  @@index([communityId])
  @@map("community_members")
}
```

`User` gains the back-relation `memberships CommunityMember[]` (no column).

Decisions behind it:

- **Phase 1 conventions:** camelCase fields mapped to snake_case, Postgres-generated UUIDs, `Timestamptz(3)`, `updated_at` on both tables (role changes in feature 3 will want it).
- **`cover_image_url` dropped** from `docs/tables.md`. Unlike users, a community has no outside picture source. A later upload feature re-adds it with a migration.
- **`invite_token` deferred** to feature 2.
- **Composite primary key** `(user_id, community_id)` prevents duplicate memberships; the extra index on `community_id` serves member counts and feature 3's member list. The PK's leading `user_id` serves the dashboard query.
- **`ON DELETE CASCADE`** both ways, so deleting a community (feature 3) or a user row removes memberships rather than leaving orphans.
- `name` is `VarChar(100)` as a storage ceiling; the UX limit (§4) is 40 graphemes and 100 code points. `description` is `TEXT`, capped by the application.
- Community creation and the creator's `ADMIN` membership are written in **one nested create** (a single transaction), so a community never exists without its admin.

## 4. Name and description rules

Applied by the server (authoritative) and mirrored on the client. The cleaning steps shared with display names move into `services/textRules.ts` (backend) and `lib/textRules.ts` (frontend); `displayName.ts` is refactored to use them, with no behaviour change (its existing tests prove that).

**Name**

1. **Clean:** same as display names — NFC, smart apostrophes/hyphens normalised, trim, collapse whitespace runs to one space.
2. **Length:** 2–40 visible characters (grapheme clusters), and at most 100 code points.
3. **Allowed characters:** everything display names allow (letters in any script, marks, digits, spaces, emoji, `. - _ '`), plus `& ! ? , : ( ) "`. Invisible characters, bidi marks, control characters and the Hangul fillers are rejected.
4. **Not unique**, no reserved-name list — only members ever see a community's name.

**Description** (optional)

1. **Clean:** NFC; line endings normalised to `\n`; each line's trailing spaces removed; runs of more than three line breaks collapsed to three; trim.
2. **Empty after cleaning → stored as `null`.**
3. **Length:** at most 280 graphemes and 1,000 code points.
4. **Allowed:** any printable character, including punctuation and URLs, plus `\n`. Control characters (other than `\n`), zero-width characters and bidi marks are rejected.
5. Rendered as plain text with line breaks preserved. Never as HTML, never auto-linked.

Messages: "A Community name is required." (empty — wording from UC-9), "Use 2–40 characters.", "That name is too long.", "That character isn't allowed.", "Keep the description to 280 characters."

## 5. API

All responses use the CLAUDE.md §4 envelope; `400` = unparseable JSON, `422` = fails validation (the Phase 1 convention).

### `PublicCommunity` — the only community shape that leaves the server

```ts
{
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myRole: 'ADMIN' | 'MEMBER'; // the caller's role; every reader is a member
  createdAt: string; // ISO 8601
}
```

Built field by field in `utils/publicCommunity.ts`. `updatedAt` and membership rows are never sent. Covered by a key-set equality test, like `toPublicUser`.

### `POST /api/communities`

- **Auth:** required; onboarding must be complete (a user without a display name cannot own a community). An un-onboarded caller gets `403` "Finish your profile first."
- **Request:** `{ name: string, description?: string | null }`, Zod `.strict()`; raw `name` ≤ 400 chars and raw `description` ≤ 4,000 chars before cleaning.
- **Behaviour:** clean and validate (§4); create the community with the caller as `ADMIN` in one nested write.
- **Success:** `201` `{ community: PublicCommunity }` (`memberCount: 1`, `myRole: "ADMIN"`).
- **Errors:**
  - `400` body is not JSON.
  - `422` missing/empty name; name fails length or character rules; description too long or has a forbidden character; unknown key; wrong types.
  - `401` not signed in.
  - `403` onboarding not complete.

### `GET /api/communities`

- **Auth:** required.
- **Behaviour:** the caller's communities only. There is no endpoint that lists communities the caller is not in. Ordered by the caller's `joined_at`, newest first.
- **Success:** `200` `{ communities: PublicCommunity[] }` — an empty array is a normal answer.
- **Errors:** `401` not signed in.
- No pagination: a friend-group user belongs to a handful of communities. Revisit if anyone passes ~100.

### `GET /api/communities/:id`

- **Auth:** required.
- **Success:** `200` `{ community: PublicCommunity }` when the caller is a member.
- **Errors:**
  - `401` not signed in.
  - `404` "Community not found." — the community does not exist, **or the caller is not a member**, **or `:id` is not a UUID**. One answer for all three, so the endpoint never confirms that a community exists to an outsider (the same principle as the admin area's not-found rule, CLAUDE.md §17).

### Logging

`info` on create with `{ userId, communityId }`. Names and descriptions are user content and are not logged.

## 6. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only. Layout and visuals are placeholders (design comes later).

### 6.1 Routes

| Path               | Screen                 | Tab bar | Guard                                  |
| ------------------ | ---------------------- | ------- | -------------------------------------- |
| `/home`            | Communities Dashboard  | yes     | signed in + onboarded (existing guard) |
| `/communities/new` | Create Community       | no      | same                                   |
| `/communities/:id` | Community page (shell) | yes     | same                                   |
| `/search`          | Coming soon            | yes     | same                                   |
| `/my-list`         | Coming soon            | yes     | same                                   |
| `/profile`         | Profile (minimal)      | yes     | same                                   |

Create Community is a full-screen route rather than a modal: it works with the phone's back gesture and the PWA has no browser back button. The `Home` placeholder and `SignedInPlaceholder` are deleted; the dashboard takes over `/home`.

### 6.2 Generated cover (`components/ui/CommunityCover.tsx`)

Initials over a colour derived from the community id, reusing `avatarHue` and `initials` from `avatarParts.ts` (developer's choice, option A). A rectangle rather than a circle, in two sizes: dashboard card and page banner. Decorative when the name is printed next to it.

### 6.3 Bottom tab bar (`components/BottomNav.tsx`)

Four tabs — Home, Search, My List, Profile (developer's choice, option B) — each icon + label, ≥ 44 px, active tab marked with `aria-current="page"`, padded for the iPhone home indicator (`env(safe-area-inset-bottom)`). Rendered by a layout route around the tabbed screens.

### 6.4 Communities Dashboard (`pages/Dashboard.tsx`)

- **Layout:** heading "Your communities"; a list of cards (cover, name, "1 member" / "n members", an "Admin" label when `myRole` is ADMIN); a floating **Create community** button above the tab bar.
- **Loading:** three skeleton cards.
- **Empty:** headline "Start your first community", one line "A community is where your friends share music.", and a **Create community** button. (The floating button is hidden in the empty state so there is exactly one call to action.)
- **Error:** inline "Couldn't load your communities." with **Try again**; no blank screen.
- Tapping a card opens `/communities/:id`.

### 6.5 Create Community (`pages/CreateCommunity.tsx`)

- **Layout, top to bottom:** header with **Cancel** (back to `/home`) and title "New community"; cover preview; **Name** input with an `n/40` counter; **Description** textarea (optional) with an `n/280` counter; the "Invite friends" card; **Create** button.
- **Cover preview:** initials from the name being typed, over a neutral colour. The real colour depends on the id, which does not exist until the community is created, so the preview does not pretend to know it. Line under it: "Your cover's colour is picked when the community is created."
- **Validation (UC-9 fail path):** once the name field has been touched, an empty name highlights it in the danger colour with "A Community name is required."; other rule failures show their message. Create stays disabled until the name is valid.
- **Invite friends card (developer's choice, option B):** _superseded 2026-10-06 by the friends picker — `invite-friends.md` §5.2._ Static, non-interactive, not styled as a control — an icon, "Invite friends", and "You'll be able to invite friends from here once you have friends on BookRough." No request, no state, no handler.
- **Submitting:** button busy "Creating…"; no double submission. On success, navigate to `/communities/:id` with `replace`, so Back returns to the dashboard rather than to the form.
- **Server `422`:** the server's message under the relevant field; values kept.
- **Other errors:** an inline form error above the button (the request opts out of the toast, as onboarding does, so nothing is shown twice); button returns; values kept.
- **Offline:** banner "You're offline. Connect to create a community." and Create disabled (`useOnlineStatus`, as in onboarding).

### 6.6 Community page shell (`pages/Community.tsx`)

- **Layout:** back to dashboard; cover banner; name; description (line breaks preserved); "1 member · You're an admin" (or "n members"); an empty-state panel "Posts are coming soon. This is where your community will share music."
- **Loading:** skeleton banner and lines.
- **Not found (`404`):** the standard not-found page, never "you're not a member".
- **Error:** inline retry.
- Only the creator can reach a community in this feature; the page works unchanged once feature 2 adds members.

### 6.7 Profile tab (`pages/Profile.tsx`) — minimal

Avatar, display name, preferred service, **Sign out** (reusing `useSignOut`). Feature 4 turns this into the full My Profile / Settings.

### 6.8 Coming soon (`pages/ComingSoon.tsx`)

One shared screen with a title and one line per tab: Search — "Find friends on BookRough. Coming soon."; My List — "Songs you saved to listen later. Coming soon."

### 6.9 API module and data loading

`api/communities.ts`: `createCommunity`, `listMyCommunities`, `getCommunity`. Plain axios calls with component-level loading state, as in Phase 1 — no data-fetching library. After creating, the dashboard refetches when it next mounts; no global communities store yet.

## 7. Edge cases & failure modes

- **Double tap on Create:** the busy button prevents a second request; non-unique names mean a duplicate would not be rejected, so this guard is what prevents duplicates.
- **Two communities with the same name** on one dashboard: allowed; told apart by cover colour and description.
- **Name of only spaces or invisible characters:** invalid after cleaning → "A Community name is required."
- **Description of only blank lines:** cleaned to `null`.
- **Description with HTML or a script tag:** stored as text, rendered escaped.
- **Non-member opens `/communities/<real id>`** (a pasted link before feature 2 exists): `404` and the not-found page.
- **Malformed id in the URL:** `404`, not `500` (validated before reaching Prisma).
- **User row deleted:** memberships cascade away; communities they created remain (they may have other members after feature 2). A community whose last member is gone is left in place; cleanup of memberless communities is feature 3's question.
- **Un-onboarded user calls the API directly:** `403`; the UI guard never shows them the screen.
- **Network drops after submit:** the request may or may not have landed. The user sees the toast; if it did land, the community is on the dashboard. Accepted — no idempotency keys at this scale.
- **Session expires mid-form:** the `401` interceptor clears the store and the guard returns to Welcome; the draft is lost. Accepted for a two-field form.

## 8. Test scenarios

**Unit (backend `services/communityText.ts`, `services/textRules.ts`, `services/community.service.ts`, `utils/publicCommunity.ts`; frontend mirror `lib/communityText.ts`)**

- ✅ Name cleaning: trims, collapses spaces, NFC, smart apostrophes.
- ✅ Name length: 2 graphemes, 40 graphemes, Hebrew, emoji with ZWJ; ❌ 1 grapheme, 41 graphemes, > 100 code points.
- ✅ Name characters: `Rock & Roll!`, `Jazz (Fridays)`, `"Quotes"`; ❌ `<`, `@`, `#`, zero-width space, RTL mark, control char.
- ✅ Description: newlines kept; 4+ line breaks collapsed to 3; whitespace-only → `null`; 280 graphemes OK; ❌ 281 graphemes; ❌ control char; ❌ zero-width char.
- ✅ `displayName.ts` existing tests stay green after the `textRules` refactor.
- ✅ `createCommunity` creates the community and an ADMIN membership; returns `memberCount: 1`, `myRole: ADMIN`.
- ❌ `createCommunity` invalid name → `AppError 422`; invalid description → `422`; un-onboarded user → `403`.
- ✅ `listMyCommunities`: only the caller's communities, newest joined first; empty array when none.
- ✅ `getCommunity` for a member.
- ❌ `getCommunity`: missing id → `404`; non-member → `404`.
- ✅ `toPublicCommunity` returns exactly the six public fields (key-set equality).

**Integration (endpoints)**

- ✅ `POST /communities` → `201`, community and ADMIN membership rows exist, response matches `PublicCommunity`.
- ✅ `POST` without description → `description: null`.
- ❌ `400` bad JSON.
- ❌ `422` missing name; empty name; whitespace-only name; 41-grapheme name; forbidden character; description too long; unknown key; name not a string.
- ❌ `401` no cookie.
- ❌ `403` user who has not finished onboarding.
- ✅ `GET /communities` returns only the caller's communities, newest joined first, with correct `memberCount`.
- ✅ `GET /communities` with none → `200` and `[]`.
- ❌ `GET /communities` `401`.
- ✅ `GET /communities/:id` as a member → `200`.
- ❌ `GET /communities/:id` `404` unknown UUID; `404` non-member (another user's community); `404` malformed id; `401`.
- 🔒 No community response contains `updatedAt` or any user field beyond what `PublicCommunity` names.

**Component (Vitest + RTL)**

- ✅ Dashboard: skeleton while loading; cards with name, member count and Admin label; tapping a card navigates.
- ✅ Dashboard empty state shows one Create button; ❌ error state shows Try again, which refetches.
- ✅ Create: renders fields, counters, cover preview with live initials, the invite-friends card (no interactive role).
- ❌ Create: touching and clearing the name shows "A Community name is required." and keeps Create disabled; local rule errors shown without a request.
- ✅ Create: submit sends the cleaned body, shows "Creating…", navigates to the community with `replace`.
- ❌ Create: server `422` shown under the field with values kept; offline banner disables Create.
- ✅ Community page: renders name, description with line breaks, member line; ❌ `404` renders the not-found page; ❌ error shows retry.
- ✅ Bottom nav: four tabs, active tab has `aria-current`; Search and My List render Coming soon.
- ✅ Profile: shows the user and signs out.

**E2E (Playwright)**

- ✅ Golden loop extended: an onboarded user lands on the empty dashboard, creates "Friday Jazz", lands on its page, goes back, and sees the card on the dashboard.
- Phase 1 specs updated: the post-onboarding assertion now targets the dashboard heading, and sign-out goes through the Profile tab.

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `communities` (no `cover_image_url`, `invite_token` moved to feature 2, `updated_at`), `community_members` (`updated_at`, role enum, cascades).
- `docs/use cases.md` + `.docx`: UC-9 — the friends picker is shown as a placeholder card until friends exist (Phase 5); "redirected to the community's main feed" reads as the community page.
- `docs/frontend screens.md` + `.docx`: 2.1 Dashboard (tab bar with two coming-soon tabs, empty state), 3.2 Create Community (full-screen, neutral preview, invite card), the community page shell, the minimal Profile tab.
- `DEVELOPMENT.md`: Steps 2.1–2.7 re-sliced into the four features of §0; this feature's entry filled per §13.
- No new dependencies, so `docs/tech stack.md` is unchanged.

## 10. Open questions

None.

## 11. Decisions log

| Date       | Decision                                                                         | Reason                                                                                       |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 2026-10-03 | Steps 2.1–2.7 re-sliced into four vertical features (§0)                         | Vertical slicing (§11); smallest slices a friend can use; smaller `/code-review` diffs       |
| 2026-10-03 | Create form shows a static "Invite friends" card until friends exist (option B)  | Developer's choice; recommendation was to omit it. Kept non-interactive, no logic            |
| 2026-10-03 | Community names are not unique                                                   | Communities are found by invite, never searched; uniqueness would only cause errors          |
| 2026-10-03 | Bottom nav ships with all four tabs; Search and My List show "Coming soon"       | Developer's choice; recommendation was two tabs. Profile is real so Sign out stays reachable |
| 2026-10-03 | Covers: initials over an id-derived colour, reusing the avatar generator         | Developer's choice; visual design is deferred to a later stage                               |
| 2026-10-03 | `cover_image_url` dropped; `invite_token` deferred to feature 2                  | No source for a cover; invite storage depends on feature 2's expiry decision                 |
| 2026-10-03 | Non-member, missing and malformed ids all return `404`                           | Never confirm that a community exists to an outsider                                         |
| 2026-10-03 | Create Community is a full-screen route, not a modal                             | Phone back gesture; the installed PWA has no browser back button                             |
| 2026-10-03 | Creating requires finished onboarding (`403` otherwise)                          | A community admin must have a display name to be shown                                       |
| 2026-10-03 | Create errors shown inline, not as a toast                                       | Stage 2: matches onboarding; a 422 and a toast would otherwise show the same error twice     |
| 2026-10-03 | Shared cleaning and character rules extracted to `textRules.ts` in both packages | Stage 2: community names reuse display-name rules; one copy per package, not two             |
| 2026-10-03 | Description character errors get their own message                               | `/code-review`: a server 422 on the name was shown under the description                     |
| 2026-10-03 | Cover initials skip punctuation ("(Friday) Jazz" → "FJ")                         | `/code-review`: community names now allow leading punctuation                                |
| 2026-10-03 | Hebrew geresh/gershayim allowed in all names (`onboarding.md` amended)           | Stage 4: "ג׳אז" failed the name rules — the geresh is Unicode punctuation                    |
