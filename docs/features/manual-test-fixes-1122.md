# Feature: Manual-test fixes of 2026-11-22 — Hebrew text direction, external links, alphabetical Home

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-9, UC-10, UC-11, UC-12, UC-21, UC-22 (presentation only)        |
| **Phase**     | 6 (manual-test follow-up)                                          |
| **Branch**    | `fix/manual-test-1122`                                             |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged |

---

## 1. Goal

Three items from the manual test session of 2026-11-22 (on the iPhone, against production with the mock data), shipped as **one branch, one PR and one squash commit**, at the developer's request:

- **F1 (design).** A Hebrew community description, "הקלאסיקות של פעם, בלי פשרות.", showed its final period at the left end, before the first word. The UI is LTR (English only), so a neutral character at the end of a right-to-left sentence takes the paragraph's LTR direction. After this ships, every piece of **user-written** text is laid out in its own direction, so Hebrew reads correctly and English is unchanged.
- **D3.** "Every link opens in a new browser tab and never takes the user out of the site." The goal, in the developer's words: listen to a song on Bandcamp and keep scrolling BookRough at the same time.
- **D4.** Home lists the user's communities in **alphabetical order**, instead of newest-joined first.

## 2. Scope

**In scope**

- **F1:** direction of user-written text on every screen (§5.1). Approved by the developer on 2026-11-22 as an exception to CLAUDE.md §8's "no `dir` switching". A line recording it is added to §8.
- **D3:** one `ExternalLink` component that every external link goes through, a test that fails if a raw external anchor appears, and the iOS behaviour recorded here (§5.2).
- **D4:** the order of `GET /api/communities`, so both Home and the Share sheet's community list go alphabetical (§4).

**Out of scope**

- **The UI direction.** The UI stays English and LTR: no `dir` on `<html>`, no RTL layout, no mirrored icons, no i18n (CLAUDE.md §8 is otherwise unchanged).
- **Playing music inside BookRough** (an embedded player, a persistent mini-player). In the installed PWA, a song played from an external link stops when its window closes, and a website can't change that (§5.2). The developer parked an in-app player as a future feature, **D6**, which needs its own spec session.
- Any other list's order (the admin's Communities list, members, friends).
- Visual design beyond the browser's own behaviour for a right-to-left paragraph.

## 3. Data model changes

None.

## 4. API

### `GET /api/communities` (changed order only)

