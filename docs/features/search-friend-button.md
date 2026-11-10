# Feature: Friend button on search results

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                   |
| ------------- | --------------------------------------------------------------------------------- |
| **Use cases** | UC-5 (search), UC-6 (send a request), UC-7 (accept / ignore) — amended, no new UC |
| **Phase**     | 6 — Step 6.1m of `DEVELOPMENT.md`, after the Mixtape redesign slices              |
| **Branch**    | `feat/search-friend-button`, cut from `main` once PR #56 is merged                |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                |

---

## 1. Goal

Today a Global Search result is only an avatar and a name that opens the person's profile; to add them as a friend you open the profile first. After this ships, each result row also shows where you stand with that person and the action that fits: **Add Friend**, **Request sent** (cancel in a sheet), **Respond** (Accept / Ignore in a sheet), or a quiet **Friends** label. Search is the natural place to find and add people, so this saves a screen on the most common way friendships start. It was deferred out of the redesign (`ui-redesign.md` §5.7, amended 2026-11-10) because it needs a backend change.

## 2. Scope

**In scope**

- `GET /api/users/search` returns the viewer's friendship with each result (§4).
- On the Search screen, every result row except the viewer's own gets the friend control (§5), in both designs (Current and Mixtape).
- `FriendButton` learns one thing: a `row` emphasis, so Add Friend and Respond are the accent pill in a search row under Mixtape (§5.2). A friend's row renders its own label and does not mount it.
- Doc updates (§10).

**Out of scope** — deliberately

- **Removing a friend from search.** A friend's row shows a label, not a button; Remove stays on the profile and the Friends tab (developer's choice, 2026-11-10, option B).
- Any change to the friend endpoints (`POST/DELETE /api/friends/...`) or their rules — the rows call them exactly as the profile does.
- Sorting or filtering results by friendship ("friends first", "hide friends"), mutual-friend counts, "people you may know".
- The friend control anywhere else a name appears (feed cards, Post Detail, member lists).
- Any visual change beyond placing the control in the row: every visual choice here uses existing kit buttons.

## 3. Data model changes

None. The batched read uses the `friends` table's existing indexes on `requester_id` and `addressee_id`.

## 4. API

### `GET /api/users/search?q=` — amended

- **Auth:** required, onboarded (unchanged).
- **Request:** unchanged — `{ q?: string (≤200) }`, strict.
- **Success:** `200`, `data: { users: SearchUser[], hasMore: boolean }`, where `SearchUser` is today's `MemberUser` (`id`, `displayName`, `profilePictureUrl`) plus:
  - `friendship: 'NONE' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'FRIENDS'` — the **viewer's** relation to that user, the same type and meaning as the profile endpoint's `friendship` (`friend-requests.md` §4). The viewer's own row carries `'NONE'`, as `friendshipOf` does for oneself; the frontend recognises that row by id.
- **Errors:** unchanged — `401` signed out, `403` mid-onboarding, `422` empty query ("Type a name to search."), `400` unknown query parameter or `q` over 200 characters.

**Service.** `searchUsers` keeps its two name queries, then makes **one** more query: every `friends` row between the viewer and any of the (≤20) result ids, in either direction. A new helper beside `areFriends` / `friendsOnPosts` in `services/friendship.ts` — `friendshipsWith(viewerId, ids): Map<string, Friendship>` — maps each row to the same `NONE / REQUEST_SENT / REQUEST_RECEIVED / FRIENDS` rule `friend.service` uses today (the rule moves to `friendship.ts` so both share one copy). An empty result runs no extra query. The response is still built field by field.

**Privacy.** The field says only how the **viewer** relates to each person — what the viewer already sees on each profile. It never reveals a relation between two other people.

## 5. Screens & components

### 5.1 Global Search (`frontend/src/pages/Search.tsx`)

Each result row, at phone width: the existing `PersonLink` (avatar, name, "· You" on your own row) on the left, taking the free width and still opening the profile; the control on the right, vertically centred. Long names truncate before the control does. The row stays at least 44px tall.

