# Feature: Administrative Area

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Use cases** | UC-19 (administrator manages the application)                                                                             |
| **Phase**     | 2 — Steps 2.8 and 2.9 of `DEVELOPMENT.md`                                                                                 |
| **Branch**    | `feat/admin-user-list` (Part 1, §2.1), then `feat/admin-settings` (Part 2, §2.2)                                          |
| **Status**    | ☑ Spec approved · Part 1: ☑ Implemented ☑ Reviewed ☑ Tested ☐ Merged · Part 2: ☐ Implemented ☐ Reviewed ☐ Tested ☐ Merged |

---

## 1. Goal

The application owner — any user whose `users.role` is `ADMIN`, set directly in the database — gets a private area inside the app. There they can see who uses BookRough and which communities exist, and change three presentation settings that take effect for everyone: an announcement banner, the accent colour, and the Welcome tagline. Every settings change is kept in a history that shows who changed what, and when. Nobody else can reach the area or tell that it exists.

## 2. Scope

One spec, delivered as **two PRs in order**, each a complete DB → API → UI slice.

### 2.1. Part 1 — the lists (Step 2.8, `feat/admin-user-list`)

- The session tells the client whether the signed-in user is an admin (`isAdmin`).
- A server-side admin guard on every `/api/admin/*` route.
- `GET /api/admin/users` and `GET /api/admin/communities`, each through an explicit admin serialiser.
- The Admin screen with **Users** and **Communities** tabs; an "Admin area" link on My Profile, shown only to admins.
- The standard not-found page for everyone else at every `/admin` URL.

### 2.2. Part 2 — the settings (Step 2.9, `feat/admin-settings`)

- Two tables: `app_settings` and `setting_changes` (§3).
- `GET /api/settings` (public, with more for signed-in users), `GET` / `PATCH /api/admin/settings`.
- The **Settings** tab: the three settings, Save, and the last 20 changes.
- The app applies the settings: accent colour everywhere, tagline on Welcome, banner for signed-in users.

**Out of scope** — explicitly

- **Any destructive or moderating power**: deleting, suspending or editing a user or a community. Removing someone from a community stays with that community's admins (UC-14).
- **Granting or revoking admin.** The role is set in the database only (CLAUDE.md §17); there is no endpoint, so there is nothing to abuse.
- **Any setting beyond the three in §3.2.** The list is fixed in code. A new setting needs a new spec, never just a new row.
- **Free colours, HTML, Markdown or links** in any setting. Colours come from a named palette; texts are plain text.
- **"Last active" or any per-user activity tracking.** It would need a new column that records behaviour — more data about people than this project keeps.
- **Showing a community's description, its members, or anything a user wrote** beyond display names and community names.
- **A view of an individual user's communities** (rejected in Stage 1 — it edges toward monitoring friends).
- **Pagination and search** in the lists. The audience is one friend group; see §8.
- **Live push of setting changes** to open apps. Other users get a change on their next app load.
- **Editing or deleting history entries** through the app.

## 3. Data model changes

### 3.1. Part 1

None. `users.role` already exists.

### 3.2. Part 2 — migration `add_app_settings`

`npx prisma migrate dev --name add_app_settings`

**Enum `SettingKey`**: `ANNOUNCEMENT`, `ACCENT_COLOR`, `WELCOME_TAGLINE`.

**Table `app_settings`** — one row per setting that has ever been changed. A missing row means "the default".

| Column       | Type          | Notes                                                              |
| ------------ | ------------- | ------------------------------------------------------------------ |
| `key`        | `SettingKey`  | Primary key.                                                       |
| `value`      | `JSONB`       | Validated in code against the setting's schema before every write. |
| `updated_at` | `TIMESTAMPTZ` | Set on every write.                                                |

**Table `setting_changes`** — the history. Rows are inserted, never updated or deleted by the app.

