# Feature: Tell a member when they're made an admin or the owner

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                      |
| ------------- | -------------------------------------------------------------------- |
| **Use cases** | UC-14 (roles) and UC-21 (notifications), amended                     |
| **Phase**     | 6 — Step 6.1g of `DEVELOPMENT.md`, from manual-test note **N5** (§0) |
| **Branch**    | `feat/role-notifications`                                            |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged   |

---

## 0. Where this comes from

Note **N5** of the manual test session (`docs/manual-tests/2026-11-04.md` §7). When a member is made an admin, nothing tells them. The note asked for a notification and/or consent, and left the choice for later. With the notification center now in place (UC-21, `notifications.md`), the developer decided it in this session, 2026-11-08:

| #   | Question            | Decision                                                                                                                 |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D1  | Notify, or consent? | **Notify only.** The promotion stays immediate, as today. No pending state, no Accept or Decline.                        |
| D2  | Which changes?      | **Made an admin, and made the owner** (an ownership transfer). A demotion to Member stays silent, as a removal is today. |

## 1. Goal

A member learns from the bell that a friend trusted them with a community, and which community it is, instead of stumbling on new menu items.

## 2. Scope

**In scope**

- Two new notification types, `COMMUNITY_ADMIN` and `COMMUNITY_OWNER`, written by `changeRole` and `transferOwnership`.
- Their rows on the Notifications screen, which open the community.
- Amendment notes in `notifications.md` (types and visibility) and `communities-membership.md`. Updates to UC-14 and UC-21 in `use cases`, and to the `NotificationType` list in `tables`, all .md + .docx.

**Out of scope**

- Consent, a pending role, or Step down from the notification (D1). Stepping down stays where it is today, in Community Settings.
- A notification for a demotion, a removal or a block (D2).
- Telling the previous owner anything. The transfer was their own action.
- Visual design.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_role_notifications`.

- `NotificationType` gains `COMMUNITY_ADMIN` and `COMMUNITY_OWNER` (`ALTER TYPE … ADD VALUE`). There are no new columns. Each row uses `user_id` (the member), `actor_id` (who did it) and `community_id`.

## 4. API

No new endpoint. The notification endpoints from `notifications.md` §4 serve the new types unchanged, apart from:

- **Writing** (`notification.service.ts` → `notifyRole({ communityId, userId, actorId, role })`):
  - `changeRole` writes `COMMUNITY_ADMIN` only when the row actually changed from MEMBER to ADMIN. Re-promoting someone who is already an admin writes nothing. It runs after the update, never failing it, like every writer (`writeSafely`).
  - `transferOwnership` writes `COMMUNITY_OWNER` for the new owner after the transaction commits.
  - **At most one unread row** per (member, type, community). If a member is demoted and promoted again before reading, the unread row is refreshed rather than a second one stacked, the same rule as friend requests.
- **Visibility** (§4 of `notifications.md`): both types show only **while the reader is still a member** of the community, the same rule as `COMMUNITY_POSTS`. A member who left, or was removed, stops seeing them.
- **Serialisation:** unchanged. `community` is set, and `post` is null.

## 5. Screens & components

### 5.1 Notifications screen rows

- `COMMUNITY_ADMIN`: "**Dana** made you an admin of Friday Jazz". It opens `/communities/:id`.
- `COMMUNITY_OWNER`: "**Dana** made you the owner of Friday Jazz". It opens `/communities/:id`.

Nothing else changes: the Home badge, the bell and Mark all as read already cover every type.

## 6. Edge cases & failure modes

- **Promoted, then demoted before reading:** the notification stays. It still opens the community, where the menu shows the current role. Accepted, as the badge is a hint.
- **Promoted, then removed:** it's hidden by the visibility rule.
- **Made an admin twice** (demoted and re-promoted while the first is unread): one unread row, refreshed.
- **Two admins promoting the same member at the same instant:** the update-else-create in `notifyRole` isn't atomic, so two unread rows can appear. It's rare and harmless, and it matches the friend-request rule (`/code-review`, recorded rather than changed).
- **A transfer that fails** (the target left, or an overlapping transfer): nothing is written, because the writer runs after the commit.
- **The notification write fails:** a `warn` is logged, and the role change stands.

## 7. Test scenarios

**Unit (services)**

- `notification.service`:
  - ✅ `notifyRole` creates the row when none is unread.
  - ✅ It refreshes an unread one instead of creating.
  - ✅ The visibility filter includes both new types under membership.
- `membership.service` `changeRole`:
  - ✅ MEMBER → ADMIN notifies.
  - ❌ ADMIN → ADMIN writes nothing.
  - ❌ ADMIN → MEMBER (demotion) writes nothing.
  - ❌ A refused change (an owner, 409) writes nothing.
- `transferOwnership`:
  - ✅ Notifies the new owner after the transaction.
  - ❌ A failed transfer (404 or 409) writes nothing.

**Integration (endpoints)**

- ✅ PATCH a role to ADMIN → the member's `GET /notifications` shows `COMMUNITY_ADMIN` with the actor and the community, and the unread count goes up.
- ✅ POST an ownership transfer → `COMMUNITY_OWNER` for the new owner. The old owner gets nothing.
- ❌ A demotion → no new row.
- ❌ Removed after being promoted → the row is gone from the list and the count.

**Component**

- `Notifications.test.tsx`: ✅ both new rows' copy and destination.

**E2E**: none. Integration and component tests cover it, and it isn't a golden loop.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                     | Reason                                                                            |
| ---------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-11-08 | D1, D2 (§0)                                  | Developer's choices in the spec session.                                          |
| 2026-11-08 | Shown only while still a member              | A role in a community you've left is meaningless, and it matches the post groups. |
| 2026-11-08 | One unread row per (member, type, community) | A demote and re-promote mustn't stack notices.                                    |