| `friendship`       | Control                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| own row            | nothing (as today)                                                                                                           |
| `NONE`             | **Add Friend** button — sends a request; toast "Request sent" or, if they had asked first, "You're now friends with {name}." |
| `REQUEST_SENT`     | **Request sent** button — opens the existing "Request sent" sheet with **Cancel request** (developer's choice, option A)     |
| `REQUEST_RECEIVED` | **Respond** button — opens the existing "Friend request" sheet with **Accept** / **Ignore**                                  |
| `FRIENDS`          | a quiet **✓ Friends** text label in `muted`, not a button (developer's choice, option B)                                     |

- **After an action** the row takes the server's answer (`onChanged`) and redraws in place — e.g. Add Friend → Request sent, Accept → ✓ Friends, Ignore / Cancel → Add Friend. The list does not reload, the order does not change, and the query stays in the URL.
- **A request that vanished under Accept** (`404`): the existing toast with the server's message, then the search reloads so every row shows the true state (`onStale`).
- **The Friends-tab badge** refreshes as it does from the profile (`FriendButton` already does this).
- **Designs.** Current: Add Friend and Respond in the primary style, Request sent secondary — as on the profile. Mixtape: Add Friend and Respond as the **accent** pill, Request sent outlined — the treatment `ui-redesign.md` §5.7 first specified for search rows (on the profile they stay secondary beside "Send a song", §5.6). Both use the kit `Button` at its normal size (44px tall), kept from shrinking; the name truncates instead.
- **Loading:** unchanged row skeletons; a busy control shows the kit's spinner, other rows stay usable.
- **Empty / no results / error:** unchanged.
- **Offline:** the field is already disabled; controls on rows already shown are disabled (the Mixtape offline treatment), nothing is queued (CLAUDE.md §16).

### 5.2 `FriendButton` (`frontend/src/components/FriendButton.tsx`)

- New optional prop `emphasis?: 'profile' | 'row'` — `row` makes Add Friend and Respond the primary/accent variant under Mixtape too. Default `profile`.
- In the `FRIENDS` state the button still renders as today when used on the profile; `Search` simply renders its own label for `FRIENDS` and does not mount `FriendButton` for that row. No change to its sheets, toasts, or error handling.

## 6. Edge cases & failure modes

- **The relation changed between search and tap** (they sent you a request meanwhile, or accepted yours): Add Friend still works — the server's send already turns a crossing request into a friendship and returns `FRIENDS`; the row shows ✓ Friends. Cancel on a request they already accepted returns `FRIENDS` likewise.
- **The other user deleted their account** between search and tap: the existing friend endpoints answer `404` "User not found." and the existing toast shows; the row keeps its state until the next search.
- **A request withdrawn under Accept**: `onStale` reloads the search (§5.1).
- **A newer search arrives while an action is in flight**: the late answer of the action is ignored for rows no longer shown (local per-row overrides are keyed by user id and cleared when the query changes).
- **The viewer's own row** never shows a control, whatever `friendship` says.
- **Double tap**: the button is busy during the request, as on the profile.
- **Offline mid-action**: the request fails, the generic failure toast shows, the row keeps its old state.

## 7. Test scenarios

**Unit (services)**

- ✅ `friendshipsWith`: maps a pending row sent by the viewer to `REQUEST_SENT`, one sent to the viewer to `REQUEST_RECEIVED`, an accepted row in either direction to `FRIENDS`; ids with no row are absent (read as `NONE`).
- ✅ `friendshipsWith` with an empty id list runs no query and returns an empty map.
- ✅ `searchUsers` attaches `friendship` to every result, `NONE` for the viewer's own row and for strangers.
- ❌ `searchUsers` keeps its existing errors: `403` mid-onboarding, `422` empty query — and runs no friendship query for an empty or marks-only query.

**Integration (`GET /api/users/search`)**

- ✅ `200`: results carry the right `friendship` for a stranger, a pending request each way, a friend (accepted from either side), and the viewer themself.
- ✅ `200`: one user's relations are not shown to another — a third viewer sees `NONE` for two people who are friends with each other.
- ✅ `200`: a removed friendship (unfriend) and an ignored request read as `NONE`.
- ❌ `400`: unknown query parameter; `q` over 200 characters (unchanged).
- ❌ `422`: missing or blank `q` (unchanged).
- ❌ `401`: signed out (unchanged).
- ❌ `403`: mid-onboarding viewer (unchanged).
- (No `404`: the endpoint has no resource id.)

**Component (`Search`, `FriendButton`)**

- ✅ Each result row shows the control for its state: Add Friend, Request sent, Respond, the ✓ Friends label; the viewer's own row shows none.
- ✅ Add Friend sends the request, shows the toast, and the row becomes Request sent without reloading the list.
- ✅ Respond → Accept makes the row ✓ Friends; Ignore makes it Add Friend.
- ✅ Request sent → Cancel request makes the row Add Friend.
- ✅ Both designs render (Current and Mixtape), with Add Friend in the accent style under Mixtape.
- ❌ A failed send shows the failure toast and the row keeps Add Friend.
- ❌ Accept answered `404` shows the server's message and reloads the search.
- ❌ Offline: the controls are disabled.
- ✅ `FriendButton` with `emphasis="row"` shows Add Friend as the accent pill under Mixtape; without it the profile's rendering is unchanged (secondary).

**E2E** — none. Friend requests are not a golden loop, and every path here is proven by the integration and component tests.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                   | Reason                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-10 | A friend's row shows a quiet "✓ Friends" label; Remove only from the profile / Friends tab | Developer's choice (B): no destructive action in a search list                                                                                                                                       |
| 2026-11-10 | A pending sent request is a "Request sent" button with Cancel in a sheet                   | Developer's choice (A): cancelling is harmless and lets a mis-tap be undone where it happened                                                                                                        |
| 2026-11-10 | Under Mixtape, Add Friend / Respond are accent pills in rows                               | Placeholder from `ui-redesign.md` §5.7's original wording; nothing competes with it in a row                                                                                                         |
| 2026-11-10 | No `compact` size prop: rows use the kit button at its normal size                         | Implementation: the kit `Button` already is `text-sm` and 44px tall; a padding override would fight its own `px-6` class order in Tailwind 4, and the row has room at 375px with the name truncating |

## 10. Documents updated with this feature

- `docs/use cases.md` + `.docx` — UC-6 pre-condition, trigger and scenario: "Add Friend" on the profile **or a Global Search result**; UC-7 trigger gains "Respond" on a search result.
- `docs/frontend screens.md` + `.docx` — 2.2 Global Search: each row's friend control.
- `docs/features/find-people.md`, `friend-requests.md` — an amendment note pointing here.
- `docs/features/ui-redesign.md` §5.7 — the deferral note points here.
- `DEVELOPMENT.md` — Step 6.1m.