| Column          | Type          | Notes                                                                           |
| --------------- | ------------- | ------------------------------------------------------------------------------- |
| `id`            | `UUID`        | Primary key.                                                                    |
| `key`           | `SettingKey`  | Which setting.                                                                  |
| `old_value`     | `JSONB`       | The value before (the default if the setting had never been changed).           |
| `new_value`     | `JSONB`       | The value after.                                                                |
| `changed_by_id` | `UUID`, null  | FK → `users(id)`, `ON DELETE SET NULL`: the entry outlives the admin's account. |
| `changed_at`    | `TIMESTAMPTZ` | Default `now()`. Index on `changed_at DESC` for "the last 20".                  |

**The three settings** — the registry in code (`services/appSettings.ts`) is the single source of truth: key, Zod schema, default.

| Key               | Value shape                                    | Rules                                                                                | Default                                               |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `ANNOUNCEMENT`    | `{ enabled: boolean, text: string }`           | `text`: cleaned line, printable characters only, 0–140 graphemes; 1–140 when enabled | `{ enabled: false, text: "" }`                        |
| `ACCENT_COLOR`    | one of `purple` `blue` `green` `orange` `pink` | Palette names only — never a colour value                                            | `purple` (today's accent)                             |
| `WELCOME_TAGLINE` | `string`                                       | Cleaned line, printable characters only, 1–80 graphemes                              | `Share music with friends, on whatever app they use.` |

Text rules reuse `services/textRules.ts` (the same cleaning and printable-character checks as community names). With these two tables the schema has **ten tables**.

## 4. API

All admin endpoints share one guard, `requireAppAdmin` (named apart from the community-level `requireAdmin` in `communityAccess.ts`). It runs after `requireAuth` and refuses with `403` unless the user's role is `ADMIN` and onboarding is finished. The role is read from the database row loaded for the request, never from the token, so a role change takes effect on the next request.

The `403` body for every admin route is the same: `{ status: "error", code: 403, message: "You don't have access to this." }`.

### 4.1. Session change (Part 1)

`sessionPayload` gains `isAdmin: boolean` — on `POST /api/auth/google`, `GET /api/auth/me`, `PATCH /api/users/me` and `POST /api/users/me/google-picture`. It is the caller's own flag only. `toPublicUser` is unchanged: no other user's role is ever sent outside the admin area.

### 4.2. `GET /api/admin/users` (Part 1)

- **Auth:** admin.
- **Request:** none.
- **Success `200`:** `{ users: AdminUser[] }`, newest account first.
  - `AdminUser` = `{ id, displayName: string | null, profilePictureUrl: string | null, preferredService: StreamingService | null, createdAt, onboarded: boolean, isAdmin: boolean, communityCount: number }`
  - `profilePictureUrl` only when the user chose their Google photo (`useGooglePicture`); before onboarding the column holds a photo kept only to be offered, and the admin never sees it.
  - Built by `toAdminUser`, field by field. `googleSub`, `displayNameKey`, `useGooglePicture` and `updatedAt` are never included. There is no email to include (CLAUDE.md §5).
- **Errors:** `401` no session; `403` not an admin (or not onboarded).

### 4.3. `GET /api/admin/communities` (Part 1)

- **Auth:** admin.
- **Success `200`:** `{ communities: AdminCommunity[] }`, newest first.
  - `AdminCommunity` = `{ id, name, memberCount, createdAt, owner: { id, displayName } | null }`
  - Built by `toAdminCommunity`. No description, no invite token, no member list.
  - `owner` is `null` only if a community somehow has none; the screen shows "No owner".
- **Errors:** `401`; `403`.

### 4.4. `GET /api/settings` (Part 2)

- **Auth:** public (`optionalAuth`).
- **Success `200`:**
  - Signed out: `{ accentColor, welcomeTagline }`.
  - Signed in: `{ accentColor, welcomeTagline, announcement: { text } | null }` — `null` when the banner is off. The banner is for people inside the app, so its text is not published to the world.
- **Errors:** none of its own; a database failure is the usual `500`, and the client falls back to defaults (§5.4).

### 4.5. `GET /api/admin/settings` (Part 2)

- **Auth:** admin.
- **Success `200`:** `{ settings: { announcement: { enabled, text }, accentColor, welcomeTagline }, changes: SettingChange[] }`
  - `changes` = the last 20, newest first: `{ id, key: "announcement" | "accentColor" | "welcomeTagline", oldValue, newValue, changedAt, changedBy: { id, displayName } | null }`. `changedBy` is `null` once that account is deleted.
- **Errors:** `401`; `403`.

### 4.6. `PATCH /api/admin/settings` (Part 2)

- **Auth:** admin.
- **Request:** a strict object with at least one of:
  - `announcement`: `{ enabled: boolean, text: string }`
  - `accentColor`: palette name
  - `welcomeTagline`: string
- **Behaviour:** in one transaction, for each setting given: validate it, read its current value (the default if no row), and if it differs, upsert `app_settings` and insert one `setting_changes` row with old value, new value and the actor. A setting sent with its current value is a no-op and writes no history. Logged at `INFO` with `userId` and the changed keys — never the texts.
- **Success `200`:** the same body as `GET /api/admin/settings`, after the change.
- **Errors:**
  - `400` body is not valid JSON.
  - `422` empty object, unknown key, wrong type, a colour not in the palette, a text over its limit or with forbidden characters, an empty tagline, or an enabled announcement with empty text. Each message names the problem, e.g. "The banner text can be up to 140 characters."
  - `401`; `403`.

## 5. Screens & components

A new group, **Administration**, in `docs/frontend screens.md`, with one screen in three tabs: Users, Communities (Part 1), Settings (Part 2). The catalog grows from fourteen to **fifteen** screens.

### 5.1. Getting there

- **My Profile:** an **Admin area** link above Sign out, rendered only when the session's `isAdmin` is true.
- **Routes:** `/admin` → redirects to `/admin/users`; `/admin/communities`; `/admin/settings` (Part 2). Inside the tab layout, with the bottom navigation.
- **Everyone else** — signed-out visitors, non-admins, admins mid-onboarding — gets the standard `NotFound` page at every `/admin` URL, rendered without calling the API, so the area is indistinguishable from a URL that does not exist.
- If an admin API call answers `403` (the role was removed mid-session), the screen switches to `NotFound`.

### 5.2. Admin screen — Part 1

At 375px: heading "Admin", a segmented tab control (Users · Communities, later · Settings), then the list.

- **Users tab:** a count line ("12 users"), then one row per user: avatar, display name — or "Not finished signing up" when there is none — an "Admin" badge where it applies, then the service, "Joined 4 Oct 2026" and "3 communities".
- **Communities tab:** a count line, then one row per community: generated cover, name, "5 members", "Created 4 Oct 2026", "Owner: Dana" (or "No owner").
- **Loading:** skeleton rows. **Empty:** "No communities yet." (the users list always contains at least the admin). **Error:** the standard `LoadError` with **Try again**.
- Rows are not tappable. Nothing here opens a community or a profile.

### 5.3. Settings tab — Part 2

- **Announcement banner:** an on/off switch and a text area with a counter (0/140). Switching off keeps the text for next time.
- **Accent colour:** five swatches as radio buttons, each labelled with its name.
- **Welcome tagline:** a text field with a counter (n/80) and **Reset to default**.
- **Save changes:** enabled only once something changed and everything is valid; sends only the changed settings; toast "Settings saved". Field problems show under the field; any other failure shows inline above Save.
- **Recent changes:** the last 20, newest first, e.g. "Ofri changed the accent colour from Purple to Green · 4 Oct, 14:02". Long texts are shortened to one line. An entry whose author's account is gone reads "Deleted account". Empty: "No changes yet."
- **Loading / error:** skeleton, then `LoadError`. **Offline:** banner "You're offline. Connect to change settings." and Save disabled.

### 5.4. Applying the settings — Part 2

- The app fetches `GET /api/settings` at start, alongside the session. It never waits on it: until it answers, or if it fails, the defaults are used.
- **Accent colour:** set as `data-accent="<name>"` on `<html>`. The CSS defines each palette name's accent tokens for light and dark, so the server only ever chooses a name, never a colour value. Exact shades are chosen with the visual design (contrast checked in both themes); `purple` keeps today's values.
- **Tagline:** Welcome's subtitle.
- **Banner:** a slim bar at the top of every tabbed screen for signed-in users, plain text, with a dismiss button. A dismissal is remembered on that device for that exact text (local storage, wrapped in try/catch), so a new announcement shows again.
- After an admin saves, their own app re-fetches and applies the settings at once; everyone else gets them on their next app load.

## 6. Edge cases & failure modes

- **Role removed mid-session:** the next admin request answers `403`; the app drops the session's admin flag, so the whole area turns into `NotFound` and the Admin link disappears at once.
- **A non-admin guesses `/admin`:** `NotFound`, no API call. Calling the API directly gives `403`, which reveals only what CLAUDE.md §17 accepts.
- **An admin who has not finished onboarding:** treated as a non-admin until they do.
- **Two admins save at once:** last write wins. Each change's history row records the value it actually replaced, because the read happens inside the same transaction.
- **A setting row holds a value the current schema rejects** (an old palette name, say): the read falls back to the default and logs a `WARN`. The app never breaks over a bad setting.
- **`GET /api/settings` fails or is slow:** defaults; no error toast, no blocking spinner.
- **Banner text with markup** (`<b>hi</b>`): stored and shown as literal text; React escapes it.
- **The admin's account is deleted later:** their history entries remain, attributed to "Deleted account".
- **Privacy:** no admin response may contain an email, a Google `sub`, or a display-name key — asserted by tests (§7).

## 7. Test scenarios

### Part 1

**Unit**

- ✅ `requireAppAdmin` passes an onboarded admin.
- ❌ `requireAppAdmin` refuses a `USER` (`403`) and an admin who has not finished onboarding (`403`).
- ✅ `toAdminUser` maps every field, including `onboarded`, `isAdmin` and `communityCount`; it never carries `googleSub`, `displayNameKey`, `useGooglePicture` or `updatedAt`.
- 🔒 `toAdminUser` returns `profilePictureUrl: null` for a user who has not chosen their Google photo (the stored pre-onboarding photo stays hidden).
- ✅ `toAdminCommunity` maps name, member count, created date and owner; `owner: null` when there is none; no description or invite token.

**Integration**

- ✅ `GET /api/admin/users` as an admin → `200`, newest first, correct community counts, a non-onboarded user with `displayName: null`.
- ✅ `GET /api/admin/communities` as an admin → `200`, newest first, member counts and owner names.
- ✅ The session payload carries `isAdmin` — `true` for an admin, `false` otherwise — on sign-in, `/auth/me` and profile saves.
- ❌ Both admin endpoints: `401` without a session; `403` for a `USER`; `403` for an admin mid-onboarding.
- ❌ A role changed to `USER` in the database → the very next request is `403` with the same cookie.
- 🔒 **Privacy:** no admin response contains an email-shaped string, any user's `googleSub`, or a `displayNameKey` (the Google token used to create the users carried an email).

**Component**

- ✅ Users tab: count, rows, "Admin" badge, "Not finished signing up", community counts.
- ✅ Communities tab: count, rows, owner names, "No owner".
- ✅ Loading skeleton; empty communities state; `LoadError` → Try again reloads.
- ❌ A `403` from the API → `NotFound`.
- ✅ `/admin` → NotFound for a non-admin session without any API call; the Admin screen for an admin.
- ✅ My Profile shows **Admin area** only when `isAdmin`.

**E2E**

- ✅ An admin (role set in the test database) opens the Admin area from My Profile and sees users and communities. A normal user typing `/admin` sees the not-found page.

### Part 2

**Unit**

- ✅ The registry: each setting's default; valid values pass.
- ❌ Each rule: banner text over 140, enabled with empty text, forbidden characters, a colour not in the palette, an empty or whitespace-only tagline, a tagline over 80.
- ✅ `updateSettings` writes only changed settings, one history row each, with the right old value (the default when there was no row) and actor.
- ✅ A no-op save writes nothing.
- ✅ A stored value the schema rejects reads back as the default.

**Integration**

- ✅ `PATCH /api/admin/settings` changes a setting → `200`, `app_settings` updated, one `setting_changes` row; `GET /api/admin/settings` returns it, with `changedBy`.
- ✅ Changing two settings at once → two history rows.
- ✅ `GET /api/settings`: signed out → accent and tagline only; signed in → also the announcement (or `null` when off); defaults when nothing was ever saved.
- ✅ History survives the admin's account deletion with `changedBy: null`.
- ✅ Only the last 20 changes are returned, newest first.
- ❌ `400` bad JSON; `422` empty body, unknown key, wrong types, bad colour, over-long texts, empty tagline, enabled empty banner — each leaving the tables untouched.
- ❌ `401` and `403` on both admin settings endpoints.
- 🔒 The `INFO` log line for a change carries the keys but not the texts.

**Component**

- ✅ Settings tab renders current values and the history; Save disabled until a change.
- ✅ Each setting change → Save sends only that setting → toast → history refreshes.
- ❌ Field errors under the fields; other failures inline; offline banner disables Save.
- ✅ Reset to default restores the default tagline.
- ✅ The banner shows for signed-in users, hides after dismissal, and returns for a new text.
- ✅ `data-accent` follows the fetched colour; defaults when the fetch fails.
- ✅ Welcome shows the fetched tagline, and the default before or without it.

**E2E**

- ✅ The admin turns on a banner and changes the colour and tagline; a second, normal user's app shows the banner, and Welcome (signed out) shows the new tagline.

## 8. Open questions & risks

- **No pagination.** Fine for a friend group. If a list ever passes a few hundred rows it needs paging; noted as debt, not built.
- **Palette shades are placeholders** until the visual design stage; only `purple` is final.
- **Settings reach open apps only on their next load.** Acceptable for an announcement; noted.
- **The `403` on admin endpoints** does tell a curious API caller that something is there. CLAUDE.md §17 accepts this; the frontend reveals nothing.

## 9. Doc updates

**Part 1 PR**

- `docs/frontend screens.md` + `.docx`: the Administration group and its screen (Users, Communities; Settings marked as Part 2); fifteen screens; the stale 2.1 line about a "minimal Profile" fixed.
- `docs/use cases.md` + `.docx`: UC-19 — the decided scope (lists, three settings, history) replaces "deliberately not specified".
- `docs/auth.md` + `.docx` §5: `isAdmin` in the session; the guard reads the role from the database on every request.
- CLAUDE.md §8 (fifteen screens, Administration group) and §17 (the decided scope, pointing here).
- `DEVELOPMENT.md`: Step 2.8 filled per §13; the stale "username" in its task list removed. `profile-settings.md`: Merged ticked.

**Part 2 PR**

- `docs/tables.md` + `.docx`: `app_settings`, `setting_changes`, `SettingKey`; ten tables. CLAUDE.md §6 (ten tables).
- `docs/frontend screens.md` + `.docx`: the Settings tab and how settings apply.
- `DEVELOPMENT.md`: Step 2.9 filled per §13.

## 10. Decisions log

| Date       | Decision                                                                                | Reason                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2026-10-04 | Lists plus a short fixed settings list; no moderation (option A)                        | Matches UC-19; keeps destructive code out of the product                                |
| 2026-10-04 | Settings: announcement banner, accent colour from a palette, Welcome tagline (option C) | Covers UC-19's examples and the trial's real need to announce things                    |
| 2026-10-04 | Lists: users and communities, read-only, no per-user drill-down (option A)              | Enough to oversee the app without monitoring individuals                                |
| 2026-10-04 | History table shown on the Settings tab, last 20 (option A)                             | Satisfies "every change recorded" in a place the owner will actually look               |
| 2026-10-04 | One spec, two PRs (lists, then settings)                                                | Each PR stays a complete, reviewable vertical slice                                     |
| 2026-10-04 | `GET /api/settings` is public; the banner text only for signed-in users                 | Colour and tagline are needed on Welcome; the announcement is for people inside the app |
| 2026-10-04 | The server stores a palette name, the CSS maps it to colours                            | No colour or CSS string from the database ever reaches a style                          |
| 2026-10-04 | No "last active" column                                                                 | It would record behaviour about people; data minimisation (CLAUDE.md §5)                |
| 2026-10-04 | `/admin` renders NotFound for anyone not an admin, including signed-out visitors        | Indistinguishable from a URL that does not exist (CLAUDE.md §17)                        |
