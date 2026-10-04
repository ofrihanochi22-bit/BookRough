# Feature: Communities — invites and joining

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Use cases** | UC-15 (join a community via invite link)                                                  |
| **Phase**     | 2 — Step 2.2 of `DEVELOPMENT.md` (re-sliced; absorbs former 2.2 invites, 2.3 accept, 2.6) |
| **Branch**    | `feat/communities-invites`                                                                |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged                        |

---

## 1. Goal

A community admin taps **Invite friends**, gets the community's link, and sends it from the iPhone share sheet. A friend opens it — signed in or not, with an account or not — sees a preview of the community, signs in if needed, taps **Join**, and lands inside it. An admin can reset the link, which kills the old one at once. After this feature, a community can have more than one member.

## 2. Scope

**In scope**

- Migration: `communities.invite_token` (unique, nullable).
- `GET /api/communities/:id/invite`, `POST /api/communities/:id/invite/reset` (admins), `GET /api/invites/:token` (public preview), `POST /api/invites/:token/accept` (join).
- Invite preview screen at `/invite/:token`, including Google sign-in for signed-out visitors and the return trip through onboarding.
- Invite panel on the community page (admins only): link, Share, Copy, Reset; opens once by itself right after creating a community.
- The Google sign-in block is extracted from Welcome into a shared component so the preview can use it.
- E2E: create → invite → a second user joins.
- Doc updates (§9): `tables`, `use cases`, `frontend screens` (`.md` + `.docx`), `DEVELOPMENT.md`; tick Merged on `communities-create.md`.

**Out of scope** — deliberately