- **Auth:** required (unchanged).
- **Request, success shape, errors:** unchanged (communities-create.md §4).
- **Order (new):** by community name, alphabetically, through `Intl.Collator('en', { sensitivity: 'base', numeric: true })`, sorted in `listMyCommunities` after the query. Ties (two names that compare equal) are broken by community id, so the order is stable.
  - **Case and accents are ignored:** "indie" and "Indie" compare equal; "Café" sorts with "Cafe".
  - **Numbers sort by value:** "Mix 2" before "Mix 10".
  - **Mixed scripts — English first** (developer's choice, 2026-11-22): the Unicode collation order puts digits and symbols first, then Latin, then Hebrew. So "Indie Rock Night", "Jazz & Coffee", "Lo-fi Study", then "מזרחית ותיקה". Within Hebrew, the alphabet order (א before ב).
  - **Why in JS, not `ORDER BY`:** the database's collation depends on how the Neon and local databases were created, and is not something Prisma lets us set per query. A fixed ICU collator in Node gives the same order in every environment. The list is one user's communities, so sorting in memory costs nothing.

## 5. Screens & components

### 5.1 F1 — user-written text gets its own direction

**The rule, in three cases:**

1. **A paragraph of user text** (a community description, a post comment, a review, a thread comment, a song title or artist line): the element gets `dir="auto"`. The browser takes the direction from the text's first strong letter. A Hebrew paragraph lays out right-to-left and, because Tailwind's default alignment is `start`, aligns to the right. An English paragraph is exactly as today.
2. **A name in a row, heading or sentence** (a person's name in a person row, a community name on its cassette label or in a list, "Shared by {name} in {community}", "Delete {community}?"): the user part is wrapped in `<bdi>`, which isolates its direction without moving it, so rows and labels keep their left alignment. Where the sentence is built as a string (notification lines, toasts, sheet titles and bodies, the settings history), the user part is wrapped with a helper `isolate(text)` (`lib/bidi.ts`) that adds the Unicode isolate marks U+2068 / U+2069, the plain-text equivalent of `<bdi>`.
3. **Free-text inputs** (community name and description, display name, post comment, review, thread comment, the admin banner text and tagline, the Search box): the `<input>` / `<textarea>` gets `dir="auto"`, so Hebrew is typed right-to-left. The pasted-link field stays LTR.

**What is not touched:** UI copy, buttons, labels, `aria-label` strings (a screen reader reads the words whatever their order), and initials inside generated avatars. Tests read such text through `src/test/bidi.ts` (`plain`, `readsAs`, `named`), which ignore the marks and the `<bdi>` splits.

**Screens checked:** Home (cassette cards), Community Feed (banner and description), Community Settings (members, blocked list, sheets), Create Community and its edit form, post cards in every feed and Recommendations, Post Detail (reviews), discussion threads, Submit Rating sheet, My List (saved cards and their "Shared by … in …" line), Public Profile (name, ratings list), My Profile, Search results, Friends & Requests (friends, requests, invitations), Send a song and Share sheets, Invite friends picker, Join Community preview, Notifications, Admin (Users, Communities, delete sheets, banner text and settings history).

Loading, empty and error states are unchanged.

### 5.2 D3 — external links

**What the code did before:** the app has exactly three external links: the main service button on a post card (`PostCard`), the same button on a saved card (`SavedPostCard`), and the links in the Other services sheet (`postCardParts`). All three already had `target="_blank" rel="noopener noreferrer"`. Nothing else leaves the site: no link on profiles, admin screens or pending posts, no `window.open`, no `location` assignment to another origin.

**What changes:** a component `components/ExternalLink.tsx` renders `<a href target="_blank" rel="noopener noreferrer">` and is the only place in `frontend/src` that writes those attributes. The three links use it. A unit test reads every non-test source file and fails if an `<a` element with an `href` appears anywhere but `ExternalLink.tsx`, so a future link can't forget the new tab. (Internal navigation uses React Router's `<Link>`, which the test doesn't match.)

**What iOS does (checked on the developer's iPhone, 2026-11-22):**

- **Safari:** the link opens in a **new tab**, which Safari brings to the front. The BookRough tab stays behind it, in the tab switcher. Playing on Bandcamp and switching back to BookRough works. The developer first read the front tab as "the browser left the site"; it hadn't.
- **The installed PWA:** iOS has no tabs there. It opens the link in a browser window over BookRough, and the audio lives in that window, so closing it with **Done** stops the song. A website can't make iOS open the link in full Safari instead. The undocumented `x-safari-https://` scheme can, but it is rejected: Apple can drop it in any update. When the service's own app is installed (Spotify, YouTube, Bandcamp), iOS may hand the link to that app, which keeps playing in the background.
- So **listening while scrolling in the installed PWA** needs an in-app player. That is the parked future feature **D6** (§2).

### 5.3 D4 — Home

`pages/Dashboard.tsx` shows the list in the order the server returns. The Create community tile stays last. Loading, empty and error states are unchanged. The Share sheet (post to a community) shows the same alphabetical order.

## 6. Edge cases & failure modes

- **A name that starts with a digit, emoji or symbol** has no strong letter. `dir="auto"` falls back to LTR, which is fine for those. A Hebrew name with a leading "2" ("2 בלילה") is laid out by its first strong letter (Hebrew), so it is still right-to-left.
- **Mixed text** ("Jazz בבוקר") takes the direction of its first strong letter (English here): the same rule every browser applies to user content.
- **An empty or whitespace-only name** can't exist (community names are validated, communities-create.md §4). Sorting compares the stored name as is.
- **A newly created or joined community** now appears at its alphabetical place on Home, not on top. The feed opens straight after creating or joining, so nothing is lost.
- **A cached Home list** (the persisted request cache) is replaced by the server's order on the next load; nothing on the client reorders it.

## 7. Test scenarios

**Unit (backend)**

- ✅ `listMyCommunities` returns the caller's communities alphabetically, ignoring case ("alpha", "Bravo", "charlie").
- ✅ Numbers sort by value ("Mix 2" before "Mix 10").
- ✅ Mixed scripts: Latin names before Hebrew names, digits first, Hebrew in alphabet order.
- ✅ Two names that compare equal ("Indie" and "indie") come back in community-id order.
- ✅ Empty array when the caller has no communities (kept).
- ❌ The service has no `AppError` branch; the bad path is the endpoint's `401` below.

**Integration (endpoint)**

- ✅ `GET /api/communities` returns the caller's communities in alphabetical order, with Hebrew after English, regardless of join order.
- ❌ `401` without a session (kept).
- (No payload, no params, no per-resource permission: `400`/`403`/`404` don't apply to this endpoint, and its contract is otherwise unchanged.)

**Unit (frontend)**

- ✅ `isolate()` wraps text in U+2068 … U+2069.
- ❌ `isolate()` of an empty string returns an empty string (no stray marks).
- ✅ The guard: no `<a href` outside `ExternalLink.tsx` in `frontend/src` (non-test files).
- ❌ The guard's matcher itself catches a raw external anchor in a sample string, and ignores `<Link to=…>`.

**Component**

- ✅ `ExternalLink` renders `target="_blank"` and `rel="noopener noreferrer"` with the given `href` and children.
- ✅ Post card: the main service button and the Other services links open in a new tab (through `ExternalLink`); a link-only (Bandcamp) post's button too.
- ✅ Saved card: the main button opens in a new tab.
- ✅ Community Feed: the description, and the banner name, carry `dir="auto"`; a Hebrew description renders inside it.
- ✅ Post card: title, artist and comment carry `dir="auto"`; the author's name is isolated.
- ✅ Post Detail: a review carries `dir="auto"`. Discussion: a comment body carries `dir="auto"`.
- ✅ My List: "Shared by {name} in {community}" wraps both in `<bdi>`.
- ✅ Notifications: a line with a Hebrew title keeps the title isolated.
- ✅ Search, Public Profile, Friends, Community Settings, Admin: names carry `dir="auto"` or are isolated.
- ✅ Inputs: the community name and description fields, the comment and review boxes carry `dir="auto"`.
- ❌ English text renders exactly as before (no `dir="rtl"` anywhere, no `dir` on the page root).
- ✅ Dashboard: renders communities in the order the API returns them (kept, re-asserted with a Hebrew and an English name).

**E2E** — none: no golden loop changes.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                              | Reason                                                                                        |
| ---------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-11-22 | `dir="auto"` / `<bdi>` on user-written text, recorded as an exception in CLAUDE.md §8 | Developer approved; it lays out user content, it doesn't switch the UI's direction            |
| 2026-11-22 | D3 is a shared `ExternalLink` plus a guard test; an in-app player is parked as D6     | Safari already opened a new tab; the PWA's stop-on-close is iOS behaviour a site can't change |
| 2026-11-22 | Home sorts alphabetically with an `en` ICU collator in Node, English before Hebrew    | Developer's choice; the same order in every database, whatever its collation                  |
| 2026-11-22 | Names in rows and labels use `<bdi>`, not `dir="auto"` (implementation)               | `dir="auto"` on a row would right-align a Hebrew name while its neighbours stay left          |
| 2026-11-22 | E2E assertions read names through `isolated()`                                        | Toasts and notification lines now carry the isolate marks around names                        |
