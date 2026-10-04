# Feature: Communities — settings and membership management

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Use cases** | UC-10 (leave a community), UC-14 (admin removes a user); UC-9/UC-15 touched               |
| **Phase**     | 2 — Step 2.3 of `DEVELOPMENT.md` (re-sliced; absorbs former 2.3 leave/kick, 2.5 settings) |
| **Branch**    | `feat/communities-membership`                                                             |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                        |

---

## 1. Goal

Every community gets a **Settings & Members** screen. Anyone can see who is in the community and leave it. Admins can remove members — which also blocks them from rejoining — unblock them, promote members to admin and demote admins, edit the community's name and description, and open the invite panel. The community's **owner** (its creator) cannot be demoted or removed, is the only one who can delete the community, and hands ownership to someone else before leaving.

## 2. Scope

**In scope**

- Schema: an `OWNER` community role (exactly one per community) and a `community_bans` table.
- Endpoints: member list; leave; remove (and block); change role; transfer ownership; blocked list and unblock; edit details; delete community.
- Invites: a blocked user gets the invalid-link answer from the preview and from accept.
- Screens: Community Settings & Members (new); a Settings entry on the community page; "Owner" labels on the dashboard and community page.
- Doc updates (§9).

**Out of scope** — deliberately

- Soft delete or undo of a deleted community (option C, rejected): deletion is immediate and final.
- Blocking someone who was never a member, or blocking without removing.
- Notifications ("you were removed", "the community was deleted"): the app never sends messages (CLAUDE.md §5 — no email), and in-app notifications are not a UC.
- A reason or note attached to a block.
- Moderating posts — Phase 3+ (UC-18 covers deleting one's own post).
- Any app-wide admin power over communities — that is UC-19's admin area.

## 3. Data model changes

### 3.1 The owner role

```prisma
enum CommunityRole {
  OWNER   // exactly one per community: the creator, until ownership is transferred
  ADMIN
  MEMBER
}
```

- **Exactly one owner per community**, enforced in the database by a partial unique index: `CREATE UNIQUE INDEX community_members_one_owner ON community_members (community_id) WHERE role = 'OWNER'`. Prisma's schema language cannot express a partial index, so this one line is hand-written SQL inside the migration (the CLAUDE.md §4 exception: it genuinely cannot be expressed in Prisma). The schema carries a comment pointing at it.
- **Creating a community** now makes the creator `OWNER` (was `ADMIN`).
- **Existing communities:** the migration promotes each community's earliest-joined `ADMIN` to `OWNER` (ties broken by `user_id`).
- Two migrations, because Postgres cannot use a new enum value in the transaction that adds it: `add_community_owner_role` (the value) and `backfill_community_owners` (the data and the partial index).
- **The owner counts as an admin everywhere** (invite link, removing, roles, editing). "Admin" in this document means `ADMIN` or `OWNER` unless it says otherwise.

### 3.2 Blocks

Migration (with the backfill): `add_community_bans`

```prisma
/// A user removed from a community, who cannot rejoin through any invite link
/// until an admin unblocks them (docs/features/communities-membership.md §3.2).
model CommunityBan {
  communityId String    @map("community_id") @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  /// Who removed them; null if that admin's account is later deleted.
  bannedById  String?   @map("banned_by_id") @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  community   Community @relation(fields: [communityId], references: [id], onDelete: Cascade)
  user        User      @relation("BannedUser", fields: [userId], references: [id], onDelete: Cascade)
  bannedBy    User?     @relation("BannedBy", fields: [bannedById], references: [id], onDelete: SetNull)

  @@id([communityId, userId])
  @@map("community_bans")
}
```

- **Every removal is a block** (developer's choice, option B): the membership row is deleted and the ban row created in one transaction. Leaving voluntarily does not block.
- **Unblocking** deletes the ban row. It does not re-add the person; they may rejoin through the current link.
- The schema grows to **eight tables**; `docs/tables.md` and CLAUDE.md §6 are updated.

## 4. API

All responses use the CLAUDE.md §4 envelope; `400` unparseable JSON, `422` validation failure. Every route below sits under `/api/communities/:id`; a malformed or unknown `:id`, or a caller who is not a member, gets `404` "Community not found." (as in features 1 and 2). Where a permission is missing, the caller gets `403`.

### Shapes

```ts
// The caller's role now includes OWNER.
PublicCommunity.myRole: 'OWNER' | 'ADMIN' | 'MEMBER';

CommunityMember {            // utils/communityMember.ts, field by field
  user: { id: string; displayName: string; profilePictureUrl: string | null };
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

BlockedUser {                // utils/blockedUser.ts, field by field
  user: { id: string; displayName: string; profilePictureUrl: string | null };
  blockedAt: string;
}
```

Member and blocked-user entries carry **only** these user fields — no `preferredService`, no `createdAt`, nothing else from `users`.

### Members

| Method & path             | Who                         | Behaviour                                                                                               | Success                                                           | Errors                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /members`            | any member                  | Owner first, then admins, then members; within each, oldest `joined_at` first                           | `200 { members: CommunityMember[] }`                              | `401`, `404`                                                                                                                                                                                                                                                                                                                                                     |
| `DELETE /members/me`      | any member except the owner | Leaves. Does not block                                                                                  | `200 { data: null }`                                              | `401`, `404`, `409` owner: "You're the owner. Transfer ownership to another member or delete the community before leaving."                                                                                                                                                                                                                                      |
| `DELETE /members/:userId` | admin                       | Removes **and blocks** a `MEMBER`, in one transaction                                                   | `200 { data: null }`                                              | `401`; `403` "Only admins can remove people."; `404` "Member not found." (not a member, or malformed id); `409` target is an admin: "Cannot remove an Admin. You must demote this user to a standard member before removing them." (UC-14); `409` target is the owner: "The owner can't be removed."; `422` target is the caller: "Use Leave Community instead." |
| `PATCH /members/:userId`  | admin                       | Body `{ role: 'ADMIN' \| 'MEMBER' }` (`.strict()`). Promotes or demotes. An admin may demote themselves | `200 { member: CommunityMember }`                                 | `401`; `403` caller not an admin; `404` member not found; `409` target is the owner: "The owner's role can't be changed. Transfer ownership instead."; `422` bad body (`OWNER` is not accepted here)                                                                                                                                                             |
| `POST /ownership`         | **owner**                   | Body `{ userId }`. Target becomes `OWNER`, the caller becomes `ADMIN`, in one transaction               | `200 { community: PublicCommunity }` (caller's view, now `ADMIN`) | `401`; `403` "Only the owner can do this."; `404` target not a member; `422` target is the caller, or bad body                                                                                                                                                                                                                                                   |

Setting a role to its current value is a no-op `200`.

### Blocks

| Method & path          | Who   | Behaviour                 | Success                          | Errors                                           |
| ---------------------- | ----- | ------------------------- | -------------------------------- | ------------------------------------------------ |
| `GET /bans`            | admin | Newest first              | `200 { blocked: BlockedUser[] }` | `401`, `403`, `404`                              |
| `DELETE /bans/:userId` | admin | Unblocks; does not re-add | `200 { data: null }`             | `401`, `403`, `404` "This person isn't blocked." |

### Community details

| Method & path | Who       | Behaviour                                                                                                                                                  | Success                              | Errors                                                                                                           |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `PATCH /`     | admin     | Body `{ name?, description? }`, `.strict()`, at least one key; the feature 1 rules (§4 of `communities-create.md`); `description: null` or blank clears it | `200 { community: PublicCommunity }` | `400`, `401`, `403` "Only admins can edit the community.", `404`, `422` rule failures / empty body / unknown key |
| `DELETE /`    | **owner** | Deletes the community; memberships, bans (and later posts) cascade                                                                                         | `200 { data: null }`                 | `401`, `403` "Only the owner can delete the community.", `404`                                                   |

### Changes to existing endpoints

- `POST /api/communities` — the creator's membership is `OWNER`.
- Invite endpoints — "admin" now means `ADMIN` or `OWNER`.
- `GET /api/invites/:token` — if a session is present and that user is blocked from the community, `404` with the UC-15 message (developer's choice, option A: a blocked user is told nothing more). Signed-out visitors cannot be identified and see the normal preview.
- `POST /api/invites/:token/accept` — a blocked user gets the same `404`.

### Logging

`info` with `{ userId, communityId, targetUserId? }` on leave, remove-and-block, role change, ownership transfer, unblock, edit, and delete. No names, no descriptions.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders (design comes later).

### 5.1 Route

`/communities/:id/settings` — inside the tab layout, same guard as the community page. Not a member → the standard not-found page.

### 5.2 Entry points

- **Community page:** a **Settings** button (all members) next to **Invite friends** (admins).
- **Dashboard and community page:** the role label reads "Owner", "Admin", or nothing.

### 5.3 Community Settings & Members (`pages/CommunitySettings.tsx`)

Top to bottom, sections shown according to the caller's role:

1. **Header:** back to the community; title "Settings".
2. **Details** (admins): the name and description fields from Create Community (extracted into a shared `CommunityDetailsFields` component), **Save changes** (busy "Saving…"), disabled until something changed and both fields are valid. Success → toast "Changes saved". `422` under the field, as on Create.
3. **Invite** (admins): **Invite friends** → the invite panel from feature 2.
4. **Members** (everyone): one row per member — avatar, display name, "You" for the caller, an "Owner" / "Admin" label. A **⋯** menu on rows where the caller can act, containing only the allowed actions:
   - admin, on a `MEMBER`: **Make admin**, **Remove from community**
   - admin, on an `ADMIN` (including themselves): **Make member**
   - owner, on anyone else: **Make owner** (in addition to the above)
   - nobody acts on the owner's row except through transfer.
5. **Blocked** (admins, shown only when non-empty): avatar, name, "Blocked {date}", **Unblock** (no confirmation; reversible).
6. **Leave community** (everyone): confirmation "Are you sure you want to leave this community?" (UC-10) → dashboard. For the owner, tapping it opens the UC-10 owner message instead ("You're the owner. Transfer ownership to another member or delete the community before leaving.") with **OK**.
7. **Delete community** (owner only), at the bottom, styled as a danger action.

### 5.4 Confirmations

All use the `Sheet` primitive from feature 2.

- **Remove:** "Are you sure you want to remove {name} from this community?" (UC-14) + "They won't be able to rejoin until an admin unblocks them." → **Remove** / **Cancel**. Afterwards the row disappears from Members and appears under Blocked.
- **Make owner:** "Make {name} the owner? You'll become an admin, and only {name} will be able to delete the community." → **Make owner** / **Cancel**.
- **Delete** (developer's choice): "Delete {community name}? Warning: this can't be undone. The community will be deleted for all {n} members." A checkbox **"I understand this can't be undone"**; **Delete community** stays disabled until it is ticked. Success → dashboard, toast "Community deleted".
- **Make admin / Make member / Unblock:** no confirmation — each is reversible with one tap.

### 5.5 States

- **Loading:** skeletons for the details and member rows (the community, the members and — for admins — the blocked list load in parallel).
- **Load error:** `LoadError` with Try again. `404` → not-found page.
- **Action in progress:** the confirming button busy, the sheet not dismissible (as in feature 2).
- **Action failed:** `409`/`422` messages from the server shown in the sheet or above the list; `404` "Member not found." (someone else already acted) → the lists reload.
- **Lost access mid-screen** (removed by another admin, or the community was deleted): any `404` on an action or reload → the not-found page.
- **Offline:** banner "You're offline. Connect to make changes." and every action disabled; the lists stay readable.

## 6. Edge cases & failure modes

- **Two admins act on the same member at once** (one removes, one promotes): the second gets `404` (gone) or a `409` (now an admin); the screen reloads its lists.
- **An admin demotes themselves:** allowed; their screen re-renders as a member's (no admin sections).
- **Owner transfers while another admin is promoting the target:** transfer wins or the role change returns the current state; the partial unique index guarantees there is never more than one owner.
- **Owner is the only member** and wants out: Leave shows the owner message; Delete is the way.
- **A removed user has the community open:** their next request is `404` → not-found page; the community disappears from their dashboard.
- **A blocked user opens the invite link signed in:** invalid-link message; signed out: normal preview, and after signing in the preview reloads into the invalid-link message.
- **A blocked user is unblocked:** they can rejoin through the current link; they are not re-added.
- **The admin who blocked someone deletes their account later:** `banned_by_id` becomes null; the block stays.
- **Community deleted while someone has the preview open:** their Join gets the UC-15 `404` (feature 2 already maps it).
- **Edit with the same values:** allowed, a no-op `200`.
- **`PATCH /members/:userId` with `{ role: 'OWNER' }`:** `422` — ownership only moves through transfer.
- **Malformed `:userId`:** `404` "Member not found." / "This person isn't blocked.", never `422` or `500`.

## 7. Test scenarios

**Unit (`services/membership.service.ts`, `services/community.service.ts` updates, serialisers; frontend permission helper `lib/communityRoles.ts`)**

- ✅ `listMembers` orders owner → admins → members, oldest first within each.
- ✅ `leave` removes a member or an admin without blocking; ❌ owner → `409`; ❌ non-member → `404`.
- ✅ `removeMember` deletes the membership and creates the ban in one transaction with `bannedById`.
- ❌ `removeMember`: caller is a member → `403`; target admin → `409`; target owner → `409`; target self → `422`; target not a member → `404`.
- ✅ `changeRole` promotes and demotes; self-demotion allowed; same role → no-op.
- ❌ `changeRole`: caller member → `403`; target owner → `409`; target not a member → `404`.
- ✅ `transferOwnership` swaps roles in one transaction.
- ❌ `transferOwnership`: caller admin → `403`; target self → `422`; target not a member → `404`.
- ✅ `listBlocked` newest first; `unblock` deletes the ban; ❌ not blocked → `404`; ❌ caller member → `403`.
- ✅ `updateCommunity` applies cleaned name and description; blank description → null; ❌ invalid name/description → `422`; ❌ caller member → `403`.
- ✅ `deleteCommunity` deletes; ❌ caller admin → `403`.
- ✅ `createCommunity` makes the creator `OWNER`.
- ✅ Invites: a blocked signed-in caller → preview `404` and accept `404`; an admin and the owner both pass the invite admin check.
- ✅ `toCommunityMember`, `toBlockedUser`: exact key sets, nested user has exactly three keys.
- ✅ Frontend `communityRoles`: which actions each role may take on each target role (table-driven).

**Integration (endpoints)** — for each endpoint: success, `401`, `403` wrong role, `404` non-member / unknown / malformed id, and `400`/`422` where a body exists; plus:

- ✅ Remove → the user's preview of the invite link (signed in) is `404`; accept is `404`; unblock → accept works again.
- ✅ Leave → no ban; accepting the link again works.
- ✅ Transfer → `GET /members` shows the new owner and the old owner as admin; the old owner can now leave.
- ❌ A second `OWNER` cannot exist: forcing one through Prisma in a test raises the unique violation (proves the partial index).
- ✅ Delete → `GET /communities/:id` is `404` for every former member; their ban and membership rows are gone; the invite link is dead.
- ✅ Migration backfill: a community created before the migration has its earliest admin as owner (tested by inserting an `ADMIN`-only community and running the backfill SQL in the test DB).
- 🔒 No member or blocked-user payload contains `preferredService`, `googleSub`, `createdAt` of the user, or any key beyond the shape.

**Component (Vitest + RTL)**

- ✅ Settings as a member: members list, Leave; no Details, Invite, Blocked, Delete, or ⋯ menus.
- ✅ As an admin: Details, Invite, ⋯ menus with the allowed actions only, Blocked list; no Delete; no Make owner.
- ✅ As the owner: everything, including Make owner and Delete.
- ✅ Remove: confirmation text (UC-14) → row moves to Blocked; ❌ `409` → message shown.
- ✅ Unblock removes the row.
- ✅ Make admin / Make member update the label without a confirmation.
- ✅ Make owner: confirmation → roles swap on screen.
- ✅ Leave: confirmation (UC-10) → dashboard; owner → the owner message instead.
- ✅ Delete: button disabled until the checkbox is ticked → dashboard; ❌ failure → error in the sheet.
- ✅ Edit: Save disabled until changed; saves; ❌ `422` under the field.
- ❌ Loading skeleton; load error with Try again; `404` → not-found page; offline banner disables actions.
- ✅ Community page shows Settings to everyone; dashboard and page show "Owner".

**E2E (Playwright)**

- ✅ Golden loop extension: A creates a community, B joins through the link; A opens Settings, removes B; B (reloading) loses access and the link now shows the invalid-link message; A unblocks B; B joins again.
- ✅ A makes B the owner; A leaves; B sees themselves as owner. B deletes the community after ticking the checkbox; it disappears from B's dashboard.

## 8. Open questions & risks

- **Partial unique index is hand-written SQL** in a migration. It survives `prisma migrate dev` because Prisma ignores indexes it did not create — but `prisma db push` (not used in this project) would drop it. Recorded in `docs/tables.md`.
- **No dependencies added.**

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `CommunityRole` gains `OWNER` (one per community, partial unique index); new table 8 `community_bans`; "seven tables" → eight.
- CLAUDE.md §6: eight tables, `community_bans` listed.
- `docs/use cases.md` + `.docx`: UC-10 fail path is the owner (not "sole Admin"), with the transfer-or-delete message; UC-14 — removal also blocks; the owner can't be removed; unblocking; a blocked user's invite shows the UC-15 message. UC-9: the creator becomes the owner.
- `docs/frontend screens.md` + `.docx`: 3.3 Community Settings & Members (sections, menus, confirmations, states); 2.1 / 3.1 role labels.
- `DEVELOPMENT.md`: Step 2.3 filled per §13. `communities-invites.md`: Merged ticked.

## 10. Decisions log

| Date       | Decision                                                                                                                                                                                                    | Reason                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-04 | One Settings & Members screen with members, leave, remove, roles, edit, delete (option A)                                                                                                                   | UC-10/UC-14 error messages point at promote/demote and delete; editing is cheap                                                    |
| 2026-10-04 | Removal always blocks; admins can unblock (option B)                                                                                                                                                        | Developer's choice; recommendation was a "reset the link" checkbox                                                                 |
| 2026-10-04 | A blocked user's invite shows the UC-15 invalid-link message (option A)                                                                                                                                     | Doesn't announce the block among friends                                                                                           |
| 2026-10-04 | The creator is the owner: can't be demoted or removed; only the owner deletes (option B)                                                                                                                    | Developer's choice; recommendation was "all admins equal"                                                                          |
| 2026-10-04 | Owner leaves only after a manual ownership transfer (option A)                                                                                                                                              | The owner chooses their successor                                                                                                  |
| 2026-10-04 | Delete confirmed with a warning and an "I understand" checkbox                                                                                                                                              | Developer's choice (custom option)                                                                                                 |
| 2026-10-04 | One owner per community enforced by a partial unique index (hand-written SQL)                                                                                                                               | The invariant must hold under races; Prisma cannot express a partial index                                                         |
| 2026-10-04 | Make admin / Make member / Unblock need no confirmation                                                                                                                                                     | Each is reversible in one tap                                                                                                      |
| 2026-10-04 | The ⋯ menu expands inline under the row instead of a popover                                                                                                                                                | Stage 2: no popover primitive exists; an inline row of buttons keeps 44 px targets and needs no positioning code                   |
| 2026-10-04 | The screen reloads all its data quietly after each action                                                                                                                                                   | Stage 2: one source of truth after concurrent changes by other admins, without a skeleton flash                                    |
| 2026-10-04 | Name/description fields and rules shared with Create via `useCommunityDetailsForm` + `CommunityDetailsFields`                                                                                               | Stage 2: one implementation of feature 1's rules for both screens                                                                  |
| 2026-10-04 | Every role-dependent write is conditional on the role just checked (`deleteMany`/`updateMany` with `role` in the WHERE); overlapping transfers return `409` "Ownership just changed. Reload and try again." | `/code-review`: a transfer racing a demotion or a leave could leave a community with no owner — the partial index only forbids two |
