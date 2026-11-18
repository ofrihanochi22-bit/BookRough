# Feature: Conversion failure notice on My List and Public Profile

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-11, UC-12, UC-5 (amended)                                       |
| **Phase**     | 6 (a follow-up to conversion-retry.md)                             |
| **Branch**    | `feat/pending-notice-lists`                                        |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged |

---

## 1. Goal

conversion-retry.md (PR #85) gave `PostCard` a failure notice and a **Try again** button. Two other screens list pending posts with their own cards and still show only "Shared from {service}", with no explanation and no way to retry: **My List** (`SavedPostCard`) and the ratings list on **Public Profile** (`RatingRow`). This brings them in line.

## 2. Scope

**In scope**

- **My List** — developer's choice A: the same behaviour as `PostCard` (conversion-retry.md §5): the notice, **Try again**, the same outcome messages, and the card updated in place on success.
- **Public Profile ratings** — developer's choice A: a short notice only, **no button**. The whole row is a link to Post Detail, which already has Try again; a button inside a link is invalid, and splitting the row was not worth it.

**Out of scope**

- Any server change: `POST /api/posts/:postId/conversion` already lets any viewer retry.
- Any other screen (Post Detail, feeds and Recommendations already use `PostCard`).
- Visual design beyond the simplest placeholder.

## 3. Data model changes

None.

## 4. API

None. Reused: `POST /api/posts/:postId/conversion` — `200` the post (converted or still pending), `404` the viewer cannot see it, `409` already converted or link-only, `429` rate limit.

## 5. Screens & components

Shared copy lives in `frontend/src/hooks/useRetryConversion.ts`; one constant is added: `PENDING_SHORT_NOTICE` = **"Couldn't convert this link to other services."**

### 5.1 My List (`SavedPostCard`)

**Pending post the viewer can still open** (a direct recommendation, or a community post while the viewer is a member):

- Title line unchanged: "Shared from {service}".
- Below it, the notice `PENDING_NOTICE` ("Couldn't convert this link to other services. Something went wrong on our side."), `role="status"`, in the danger colour — as on `PostCard`.
- A **Try again** chip in the action row, between "Open in …" and Remove. Busy copy "Finding this track on other services…", disabled and `aria-busy` while retrying; disabled and dashed when offline.
- Outcomes (via `useRetryConversion`):
  - Converted → the card shows the converted post in place (title, artist, kind, "Open in" the viewer's service).
  - Still pending → notice becomes "Still couldn't convert it. Try again in a little while."
  - No answer → "Couldn't try again. Check your connection."
  - `429` / `5xx` → "Couldn't try again right now." (the request skips the global toast, so this line is the only feedback — conversion-retry.md §5 said a toast would name the cause; it never did).
  - `404` / `409` → the list reloads.

**Pending community post after the viewer left the community** (`isMember: false`): the notice, **no Try again** (`canRetrySaved` in `lib/savedPosts.ts`) — the server would answer `404` (the viewer can no longer see the post), and reloading would bring back the same card, so the button could never do anything.

### 5.2 Public Profile ratings (`RatingRow`)

- Pending post: "Shared from {service}", then `PENDING_SHORT_NOTICE` in the danger colour (small text). No button. Tapping the row opens Post Detail as today, where Try again lives.

## 6. Edge cases & failure modes

- **A retry converts the post while My List holds later pages** → only that card changes; loaded pages and removals are kept.
- **The same post appears elsewhere** → `retryConversion` already invalidates the feed, profile, profile ratings, My List and Recommendations caches.
- **Removing a card mid-retry** → the card leaves; the retry's late answer updates a card that is hidden, harmlessly.
- **Offline** → Try again disabled; the notice still shows (the offline banner explains why).

## 7. Test scenarios

**Component — My List**

- ✅ A pending saved post shows the notice and **Try again**.
- ✅ Retry success → the card shows the converted title and "Open in" the viewer's service.
- ❌ Retry still pending → the notice becomes "Still couldn't convert it…", the button stays enabled.
- ❌ Retry network error → "Couldn't try again. Check your connection."
- ❌ Retry `500` → "Couldn't try again right now."
- ❌ Retry `409` → the list reloads.
- ❌ Offline → Try again disabled.
- ❌ A pending post from a left community → notice, no Try again.

**Component — Public Profile**

- ✅ A pending rating shows "Shared from …" and the short notice, and no Try again button.
- ✅ A converted rating shows no notice.

**Unit / integration / E2E** — none: no service or endpoint changes, and `useRetryConversion` is already covered through `PostCard`.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                          | Reason                                                              |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| 2026-11-18 | Public Profile: notice only, no button (choice A) | The row is one link to Post Detail, which already offers Try again. |
| 2026-11-18 | My List: same as `PostCard` (choice A)            | The card links nowhere else; it is the saver's only place to retry. |
| 2026-11-18 | My List, left community: notice without Try again | The server answers `404` there, so the button could never succeed.  |
