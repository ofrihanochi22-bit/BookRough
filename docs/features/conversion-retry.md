# Feature: Conversion failure notice and Try again

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-11, UC-20 (amended)                                             |
| **Phase**     | 6 (a fix to Step 3 / Step 6.1a)                                    |
| **Branch**    | `feat/conversion-retry`                                            |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged |

---

## 1. Goal

When a link could not be converted, everyone who sees the post is told plainly that conversion did not complete because of a problem, and can press a dedicated **Try again** button. A retry that fails again leaves a visible message, not a card that looks untouched. Alongside, the scraper bug that made one Apple Music link fail every time is fixed.

### 1.1 Why this came up (production, 2026-11-18)

- Recommendation `8d7a85ae…` (`https://music.apple.com/us/song/tsitsushka/1483168329`) was saved pending with `reason: "no answer"`. Three retries failed the same way, each after ~9 s.
- Reproduced locally: squigly.link converts the link in under 3 s but opens the result at a **short-code address** (`https://squigly.link/edWSMP`) instead of `/song/<artist>/<title>`. `RESULT_PAGE_URL` in `linkScraper.service.ts` accepts only `/song/` and `/album/`, so the scraper waits out `STEP_TIMEOUT_MS` and gives up. Popular tracks still get the long address, which is why most links worked.
- The short-code page carries the same JSON-LD (`MusicRecording`), `og:` tags and service links, so `parseResultPage` reads it unchanged.
- "Does nothing": the retry did run, but its only feedback was a small grey `"Still unavailable. Try again later."` line under the card, after a 9-second wait.

## 2. Scope

**In scope**

- Scraper: also accept a short-code result URL (`https://squigly.link/<letters and digits>`).
- Server: any viewer of a pending post may retry it (developer's choice A), not only the author.
- Card: a clear failure notice for every viewer of a pending post, a **Try again** button, and a persistent, visible message when a retry fails again.
- The existing pending post in production converts on the first retry after deploy (no data fix needed).

**Out of scope**

- Any limit on retries beyond the existing `conversion` rate-limit tier (10 per user per 10 min) — developer's choice A: no per-post cooldown and no attempt cap.
- Automatic background retries, polling, or notifying the author when someone else's retry succeeds.
- Telling the viewer _why_ it failed (timeout vs. squigly down): one generic message.
- Visual design beyond the simplest placeholder (memory: defer visual design).

## 3. Data model changes

None.

## 4. API

### `POST /api/posts/:postId/conversion` (changed)

- **Auth:** required. **Who:** anyone who can see the post — a member of its community, or the sender or recipient of a direct recommendation (`checkPostAccess`). The author-only `403` is removed.
- **Request:** no body.
- **Success:** `200` `{ post: PublicPost }` — converted, or still `conversionPending: true`.
- **Errors:**
  - `401` not signed in.
  - `404` no such post, malformed id, or the viewer cannot see it (not a member / not sender or recipient) — unchanged.
  - `409` already converted, or a link-only post (nothing to convert) — unchanged.
  - `429` the `conversion` rate-limit tier — unchanged.

## 5. Screens & components

`PostCard` (community feed, Recommendations sent/received, Post Detail).

**Pending post, every viewer:**

- Title line unchanged: "Shared from {source service}".
- Notice (replaces "Other services unavailable"): **"Couldn't convert this link to other services. Something went wrong on our side."**
- Button **Try again** (a chip like today's, renamed from "Find on other services"); shown to every viewer, not only the author.
- Main "Open in {source service}" button unchanged.

**Retrying:** button busy with the existing copy "Finding this track on other services…", disabled, `aria-busy`.

**Outcomes:**

- Converted → the card is replaced in place (unchanged).
- Still pending → the notice text becomes **"Still couldn't convert it. Try again in a little while."**, shown in the notice's place (not a separate grey line) and announced (`role="status"`). The button stays available.
- No answer from the server (network failure) → the notice text becomes **"Couldn't try again. Check your connection."**
- An error answer (`429`, `5xx`) → **"Couldn't try again right now."**; the axios interceptor's toast says which (e.g. the rate-limit message).
- `404` / `409` → the list reloads (unchanged).
- Offline → button disabled, dashed, as today.

## 6. Edge cases & failure modes

- **Two viewers retry the same post at once** → the conditional `updateMany` writes once; the other gets the current post (unchanged behaviour, now reachable by two people).
- **A community admin retries someone else's post** → the returned post keeps `canDelete: true`, so the card keeps its delete action (the response used to assume the caller was the author).
- **A recipient who hid the recommendation** cannot see the card, so cannot press it; the endpoint still answers (they can see the post).
- **A former friend (direct recommendation)** still sees the post → may retry; harmless.
- **squigly ever navigates to a non-result short path** (e.g. an info page) → the service-link wait times out → `unavailable`, as before.
- **A short code with a trailing slash or query** → accepted.

## 7. Test scenarios

**Unit (services)**

- ✅ `linkScraper`: the result-URL matcher accepts `/song/a/b`, `/album/a/b`, `/edWSMP`, `/edWSMP/`, `/edWSMP?x=1`.
- ❌ `linkScraper`: it rejects `https://squigly.link/`, `https://squigly.link/a/b/c`, another host (`https://evil.example/edWSMP`), `http://squigly.link/edWSMP`.
- ✅ `post.service.retryConversion`: a non-author community member retries → converted.
- ✅ `post.service.retryConversion`: the recipient of a direct recommendation retries → converted.
- ❌ `post.service.retryConversion`: a non-member → `404`; already converted → `409` (existing tests kept).

**Integration (endpoints)**

- ✅ `200` author retries → converted (existing).
- ✅ `200` another community member retries → converted (was `403`).
- ✅ `200` the recipient retries a direct recommendation → converted (was `403`).
- ✅ `200` a community admin who is not the author retries → `canDelete` stays `true` (a plain member gets `false`).
- ✅ `200` still pending → `conversionPending: true`.
- ❌ `401` signed out.
- ❌ `404` a non-member / an outsider to a direct recommendation / unknown id.
- ❌ `409` already converted / link-only.
- (No `403` remains for this endpoint; the old "non-author → 403" tests become `200` tests.)

**Component**

- ✅ A pending post shows the notice and **Try again** to the author **and** to a non-author.
- ✅ Retry success replaces the card.
- ❌ Retry still pending → the notice changes to "Still couldn't convert it…" and the button stays enabled.
- ❌ Retry network error → "Couldn't try again. Check your connection."
- ❌ Retry `500` / `429` → "Couldn't try again right now." (not a connection message)
- ❌ Offline → Try again disabled.

**E2E** — none (an integration test already proves it).

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                       | Reason                                                        |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| 2026-11-18 | Work in parallel with the open `feat/admin-delete` PR          | Developer's choice                                            |
| 2026-11-18 | Every viewer sees the notice and may retry (A)                 | A success fixes the post for everyone; rate limit protects    |
| 2026-11-18 | No per-post retry limit (A)                                    | Developer's choice; the existing rate-limit tier suffices     |
| 2026-11-18 | Fix the short-code scraper bug in this feature                 | It is the cause of the reported failure                       |
| 2026-11-18 | A `429`/`5xx` retry error says "right now", not "connection"   | `/code-review`: blaming the connection contradicted the toast |
| 2026-11-18 | The retry response computes `canDelete` from the caller's role | Stage 3: an admin retrying lost their delete action           |
