# Feature: Invite friends to a community

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                         |
| ------------- | --------------------------------------------------------------------------------------- |
| **Use cases** | UC-9 (the friends picker); UC-7's "invite each other to Communities"; UC-9 amended (§9) |
| **Phase**     | 5 — Step 5.5 of `DEVELOPMENT.md` (added in `friend-requests.md` §0)                     |
| **Branch**    | `feat/invite-friends`                                                                   |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged                      |

---

## 1. Goal

A community's admins invite their friends from inside the app — on the Create Community form (replacing the static "Invite friends" card) and from the community's **Invite friends** panel. An invited friend sees the invitation on the **Friends** tab, whose badge now counts it, and taps **Join** or **Decline**. Nobody is added to a community without saying yes. The invite link (UC-15) keeps working alongside.

## 2. Scope

**In scope**

- Schema: `community_invitations` (§3).
- Endpoints: the picker's candidates, invite, cancel, my invitations, their count, join, decline (§4).
- The Create Community form's friends picker; a **Friends** section in the Invite friends panel (§5).
- An **Invitations** section on the Friends tab, above Requests; the Friends badge counts requests plus invitations (developer's choice, Q2 option A).
- Admins and the owner invite (Q3 option A). A blocked person can't be invited.
- Joining by the link, or being removed, clears that person's pending invitation to the community.
- A notification stub on a new invitation, ids only.
- Doc updates (§9).

**Out of scope** — deliberately

- Adding people without their consent (Q1 option B rejected).
- Inviting people who are not your friends, from search or a profile.
- Members who are not admins inviting (Q3).
- Invitation expiry; a reminder; a message attached to an invitation.
- The inviter being told about a decline; a list of an admin's sent invitations outside the picker.
- Inviting from Community Settings' member list.
- Any change to the invite link (UC-15).
- Offline reading — Phase 6. Offline, every invitation action is disabled.
- Visual design: placeholders from existing primitives.

## 3. Data model changes

Migration: `npx prisma migrate dev --create-only --name add_community_invitations` (inspected, applied, drift checked; the four hand-written objects confirmed present); the table added to the test `TRUNCATE` list.

```prisma
/// A pending invitation to join a community (UC-9's picker,
/// docs/features/invite-friends.md §3). Gone once accepted or declined.
model CommunityInvitation {
  communityId String    @map("community_id") @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  /// The admin who sent it; null once their account is deleted.
  invitedById String?   @map("invited_by_id") @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  community   Community @relation(fields: [communityId], references: [id], onDelete: Cascade)
  user        User      @relation("InvitationInvitee", fields: [userId], references: [id], onDelete: Cascade)
  invitedBy   User?     @relation("InvitationInviter", fields: [invitedById], references: [id], onDelete: SetNull)

  @@id([communityId, userId])
  @@index([userId, createdAt(sort: Desc)])
  @@index([invitedById])
  @@map("community_invitations")
}
```

- One invitation per person per community (the primary key); inviting again is a no-op.
- The `user_id` index serves "my invitations", the badge count and the invitee's cascade; the `invited_by_id` index serves the inviter's `SET NULL`.
- Cascades: deleting the community or the invitee deletes the invitation; deleting the inviter keeps it, without a name.
- The schema grows to **eleven tables**.

## 4. API

All responses use the CLAUDE.md §4 envelope. Every endpoint requires a signed-in, onboarded user (`requireAuth`; `403` "Finish your profile first." otherwise). Community-scoped endpoints use the existing access rules: a non-member gets `404` "Community not found."; a member who is not an admin gets `403` "Only admins can invite people." (the invite link's message).

### Shapes

```ts
type CandidateStatus = 'INVITABLE' | 'INVITED' | 'MEMBER' | 'BLOCKED';

InviteCandidate {                 // utils/invitationViews.ts, field by field
  user: MemberUser;
  status: CandidateStatus;
}

MyInvitation {
  community: { id: string; name: string; memberCount: number };
  invitedBy: MemberUser | null;   // null if the inviter's account is gone
  sentAt: string;
}
```

### `GET /api/communities/:id/invitations/candidates` — admins

- **Success:** `200 { candidates: InviteCandidate[] }` — every friend of the caller, alphabetical, with their status in this community: already a member, invited, blocked (in `community_bans`), or invitable.
- **Errors:** `401`; `403`; `404`.

### `POST /api/communities/:id/invitations` — admins

- **Request:** `{ userIds: string[] }` (UUIDs, 1–50, `.strict()`).
- **Behaviour:** creates an invitation for each id that is the caller's friend, not a member, not blocked, and not already invited; every other id is skipped silently (the response shows the truth). Notification stub per invitation. Idempotent.
- **Success:** `200 { candidates: InviteCandidate[] }` — the refreshed list.
- **Errors:** `400`; `401`; `403`; `404`; `422` — empty, more than 50, a malformed id, an unknown key.

### `DELETE /api/communities/:id/invitations/:userId` — admins

- Cancels a pending invitation. Idempotent. **Success:** `200 { candidates }`. **Errors:** `401`; `403`; `404` (also a malformed user id).

### `GET /api/invitations`

- **Success:** `200 { invitations: MyInvitation[] }` — the caller's pending invitations, newest first.

### `GET /api/invitations/count`

- **Success:** `200 { count: number }` — for the Friends badge.

### `POST /api/invitations/:communityId/accept`

- **Behaviour:** in one transaction — the invitation must exist; the caller must not be blocked (a ban added after the invitation wins); creates the `MEMBER` membership; deletes the invitation. Already a member (joined by the link meanwhile): the invitation is deleted and the call succeeds.
- **Success:** `200 { community: { id: string } }`.
- **Errors:** `401`; `403` mid-onboarding; `404` "This invitation is no longer available." — no invitation (cancelled, declined elsewhere, the community deleted), a malformed id, **or** the caller is blocked (the block is not announced, as with the link).

### `POST /api/invitations/:communityId/decline`

- Deletes the caller's invitation. Idempotent; the inviter is not told. **Success:** `200 null`. **Errors:** `401`; `403`; `404` malformed id only.

### Changes to existing endpoints

- `POST /api/invites/:token/accept` (the link) also deletes the joiner's pending invitation to that community.
- `DELETE /api/communities/:id/members/:userId` (removal, which blocks) also deletes the removed person's pending invitation — none can exist for a member, so this guards the order "invited, joined by link, removed".

### Logging and the stub

`services/invitationNotification.ts` — `notifyInvitation({ communityId, userId, invitedById })`, `info`, ids only, after commit, never failing the invite. `info` `{ userId, communityId, count }` "Invitations sent"; `{ userId, communityId }` "Invitation accepted" / "Invitation declined"; `{ userId, communityId, inviteeId }` "Invitation cancelled".

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 Friends picker (`components/FriendPicker.tsx`)

One list used in two places: each friend as avatar + name with a 44 px control on the right, by status — **Invite** (a checkbox on the Create form), **Invited** (tap to cancel, panel only), **Member** and **Blocked** (disabled, plain labels).

- **Loading:** skeleton rows. **Empty (no friends):** "You don't have friends on BookRough yet." with a link to Search. **Error:** "Couldn't load your friends." with Try again.

### 5.2 Create Community (`pages/CreateCommunity.tsx`)

- The static "Invite friends" card becomes the picker in checkbox mode (everyone `INVITABLE`: a new community has no members, invitations or bans). The friends load from `GET /api/friends`.
- **Create** creates the community as today, then sends `POST …/invitations` with the checked friends, then navigates to the community page (whose invite panel opens by itself, as today).
- If the invitations fail after the community was created, the user still lands on the community page, with toast "Your community is ready, but the invitations weren't sent. Try again from Invite friends."
- A failure to load friends never blocks creating: the picker shows its error state inside the form.

### 5.3 Invite panel (`components/InvitePanel.tsx`)

- Two sections, **Friends** first and **Invite link** below it (the existing link, Share, Copy, Reset unchanged).
- Friends: the picker in button mode; **Invite** sends one invitation; **Invited** cancels it on tap (its accessible name says so). Each action updates the list from the server's answer.
- Failures toast "Action failed. Please check your internet connection and try again." Offline: buttons disabled.

### 5.4 Friends tab (`pages/Friends.tsx`)

- **Invitations** section above Requests, shown only when there are any, newest first. Each row: the community's generated cover (small), its name, "{inviter} invited you · {n} members" ("You're invited · {n} members" when the inviter is gone), **Join** and **Decline**.
- **Join** → navigates to the community page; toast "You joined {name}." Badge refreshed.
- **Decline** → the row leaves; no toast. Badge decremented.
- A `404` on Join → the row leaves, the badge is refreshed, toast "This invitation is no longer available."
- Other failures: the row stays; toast "Action failed…".
- The combined empty state ("No friends yet") shows only when there are no invitations, requests or friends.

### 5.5 Tab bar

- The Friends badge counts pending friend requests **plus** invitations; its accessible name reads "Friends, 3 waiting" ("1 waiting"). The store fetches both counts on load and navigation.

## 6. Edge cases & failure modes

- **Inviting someone who is no longer your friend** (unfriended between loading the picker and tapping): skipped; the refreshed list no longer shows them.
- **An invitation outlives the friendship, the inviter's admin role, or the inviter's account** — it belongs to the community (inviter shown as gone).
- **Blocked after invited:** Join → `404` "no longer available"; the invitation is deleted.
- **Joined by the link first:** the invitation is deleted by the link's accept; a stale Friends tab's Join → `200` (already a member) and navigates.
- **Community deleted:** the cascade removes the invitation; a stale Join → `404`.
- **Two admins invite the same friend at once:** the primary key makes the second a no-op (`createMany` with `skipDuplicates`).
- **Invite list over 50:** `422`; the UI never sends more than the friends it shows, and the Create form caps selection at 50 with a note.
- **Network drop mid-action:** the toast; state unchanged.

## 7. Test scenarios

**Unit — `invitation.service`**

- ✅ Candidates: every friend with MEMBER / INVITED / BLOCKED / INVITABLE, alphabetical; requires admin.
- ✅ Invite creates invitations for invitable friends only, skips everyone else, notifies per invitation, idempotent.
- ✅ A failing stub is logged and does not fail the invite.
- ✅ Cancel deletes; idempotent.
- ✅ My invitations: newest first, community with member count, inviter as MemberUser or null; count.
- ✅ Accept joins as MEMBER and deletes the invitation in one transaction; already a member → deletes and succeeds.
- ❌ Accept with no invitation → `404`; blocked → `404` (same message), invitation deleted.
- ✅ Decline deletes; idempotent.
- ❌ Non-admin → `403`; non-member → `404`; mid-onboarding → `403`.

**Unit — serialisers**

- ✅ `toInviteCandidate` and `toMyInvitation` have exactly their keys.

**Integration (Supertest)**

- ✅ Lifecycle: admin invites a friend → the friend's count is 1 and the list shows it → Join → member, invitation gone, count 0.
- ✅ Decline: gone for both; the admin's candidates show INVITABLE again.
- ✅ Cancel by the admin; the invitee's list is empty.
- ✅ Skips: a non-friend, a member, a blocked person, an already-invited friend.
- ✅ The link's accept deletes a pending invitation; removal deletes one.
- ✅ Blocked after invited → Join `404`.
- ✅ The inviter's account deleted → the invitation stays, `invitedBy: null`.
- ❌ `422` empty / 51 ids / malformed / unknown key; `401` everywhere; `403` member, mid-onboarding; `404` non-member, malformed ids.
- ✅ Exact key sets on every shape.

**Component (Vitest + RTL)**

- ✅ Picker: each status renders its control; empty state links to Search; error with Try again.
- ✅ Create form: checked friends are invited after creating, then navigation; invitations failing still navigates and toasts; friends failing to load still lets you create.
- ✅ Invite panel: Invite → Invited; Invited → confirm → cancelled; failure toasts.
- ✅ Friends tab: invitations above requests; Join navigates and toasts; Decline removes; `404` removes and toasts; offline disables.
- ✅ Tab bar: the badge sums requests and invitations, "Friends, 3 waiting".

**E2E** — a golden loop: friends bringing each other into communities.

- A and B are friends; A creates a community and ticks B on the form; B sees the badge, opens Friends, taps Join, and lands in the community. (Chromium and iPhone WebKit; fresh accounts.)

## 8. Open questions & risks

- None at approval.

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `community_invitations`; **eleven tables**.
- `docs/use cases.md` + `.docx`: UC-9 — the picker on the form, an invitation the friend accepts; UC-7's last line now true; UC-15's note — invitations as the in-app path.
- `docs/frontend screens.md` + `.docx`: 2.1 (the badge counts invitations), 2.3 (Invitations section), 3.2 (the picker), 3.3 (the panel's Friends section).
- CLAUDE.md §6: eleven tables, `community_invitations` listed.
- `docs/features/communities-create.md`: the static card superseded (pointer to this spec); `unfriend.md`: Merged ticked.
- `DEVELOPMENT.md`: Step 5.5's entry per §13, and Phase 5 marked complete.

## 10. Decisions log

| Date       | Decision                                                                                           | Reason                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | An invitation the friend accepts or declines (option A)                                            | Consent: nobody joins a community without saying yes                                                                                            |
| 2026-10-06 | Invitations on the Friends tab, above Requests; the badge counts both (option A)                   | One inbox, one badge, both already built                                                                                                        |
| 2026-10-06 | Admins and the owner invite, from the Create form and the Invite friends panel (option A)          | Same rule as the invite link; invite after creation too                                                                                         |
| 2026-10-06 | Decline is silent and deletes; admins may invite again                                             | Mirrors Ignore                                                                                                                                  |
| 2026-10-06 | Blocked people can't be invited, and a later block wins at Join, unannounced                       | The link's ban rule, applied the same way                                                                                                       |
| 2026-10-06 | An invitation belongs to the community: it survives the friendship, the inviter's role and account | Nothing about the community changed; the inviter shown as gone                                                                                  |
| 2026-10-06 | Invalid invitees are skipped, not errors; the response is the refreshed candidate list             | A stale picker never fails a batch; the UI shows the truth                                                                                      |
| 2026-10-06 | The Create form invites after creating, in a second request                                        | Creating stays exactly as tested; an invite failure never loses the community                                                                   |
| 2026-10-06 | The link's accept and removal clear a pending invitation                                           | No invitation to a community you're already in, or were removed from                                                                            |
| 2026-10-06 | Join navigates to the community                                                                    | As UC-15 does after joining                                                                                                                     |
| 2026-10-06 | Stage 2: tapping **Invited** cancels at once, without a confirmation                               | Cancelling is undone by tapping Invite again — like a mistaken tap, not a destructive act; mirrors cancelling a friend request in one sheet tap |
| 2026-10-06 | Stage 2: `CommunityCover` gains a `thumb` size for invitation rows                                 | A 44 px leading square beside the name                                                                                                          |
