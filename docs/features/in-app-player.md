# Feature: In-app player (D6)

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                              |
| ------------- | ---------------------------------------------------------------------------- |
| **Use cases** | **UC-23 (new)**: User Listens to a Recommendation in the App                 |
| **Phase**     | 6, Step 6.1z12. Begun while D5 was still open, a deliberate exception to §15 |
| **Branch**    | `feat/in-app-player`                                                         |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged           |

---

## 1. Goal

In the installed iPhone app, a link opens in a browser window over BookRough, and closing that window stops the song (manual-test-fixes-1122.md §5.2). PR #93 (open-in-safari.md) can send the link to full Safari, but that takes the user out of the app. After this ships, a Bandcamp, SoundCloud or YouTube video post has a **Play here** button. It opens the platform's own official player in **one bar docked at the bottom of the screen**. The song keeps playing while the user scrolls, opens other screens, rates or comments. Playing another post swaps the song; **✕** closes the bar.

## 2. Scope

**In scope**

- **Link-only posts only** (developer's choice A, 2026-11-22): `platform` is `BANDCAMP`, `SOUNDCLOUD` or `YOUTUBE` (link-only-posts.md). These three embeds play the full track to anyone, signed in or not.
- **One player at a time** (choice A): a single bar, rendered in `App` above the router, so a route change never unmounts it.
- **Bandcamp item id** (choice A): a new column filled when a Bandcamp post is published, from the page the server already reads, plus a one-time backfill of existing Bandcamp posts.
- The server builds each post's embed address (§4), so the frontend never parses a link to build one. The frontend still checks the address's host before it renders an iframe (§5.3).
- **Play here** on every card that has the main "Listen on / Watch on" button: `PostCard` (community feeds, Recommendations, Post Detail) and `SavedPostCard` (My List). Public Profile lists ratings, not cards with that button, so it gets none.
- Every device, not only iPhone. The existing main button, and the "Open in browser?" sheet on iOS, stay as they are, beside **Play here**.
- New UC-23 in `docs/use cases.md` and its `.docx`. The three embed hosts are recorded in `docs/tech stack.md` §5 and its `.docx` (CLAUDE.md §18).

**Out of scope**

- **Converted songs** (Spotify, Apple Music, Tidal, Deezer, YouTube Music): option B (play them through their YouTube Music link) and option C (the services' own 30-second embeds) were rejected. Their cards are unchanged.
- **A queue, "next", autoplay of the following post**: one song, swapped by hand (option C of question 2, rejected).
- **Background audio guarantees** (§6.1). Only playback while the app is open and in front is promised.
- **Our own playback controls** (play/pause/seek outside the iframe, the lock-screen Now Playing card). The platform's player has its own controls; no embed JavaScript APIs are used.
- **Remembering the player across a reload** or app restart: the bar starts closed.
- **A Content-Security-Policy.** The site has none, by decision (production-hardening.md §9), so no `frame-src` is needed. Nothing changes in the security headers. `X-Frame-Options: DENY` concerns BookRough being framed, not BookRough framing others.
- SoundCloud short links that were never resolved (`on.soundcloud.com/…` stored as is, link-only-posts.md §4.4): no embed. They keep the main button only.
- Visual design. Every visual choice below is a placeholder built from existing primitives and tokens (memory: defer visual design).

## 3. Data model changes

### `posts.bandcamp_item_id`

| Column             | Type          | Null | Default | Notes                                                                     |
| ------------------ | ------------- | ---- | ------- | ------------------------------------------------------------------------- |
| `bandcamp_item_id` | `VARCHAR(20)` | yes  | —       | Bandcamp's numeric album or track id, as digits. Only on a Bandcamp post. |

- Prisma: `bandcampItemId String? @map("bandcamp_item_id") @db.VarChar(20)`. Kept as text, not `BigInt`, because it is an opaque identifier that is never added up, and a `bigint` does not serialise to JSON.
- **Hand-written CHECK `posts_bandcamp_item_id_shape`** (invisible to Prisma; recorded in CLAUDE.md §6):
  `bandcamp_item_id IS NULL OR (link_platform IS NOT DISTINCT FROM 'BANDCAMP' AND bandcamp_item_id ~ '^[1-9][0-9]{0,19}$')`
- Migrations: `add_bandcamp_item_id` adds the column and the CHECK; existing rows start null. `fix_bandcamp_item_id_check` replaces the CHECK (§9): its first form compared `link_platform = 'BANDCAMP'`, which is NULL on a converted post and so let an id through.
- **Never serialised as such.** `toPublicPost` turns it into `embed.url` (§4); the column itself is not a `PublicPost` key.

### Where the id comes from

The Bandcamp page the metadata fetcher already reads (link-only-posts.md §4.3, a 64 KB cap) carries
`<meta name="bc-page-properties" content="{&quot;item_type&quot;:&quot;a&quot;,&quot;item_id&quot;:1836174753,…}">` inside its first 64 KB (checked live on 2026-11-22 against `khruangbin.bandcamp.com/album/a-la-sala`).

- `fetchLinkMetadata('BANDCAMP', …)` returns a new optional field `itemId`, read as text from that one meta tag (the same regex-over-`<meta>` reading as `ogTags`, never parsed as a document), after the HTML entities are decoded and the JSON parsed.
- It is kept only when `item_id` is a positive integer of at most 20 digits **and** `item_type` matches the link: `a` for an `/album/` link, `t` for a `/track/` link. Anything else gives `itemId: null`. A missing id never blocks or fails the post; the post just has no **Play here**.

### Backfill

- A script `backend/src/ops/backfillBandcampIds.ts` finds Bandcamp posts whose `bandcamp_item_id` is null, fetches each page through the same fetcher (the same limits, one at a time), and writes the id when one is found. It changes no other column and is safe to run again.
- It prints one line per post (post id and outcome, never a title or author) and a total.
- **Local:** Claude runs it against the dev database.
- **Production:** it needs the production `DATABASE_URL`, a secret, so **the developer runs it** after the merge, with one command Claude supplies (CLAUDE.md §11, secrets). Until then, older Bandcamp posts just have no **Play here**.

## 4. API

No new endpoint. One change to `PublicPost`, so every endpoint that returns a post carries it (feeds, Recommendations, My List, Post Detail, the create endpoints).

### `PublicPost.embed` (new key)

```ts
embed: { platform: 'BANDCAMP' | 'SOUNDCLOUD' | 'YOUTUBE'; url: string } | null;
```

Built in `utils/publicPost.ts` by a pure helper, `embedFor(post)` (`services/embeds.ts`), from stored, already-validated columns only. Null for every converted post.

| Platform   | When it is set                                                                                                 | `url`                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| YouTube    | `link_platform = 'YOUTUBE'` and `youtubeVideoId(originalUrl)` gives an id                                      | `https://www.youtube-nocookie.com/embed/<id>?playsinline=1&autoplay=1`                                                 |
| SoundCloud | `link_platform = 'SOUNDCLOUD'` and `originalUrl` is a resolved `soundcloud.com` link (not `on.soundcloud.com`) | `https://w.soundcloud.com/player/?url=<originalUrl, encoded>&auto_play=true&visual=false&show_comments=false`          |
| Bandcamp   | `link_platform = 'BANDCAMP'` and `bandcamp_item_id` is set                                                     | `https://bandcamp.com/EmbeddedPlayer/<album or track>=<id>/size=large/tracklist=false/artwork=small/transparent=true/` |

- `album` or `track` comes from the post's `kind` (`ALBUM` → `album`, else `track`).
- `youtube-nocookie.com` is YouTube's privacy-enhanced embed: no YouTube cookie is set until the video plays.
- Every URL is built from a fixed prefix. The only variable parts are an 11-character video id, digits, and an `encodeURIComponent`-encoded link that already passed `supportedLinks`.
- **Errors:** none new. The key is computed, never requested on its own.

### Create endpoints (`POST /api/communities/:id/posts`, `POST /api/recommendations`)

Unchanged shape, errors and latency. A Bandcamp post now also stores `bandcamp_item_id` when the fetcher found it, so the created post's `embed` is set straight away.

## 5. Screens & components

### 5.1 `stores/player.ts` (Zustand)

`{ current: { postId, platform, url, title } | null, play(item), close() }`. `play` replaces whatever is playing. It is cleared when the auth store is cleared (sign-out, a `401`), so a signed-out Welcome screen never keeps a player.

### 5.2 `components/MiniPlayer.tsx`

- Rendered once in `App.tsx`, as a sibling of `<Routes>` inside `SessionGate`, so navigation never remounts its iframe.
- **Closed:** renders nothing.
- **Open (phone width first):** a bar fixed to the bottom, above the tab bar (and at the bottom edge on screens without one), full width, `z` above page content and below sheets. It holds one row with the title (`dir="auto"`, truncated) and a **✕** button (44×44, `aria-label="Close player"`), and under it the platform's iframe at a fixed compact height: Bandcamp 120 px, SoundCloud 120 px, YouTube 16:9 at the bar's width, capped at 200 px tall. Placeholder sizes.
- While it is open, pages leave room for it, measured from the bottom of the viewport (so the tab bar and the iPhone safe area are counted): `TabLayout` pads its content by that much, and on screens without a tab bar (Create Community, Complete Your Profile, Admin, Join Community) the player adds a spacer of that height after the page. The bar hides no content.
- **Loading:** the iframe's own loading. Behind it, a quiet "Loading player…" line, so the bar is never an empty box.
- **Error:** an embed that refuses (a deleted or private item) shows the platform's own message inside the iframe. The card's main button still opens the link. Nothing else is added: a cross-origin iframe cannot report its errors to the page.

### 5.3 The iframe

```html
<iframe
  src="{embed.url}"
  title="{Platform} player: {title}"
  allow="autoplay; encrypted-media; picture-in-picture"
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
  referrerpolicy="strict-origin-when-cross-origin"
  loading="eager"
></iframe>
```

- **Host check before rendering** (defence in depth, `lib/embeds.ts`): `url` must parse, be `https:`, and have exactly the host `www.youtube-nocookie.com`, `w.soundcloud.com` or `bandcamp.com`, matching `platform`. Otherwise **Play here** is not shown at all.
- `sandbox` leaves out `allow-top-navigation` and `allow-forms`, so an embed can never navigate BookRough away. Its own "Listen on SoundCloud" style links open in a new window (`allow-popups`).
- The iframe is created only after **Play here** is tapped. A feed loads no third-party frames and sets no third-party cookies (the privacy reason link-only-posts.md §2 gave for leaving embeds out).
- The page's service worker never sees the iframe's requests. They belong to another origin's document, so nothing of the player is cached.

### 5.4 **Play here** on the cards

- Shown on `PostCard` and `SavedPostCard` when `post.embed` passes the host check, as a secondary button beside the main "Listen on / Watch on" pill. At least 44 px tall.
- Tap: `player.play(...)`. The bar opens, or swaps to this post.
- On the card that is playing, the button reads **Playing** and is disabled.
- **Offline** (`useOnlineStatus`): disabled, with the label "Offline". An open player stays open (its embed may already have buffered, or may show its own offline message). The rule "offline write is not supported" is untouched: playing is reading.
- Pending, converted and unresolved-short-link posts: no button.

### 5.5 Autoplay

The URLs ask for autoplay. Desktop browsers and Android usually honour it, because the tap on **Play here** counts as the user's gesture. On iOS a cross-origin iframe often still needs a tap on the embed's own play button. That is expected, not a bug, and is checked in M2 (§7).

## 6. Edge cases & failure modes

### 6.1 iOS: what is and isn't guaranteed

- **Guaranteed (in our control):** while BookRough is open and in front, the song keeps playing as the user scrolls, opens other screens, opens sheets, rates or comments. The iframe is never unmounted until **✕**, another **Play here**, or sign-out.
- **Not guaranteed (iOS and the platform decide):**
  - **Locking the screen or switching apps.** YouTube's embed pauses when the page goes to the background; background play is a YouTube Premium feature of YouTube's own app, and the embed won't do it. SoundCloud's and Bandcamp's embeds use plain HTML audio and _may_ keep playing in the installed app. iOS has changed this behaviour between versions, so it is recorded as unknown and tested by hand (M3).
  - **The lock-screen Now Playing controls**, which may or may not appear for an iframe's audio.
  - **iOS suspending the app** after a while in the background, which stops everything.
- A reload, a new service-worker version (the update prompt), or iOS killing the app closes the player. It starts closed.

### 6.2 Other cases

- **A deleted post** that is playing keeps playing until closed: the embed doesn't depend on our post.
- **The same post on two screens** (feed, then Post Detail): both cards read **Playing**, because the state is keyed by `postId`.
- **A Bandcamp page without `bc-page-properties`**, with a mismatched `item_type`, or with a non-numeric id: `itemId: null`, the post saves as today, no **Play here**.
- **A Bandcamp item made private later:** the embed shows Bandcamp's own message.
- **A YouTube video with embedding disabled by its owner:** YouTube's embed shows "Video unavailable". The main button still works.
- **Two quick taps on Play here on two cards:** the last one wins; there is only one iframe.
- **Sign-out while playing:** the store is cleared and the iframe removed, so the audio stops.
- **The backfill meets a page that now answers 404 or times out:** that post is left null, reported in the script's output, and the script carries on.

## 7. Test scenarios

**Unit (backend)**

- ✅ `embedFor`: YouTube video post (`watch?v=`, `youtu.be`, `/live/`, `music.youtube.com/watch`) → the `youtube-nocookie.com` URL with that id.
- ✅ `embedFor`: SoundCloud track and set → the `w.soundcloud.com` URL with the encoded link.
- ✅ `embedFor`: Bandcamp album and track with an id → `album=` and `track=` URLs.
- ❌ `embedFor`: converted post, pending post, Bandcamp without an id, unresolved `on.soundcloud.com` link, YouTube post whose URL gives no id → `null`.
- ✅ Bandcamp item id reader: `item_type` `a` on an album link and `t` on a track link → the digits.
- ❌ Bandcamp item id reader: no tag, broken JSON, `item_type` mismatch, `item_id` zero, negative, non-integer or over 20 digits, tag after the 64 KB cap → `null`, and the metadata (title, artist, cover) still returned.
- ✅ `toPublicPost` includes `embed` and still never includes `bandcampItemId` (the key list test).
- ✅ Backfill planner: writes ids found, skips posts already set, reports not-found and failed fetches, and carries on after one.

**Integration (endpoints)**

- ✅ `POST /api/communities/:id/posts` with a Bandcamp album (fetcher mocked to return an id): `201`, `embed.url` is the Bandcamp album URL, and the row has `bandcamp_item_id`.
- ✅ Same through `POST /api/recommendations`.
- ✅ A SoundCloud post and a YouTube video post come back with their `embed`; a converted Spotify post with `embed: null` (feed `GET`).
- ❌ The CHECK `posts_bandcamp_item_id_shape`: writing an id on a SoundCloud post, on a converted post, a non-digit id or one with a leading zero is refused by the database.
- ❌ 400 / 401 / 403 / 404 on these endpoints are unchanged; the existing tests stay green (no new endpoint, so no new error paths to cover).

**Unit (frontend `lib/embeds.ts`)**

- ✅ The three allowed hosts with their matching platform → playable.
- ❌ `http:`, another host, a lookalike (`bandcamp.com.evil.test`, `w.soundcloud.com@evil.test`), a platform/host mismatch, an unparseable URL → not playable.

**Component**

- ✅ `PostCard` with an embed shows **Play here**; tapping it opens the `MiniPlayer` with an iframe of that URL, the right `sandbox` and `allow`, and the title.
- ✅ Tapping **Play here** on a second card swaps the iframe (one iframe only).
- ✅ The playing card reads **Playing**, disabled.
- ✅ **✕** removes the iframe.
- ✅ The player survives a route change (render `App`-level player plus a `MemoryRouter`, navigate, the same iframe element stays).
- ✅ Sign-out (auth store cleared) closes the player.
- ❌ Offline: **Play here** is disabled and reads "Offline".
- ❌ A post whose `embed` fails the host check shows no **Play here**.
- ❌ A converted post shows no **Play here**.
- ✅ `SavedPostCard` shows **Play here** the same way.

**Guard**

- `externalLinks.test.ts` still passes. The iframe is not an `<a href>`.

**E2E**

- None. The golden loops (register → community → post → rate) don't include playing, and the embeds are third-party pages that E2E must not depend on.

**Manual (developer, after merge, in production — as open-in-safari.md)**

- M1. Installed app on the iPhone: Play here on a Bandcamp post, then scroll, open Post Detail, open My List. The song keeps playing.
- M2. Same with SoundCloud and a YouTube video. Note whether each starts on the first tap or needs the embed's own play.
- M3. Lock the screen, then switch to another app, for each of the three. Record what happens in §9. This is an observation, not a pass/fail.
- M4. Desktop browser: Play here, change screens, the song continues.
- M5. Run the production backfill; an older Bandcamp post gains Play here.

## 8. Open questions

None at approval.

## 9. Decisions log

| Date       | Decision                                                                                     | Why                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-22 | Link-only posts only (A), not converted songs through YouTube Music (B) or 30 s previews (C) | Developer's choice. Keeps the slice small; the three embeds play full tracks to everyone.                                                                                                                                                                     |
| 2026-11-22 | One player docked at the bottom, above the router (A); no in-card player, no queue           | Developer's choice. Only a player outside the routes survives navigation, which is the point of D6.                                                                                                                                                           |
| 2026-11-22 | Bandcamp item id in a new column, plus a backfill (A)                                        | Developer's choice. The id is in the page already read at publish time; a live fetch per tap would add latency.                                                                                                                                               |
| 2026-11-22 | New UC-23 (A), not an amendment to UC-11                                                     | Developer's choice. Listening spans UC-11, UC-12 and UC-20; UC-11 is about posting.                                                                                                                                                                           |
| 2026-11-22 | No CSP change                                                                                | The site has no CSP (production-hardening.md §9), so the brief's `frame-src` step is not needed.                                                                                                                                                              |
| 2026-11-22 | Defaults: every device; offline disables Play here; background audio on iOS not guaranteed   | Recorded with the UC question; the developer did not object.                                                                                                                                                                                                  |
| 2026-11-22 | Built in parallel with D5 (community photo), merged only after D5                            | Developer's request; an explicit exception to CLAUDE.md §15 "one feature at a time".                                                                                                                                                                          |
| 2026-11-23 | The CHECK compares with `IS NOT DISTINCT FROM`, in a second migration                        | The Stage 4 test "an id on a converted post" passed the first CHECK: `NULL = 'BANDCAMP'` is NULL, and a NULL CHECK passes. The first migration had already run on the local and test databases, so it is corrected by a new one, never edited (CLAUDE.md §6). |