- Several links per community, per-link expiry or use limits (option C, rejected). Expiry could later be one column.
- Members (non-admins) seeing or sharing the link (developer's choice, option A: admins only).
- Kicking, leaving, promoting, and whether a kicked user may rejoin through the same link — feature 3. Until then, Reset is the only way to stop a link.
- The Community Settings & Members screen — feature 3; it may later host the invite panel too.
- Showing who sent an invite: one shared link has no sender.
- A member list on the community page — feature 3.
- Rate limiting the public preview: the token is 128 random bits, so there is nothing to enumerate. Revisit in Phase 6 hardening.
- Routing links into the installed iPhone PWA — see §8.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_community_invite_token`

```prisma
model Community {
  // …existing columns…
  /// The community's one invite link (docs/features/communities-invites.md §3).
  /// Created on first request, replaced on reset. A secret: never logged, never
  /// in PublicCommunity.
  inviteToken String? @unique @map("invite_token") @db.VarChar(64)
}
```

Decisions behind it:

- **One token per community, no expiry** (developer's choice, option A). Reset replaces it; the old value matches nothing afterwards.
- **Created lazily** the first time an admin opens the invite panel, so existing communities need no backfill and a community nobody invites to has no live link.
- **128 random bits** (`crypto.randomBytes(16)`), base64url-encoded (22 characters). Unguessable; the URL is `/invite/<token>`.
- **Stored in plain text**, not hashed: admins must be able to see the link again. Acceptable because it only grants membership of one community and can be reset.
- A unique-constraint collision on creation (`P2002`, astronomically unlikely) is retried once with a fresh token.

## 4. API

All responses use the CLAUDE.md §4 envelope; `400` unparseable JSON, `422` validation failure.

**Token shape check:** a `:token` that is not 1–64 characters of `[A-Za-z0-9_-]` is treated exactly like an unknown token (`404`), never `422`, so the endpoint does not distinguish malformed from reset links.

### `GET /api/communities/:id/invite`

- **Auth:** required; caller must be an **admin** of the community.
- **Behaviour:** returns the token, creating it if the community has none.
- **Success:** `200` `{ invite: { token: string } }` — the client builds the URL from its own origin.
- **Errors:** `401` not signed in; `404` "Community not found." — community missing, caller not a member, or malformed id (as in feature 1); `403` "Only admins can invite people." — caller is a member but not an admin.

### `POST /api/communities/:id/invite/reset`

- **Auth:** as above (admin).
- **Request:** no body.
- **Behaviour:** replaces the token with a new one. The old link stops working immediately.
- **Success:** `200` `{ invite: { token: string } }` (the new token).
- **Errors:** `401`; `403` non-admin member; `404` as above.

### `GET /api/invites/:token` — public preview

- **Auth:** **public**. A session is optional; when present, the response also says whether the caller is already a member.
- **Success:** `200` `{ invite: InvitePreview }`

  ```ts
  {
    communityId: string; // for the generated cover colour and the "Open" link
    name: string;
    memberCount: number;
    alreadyMember: boolean; // false when signed out
  }
  ```

  Built field by field in `utils/invitePreview.ts`. No description, no member names, no token.

- **Errors:** `404` "This invite link is invalid or has expired. Please request a new link from the Community Admin." — unknown, reset, or malformed token (the UC-15 wording).

### `POST /api/invites/:token/accept`

- **Auth:** required; onboarding must be complete.
- **Request:** no body.
- **Behaviour:** adds the caller as `MEMBER`. **Idempotent:** a caller who is already a member (any role) gets the community back and nothing changes. A concurrent double accept (`P2002` on the membership key) is treated the same way.
- **Success:** `200` `{ community: PublicCommunity, joined: boolean }` — `joined` is false when they were already a member.
- **Errors:** `401` not signed in; `403` "Finish your profile first." — onboarding not complete; `404` the UC-15 message — unknown, reset, or malformed token.

### Logging

`info` on join with `{ userId, communityId }`; `info` on reset with `{ userId, communityId }`. **The token is never logged**, including in `warn` lines for rejected tokens (log only "invite not found").

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders (design comes later).

### 5.1 Routes

| Path             | Screen         | Guard                                                                                                                                                    |
| ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/invite/:token` | Invite preview | **None.** Signed-out and onboarded users see it; a signed-in user who still needs onboarding is sent to `/onboarding` with the invite remembered (§5.4). |

### 5.2 Shared Google sign-in (`components/GoogleSignIn.tsx`)

Extracted from `Welcome.tsx` without behaviour change: the provider (still mounted only where the button is shown), the button, "Signing you in…", and the four inline errors (Google failed, script blocked, offline, server). Welcome and the invite preview both render it. Welcome's existing tests keep passing unchanged; that is the proof of no regression.

### 5.3 Invite preview (`pages/InvitePreview.tsx`)

- **Layout:** BookRough wordmark; "You're invited to"; the community's generated cover (colour from `communityId`), name and member count; then the action area.
- **Action area, by state:**
  - **Signed out:** the shared Google sign-in with the line "Continue with Google to join". After sign-in, a returning onboarded user is back on this screen with **Join**; a new user goes through Complete Your Profile and returns here.
  - **Signed in, not a member:** **Join community** button → busy "Joining…" → on success, `/communities/:id` with `replace`.
  - **Signed in, already a member:** "You're already in this community." and an **Open** link to the community.
- **Loading:** skeleton cover and lines.
- **Invalid / reset link (`404`):** "This invite link is invalid or has expired. Please request a new link from the Community Admin." and a link to `/` (Welcome or the dashboard, depending on the session). Never a blank screen.
- **Other load failure:** inline retry (`LoadError`).
- **Join fails:** `404` (reset between preview and tap) → the invalid-link state; other errors → inline error above the button, button returns.
- **Offline:** banner "You're offline. Connect to join." and Join disabled; the shared sign-in already shows its own offline message.

### 5.4 Return trip through sign-in and onboarding

- Opening `/invite/:token` stores the path in `sessionStorage` (`pendingInvite`); joining, or seeing the invalid-link state, clears it.
- `homePathFor()` (where a signed-in user "belongs") returns the pending invite instead of `/home` once onboarding is complete, so: Complete Your Profile → Continue → back on the preview.
- `sessionStorage`, not `localStorage`: the pending invite should not outlive the tab and resurface days later. Wrapped in `try/catch`; if storage is unavailable the user simply lands on the dashboard and can tap the link again.

### 5.5 Invite panel on the community page (`components/InvitePanel.tsx`)

- **Who sees it:** the **Invite friends** button appears on the community page only when `myRole === 'ADMIN'` (developer's choice, option A). Server-side, a non-admin gets `403` regardless.
- **Panel contents:** the full link in a read-only field; **Share** (uses `navigator.share` with the community name as the title, available on iPhone; hidden when the browser has no Web Share, where **Copy** remains); **Copy** (clipboard, then "Copied" for two seconds; if the clipboard API fails, the field is selected so the user can copy by hand); **Reset link** (a quiet text button, with an inline confirmation inside the panel: "Reset the invite link? The current link will stop working for anyone who hasn't joined yet." → **Reset** / **Cancel**).
- **Loading:** spinner in the panel while the token is fetched; **error:** inline retry; **reset in progress:** busy "Resetting…"; after reset the field shows the new link and a quiet "New link created. The old one no longer works."
- **Opens once after creating** (developer's choice, option A): Create Community navigates to `/communities/:id` with router state `{ justCreated: true }`; the community page opens the panel when it sees that state and then clears it, so a reload or Back does not reopen it.
- Presented as a bottom sheet on phone width, a centred dialog on desktop; closable with a close button and Escape; focus is trapped while open and returns to the button on close.

### 5.6 Changes to existing screens

- **Community page:** **Invite friends** button (admins) under the member line; the member line now updates after someone joins on the next load.
- **Create Community:** passes `justCreated` on success; its static "Invite friends" card stays (it refers to the Phase 5 friends picker).

### 5.7 API module

`api/invites.ts`: `getInvite(communityId)`, `resetInvite(communityId)`, `previewInvite(token)`, `acceptInvite(token)` — all `skipErrorToast`, since every screen shows its own error.

## 6. Edge cases & failure modes

- **Admin resets while a friend has the preview open:** the friend's Join gets `404` → invalid-link state.
- **Two admins reset at the same moment:** last write wins; both panels show a token, one of which is already dead. Accepted; re-opening the panel shows the current link.
- **Same user taps Join twice / in two tabs:** idempotent; `P2002` treated as already a member.
- **Already-member opens the link:** "You're already in this community." No error, no second row.
- **Signed-out visitor who already has an account:** signs in on the preview, returns to it with Join (or "already in").
- **New user abandons onboarding mid-way:** the pending invite stays in the tab's `sessionStorage`; if they come back in the same tab and finish, they return to the preview. In a new tab they land on the dashboard and can reopen the link.
- **Un-onboarded user calls accept directly:** `403`.
- **Malformed token in the URL** (`/invite/%%%`, very long): `404` page state, no `422`, no `500`.
- **A non-admin calls the invite endpoints:** `403`; a non-member: `404`.
- **The community has no token yet and a non-admin asks:** still `403`; no token is created.
- **Community deleted (feature 3) after the link was sent:** token gone with the row → `404`.
- **Clipboard or Web Share unavailable:** Copy falls back to selecting the text; Share is hidden.
- **Network drops after Join was sent:** the user sees an error; if the join landed, retrying returns `joined: false` and opens the community.

## 7. Test scenarios

**Unit (`services/invite.service.ts`, `utils/invitePreview.ts`, token helper; frontend `lib/pendingInvite.ts`)**

- ✅ `getInvite` creates a token on first call and returns the same one on the second.
- ✅ `resetInvite` returns a different token; the old one no longer resolves.
- ✅ Token generator: 22 characters, base64url alphabet only; two calls differ.
- ✅ Token creation retries once on `P2002`.
- ❌ `getInvite` / `resetInvite`: non-member → `404`; member but not admin → `403`.
- ✅ `previewInvite` returns name, member count, `communityId`; `alreadyMember` true for a member, false for a non-member and for no session.
- ❌ `previewInvite` unknown token → `404` with the UC-15 message.
- ✅ `acceptInvite` adds a `MEMBER` row and returns `joined: true`.
- ✅ `acceptInvite` for an existing member returns `joined: false` and writes nothing; `P2002` race → `joined: false`.
- ❌ `acceptInvite` unknown token → `404`; un-onboarded → `403`.
- ✅ `toInvitePreview` returns exactly the four public fields (key-set equality).
- ✅/❌ `pendingInvite`: store / read / clear; storage that throws is tolerated.

**Integration (endpoints)**

- ✅ `GET /communities/:id/invite` as admin → `200`, token persisted; second call same token.
- ❌ `GET …/invite` `401`; `403` as a member; `404` as a non-member; `404` unknown and malformed id.
- ✅ `POST …/invite/reset` → `200`, new token; old token's preview → `404`.
- ❌ `POST …/invite/reset` `401`; `403` member; `404` non-member.
- ✅ `GET /invites/:token` signed out → `200`, `alreadyMember: false`, exact key set; signed in as member → `alreadyMember: true`.
- ❌ `GET /invites/:token` `404` unknown; `404` malformed (`%%%`, 65 characters); `404` after reset.
- ✅ `POST /invites/:token/accept` → `200`, `joined: true`, `MEMBER` row exists; community's `memberCount` is now 2.
- ✅ Accept again → `200`, `joined: false`, still one row; the admin stays `ADMIN`.
- ❌ Accept `401`; `403` un-onboarded; `404` unknown / reset / malformed token.
- 🔒 No response other than the two admin invite endpoints contains the token (`PublicCommunity`, preview, accept); the token never appears in captured log lines.

**Component (Vitest + RTL)**

- ✅ Preview signed out: cover, name, count, the Google sign-in and "Continue with Google to join"; the pending invite is stored.
- ✅ Preview signed in: Join → "Joining…" → navigates to the community with `replace`; pending invite cleared.
- ✅ Already a member: message and Open link, no Join.
- ❌ `404` → UC-15 invalid-link message; ❌ load error → retry; ❌ Join `404` → invalid-link state; ❌ Join other error → inline error, button returns; ❌ offline → banner, Join disabled.
- ✅ A signed-in user who needs onboarding on `/invite/:token` is sent to `/onboarding`; after onboarding the guard sends them back to the invite.
- ✅ Invite panel: loads and shows the link; Copy writes to the clipboard and shows "Copied"; Share calls `navigator.share` and is hidden without it; Reset asks for confirmation, then shows the new link; Cancel changes nothing; ❌ load error → retry; ❌ clipboard failure → field selected.
- ✅ Community page: Invite button for admins only; the panel opens by itself with `justCreated` state and not on a plain visit.
- ✅ Welcome still passes its existing suite after the `GoogleSignIn` extraction.

**E2E (Playwright)**

- ✅ Golden loop: user A creates "Friday Jazz" → the invite panel opens by itself → the link is read from the field. User B (a fresh browser context, signed out) opens the link → sees the preview → Continue with Google → Complete Your Profile → back on the preview → Join → lands in "Friday Jazz" showing "2 members". User A reloads → "2 members".
- ✅ After A resets the link, B's old link shows the invalid-link message.

## 8. Open questions & risks

- **iPhone PWA and links.** iOS opens a tapped link in Safari, not in a home-screen web app, and the installed PWA has its own cookie jar (`google-auth.md` §6). A friend who already uses the installed app will therefore join from Safari (signing in there once). Membership is server-side, so the community appears in the installed app on its next load. Acceptable; there is no web API to route a link into an installed PWA on iOS. Re-check in Phase 6.
- **Dependencies:** none new. `navigator.share` and `navigator.clipboard` are browser APIs.

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `communities.invite_token` (unique, nullable, lazily created, reset replaces it, never exposed outside the admin endpoints).
- `docs/use cases.md` + `.docx`: UC-15 — pre-conditions no longer require being signed in (public preview, sign-in on the preview); "revoked" means reset; only admins see the link; joining twice is harmless.
- `docs/frontend screens.md` + `.docx`: the Join Community preview screen (states listed in §5.3); 3.1 / community page gains the admin Invite button and panel; 3.3 notes the panel will also live in settings (feature 3).
- `DEVELOPMENT.md`: Step 2.2 filled per §13. `communities-create.md`: Merged ticked.

## 10. Decisions log

| Date       | Decision                                                                 | Reason                                                                                       |
| ---------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 2026-10-04 | One link per community, no expiry; admins can reset it (option A)        | Matches how friend groups share; reset handles a leaked link; expiry can be added later      |
| 2026-10-04 | Only admins see and reset the link (option A)                            | Developer's choice; recommendation was "members share, admins reset"                         |
| 2026-10-04 | Public preview before sign-in; explicit Join after (option A)            | A newcomer sees what they are joining; only name and count are exposed, to link holders only |
| 2026-10-04 | Invite panel on the community page; opens once after creating (option A) | Closes create → invite → join in the first minute; settings screen is feature 3              |
| 2026-10-04 | Token: 128 random bits, base64url, plain text, created lazily            | Unguessable; admins must see it again; no backfill for existing communities                  |
| 2026-10-04 | Malformed, unknown and reset tokens all return the same `404`            | A link holder cannot tell a typo from a reset; nothing to probe                              |
| 2026-10-04 | Accept is idempotent (`joined: false` for an existing member)            | Double taps, two tabs and retries after a dropped connection all end in the same place       |
| 2026-10-04 | Reset confirmation is inline in the panel, not a second dialog           | Stage 2: a dialog on top of the sheet would be a third floating layer on a phone             |
| 2026-10-04 | `optionalAuth` middleware for the public preview                         | Stage 2: reads a valid session if present; never 401s, clears or renews a cookie             |
