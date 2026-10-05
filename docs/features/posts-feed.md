# Feature: Posts — share a link and see the feed

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                    |
| ------------- | ---------------------------------------------------------------------------------- |
| **Use cases** | UC-11 (post a recommendation); UC-14 touched (removal deletes the member's posts)  |
| **Phase**     | 3 — merges Steps 3.1, 3.2, 3.3 and most of 3.6 of `DEVELOPMENT.md` (re-sliced, §0) |
| **Branch**    | `feat/posts-feed`                                                                  |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged                 |

---

## 0. How Phase 3 was re-sliced

`DEVELOPMENT.md` split Phase 3 by layer: schema (3.1), scraper (3.2), create route (3.3), Dockerfile (3.4), delete route (3.5), all feed UI (3.6), E2E (3.7). Most of those could not merge alone under CLAUDE.md §11. They become three PRs (decided 2026-10-04, option A), each with its own spec session:

| #   | Feature                               | Former steps              | Spec                |
| --- | ------------------------------------- | ------------------------- | ------------------- |
| 1   | **Posts: share a link, see the feed** | 3.1, 3.2, 3.3, 3.6 (most) | this document       |
| 2   | Delete a post                         | 3.5, 3.6 (delete menu)    | `posts-delete.md`   |
| 3   | Backend Dockerfile (`chore/`)         | 3.4                       | `backend-docker.md` |

Step 3.7 dissolves: every feature ships its own E2E (§15).

## 1. Goal

A member opens a community, pastes a song or album link from any of the five supported services, optionally adds a comment, and taps **Post**. The server converts the link through squigly.link while the user watches a designed spinner, and the post is born complete: cover art, title, artist, and links to all five services. Every member then sees the post in the community's feed with one button that opens it **in their own** preferred service. If squigly.link is down, the post is saved anyway with the original link and a quiet "Other services unavailable" note, and its author can try the conversion again later.

## 2. Scope

**In scope**

- Schema: `posts` table and a `PostKind` enum (§3).
- Link converter `services/linkScraper.service.ts`: headless Chromium driving squigly.link, `p-limit(2)`, 8 s `waitForSelector`, a 12 s overall ceiling (queue wait included), browser closed in `finally` (CLAUDE.md §7).
- Endpoints: create a post, list a community's feed (paginated), retry a pending post's conversion (§4).
- UC-14 change: removing a member also deletes their posts in that community (§3.3).
- Screens: the community page's "Posts are coming soon" panel becomes the feed with a composer; `PostCard`; an "Other services" sheet; the removal confirmation's new line.
- An E2E **scraper stand-in** (like the Google stand-in), so E2E is deterministic, plus one live-site test that runs only on the nightly schedule.
- Doc updates (§9) and the Phase 3 re-slice in `DEVELOPMENT.md`.

**Out of scope** — deliberately

- Deleting a post (own or as a community admin) — feature 2. No context menu on the card yet.
- Ratings, average stars, bookmarks — Phase 4. The card has no star or bookmark placeholder.
- The Post Detail screen — Phase 4 (UC-16). Cards are not tappable beyond their buttons.
- Editing a post or its comment.
- Amazon Music and SoundCloud links (not in `StreamingService`); playlists, artists, podcasts — their link shapes are rejected before conversion (§4.1).
- Automatic or background retry of pending posts (option C, rejected — CLAUDE.md §7: no background jobs, and no Chromium on reads).
- Live updates (polling, websockets): the feed loads when the page opens; your own new post is prepended.
- Post counts in the admin area's activity columns.
- Rate limiting posts per user. `p-limit(2)` plus the 12 s ceiling bound the server's cost (§6); revisit in Phase 6 hardening.
- Offline reading of the feed — arrives with the service worker in Phase 6.
- Visual design: every visual choice is a placeholder from existing tokens and primitives.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_posts`

### 3.1 `posts`

```prisma
enum PostKind {
  TRACK
  ALBUM
}

/// A music recommendation (UC-11, docs/features/posts-feed.md §3).
/// Metadata and links come from the link converter; all are null while
/// `conversionPending` is true.
model Post {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  authorId          String    @map("author_id") @db.Uuid
  communityId       String    @map("community_id") @db.Uuid
  /// Exactly as pasted (trimmed). Always present — the fallback link.
  originalUrl       String    @map("original_url") @db.VarChar(2048)
  /// The service the original link belongs to, derived from its host.
  sourceService     StreamingService @map("source_service")
  /// Null while pending; set by the converter.
  kind              PostKind?
  songTitle         String?   @map("song_title") @db.VarChar(300)
  songArtist        String?   @map("song_artist") @db.VarChar(300)
  songCoverArtUrl   String?   @map("song_cover_art_url") @db.VarChar(2048)
  universalLinkSpotify String? @map("universal_link_spotify") @db.VarChar(2048)
  universalLinkApple   String? @map("universal_link_apple") @db.VarChar(2048)
  universalLinkYoutube String? @map("universal_link_youtube") @db.VarChar(2048)
  universalLinkTidal   String? @map("universal_link_tidal") @db.VarChar(2048)
  universalLinkDeezer  String? @map("universal_link_deezer") @db.VarChar(2048)
  textComment       String?   @map("text_comment")
  /// True when the conversion could not run (squigly down, timeout, layout change).
  conversionPending Boolean   @default(false) @map("conversion_pending")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  author            User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  community         Community @relation(fields: [communityId], references: [id], onDelete: Cascade)

  @@index([communityId, createdAt(sort: Desc), id(sort: Desc)])
  @@index([authorId, communityId])
  @@map("posts")
}
```

- **Five link columns**, one per `StreamingService` (decided: `tables.md` listed three; Tidal and Deezer are added so every viewer gets their own service). The YouTube column holds squigly's YouTube Music link.
- `kind` comes from squigly's JSON-LD type: `MusicRecording` → `TRACK`, `MusicAlbum` → `ALBUM` (developer's choice, option A). For an album, `songTitle` is the album name and `songArtist` its artist.
- `ratings` and `bookmarks` (Phase 4) will cascade from `posts`.
- Cascades: deleting the community or the author's account deletes the posts.
- The feed index serves "newest first in one community" with keyset pagination; the second serves the removal delete in §3.3.
- No hand-written SQL; the partial index `community_members_one_owner` is untouched (the migration is checked for drift with `prisma migrate diff`).

### 3.2 Who may see a post

Only current members of its community. A post outlives its author's membership when they **leave** (developer's choice, option C): it stays in the feed, credited to them.

### 3.3 Removal deletes the member's posts (UC-14)

`removeMember` deletes the target's posts in that community **in the same transaction** as the membership delete and the ban insert. It is permanent: unblocking does not restore them. Leaving voluntarily (`DELETE /members/me`) deletes nothing.

## 4. API

All responses use the CLAUDE.md §4 envelope; `400` unparseable JSON; `422` validation failure. A malformed or unknown community id, or a caller who is not a member, gets `404` "Community not found." (as in Phase 2). Creating and retrying need finished onboarding (members always have it).

### Shapes

```ts
type StreamingService = 'SPOTIFY' | 'APPLE_MUSIC' | 'YOUTUBE' | 'TIDAL' | 'DEEZER';

PublicPost {                       // utils/publicPost.ts, field by field
  id: string;
  author: { id: string; displayName: string; profilePictureUrl: string | null }; // MemberUser
  isMine: boolean;
  canDelete: boolean;              // added by posts-delete.md §4
  originalUrl: string;
  sourceService: StreamingService;
  kind: 'TRACK' | 'ALBUM' | null;  // null while pending
  title: string | null;
  artist: string | null;
  coverArtUrl: string | null;
  links: Partial<Record<StreamingService, string>>; // only services found; {} while pending
  comment: string | null;
  conversionPending: boolean;
  createdAt: string;
}
```

The author carries only the three `MemberUser` fields (reusing `utils/communityMember.ts`): no preferred service, no dates.

### `POST /api/communities/:id/posts`

- **Auth:** member of the community.
- **Request:** `{ url: string, comment?: string | null }`, `.strict()`.
  - `url`: trimmed, ≤ 2048 characters, parses as an absolute `https:` URL whose host is on the supported list (§4.1). Otherwise `422` with the UC-11 message.
  - `comment`: cleaned with the shared text rules (NFC, trim, line breaks kept, runs of blank lines collapsed), ≤ 280 graphemes; blank → `null`. Too long → `422` "Comments can be up to 280 characters."
- **Behaviour:** validate, then convert (§4.2), then insert. The request is **synchronous**: it returns only when the post is saved (CLAUDE.md §7).
- **Success:** `201 { post: PublicPost }` — also when the conversion failed and the post was saved as pending (`conversionPending: true`).
- **Errors:** `400`; `401`; `404` not a member / unknown community; `422` an invalid URL, an unsupported host, a link whose shape isn't a track or album on that service (§4.1), or squigly's explicit "could not be found" (§4.2) — message: "Invalid link. We couldn't retrieve the song information. Please ensure it's a valid link from a supported streaming service." (UC-11); `422` comment too long or unknown key.

### `GET /api/communities/:id/posts?before=<cursor>`

- **Auth:** member.
- **Behaviour:** newest first, 20 per page. `before` is an opaque cursor (base64url of `createdAt` + `id`) from the previous page's `nextCursor`.
- **Success:** `200 { posts: PublicPost[], nextCursor: string | null }`.
- **Errors:** `401`; `404`; `422` malformed cursor.

### `POST /api/posts/:postId/conversion`

Retry the conversion of a pending post (developer's choice, option A).

- **Auth:** the post's author, who must still be a member of its community.
- **Request:** no body.
- **Behaviour:** runs the same converter with the same limits. Success → the metadata and links are written and `conversionPending` becomes false. Unavailable again → nothing changes and the post stays pending. squigly says "could not be found" → also unchanged (the post was accepted during an outage; it is not rejected after the fact).
- **Success:** `200 { post: PublicPost }` (pending or converted).
- **Errors:** `401`; `404` "Post not found." (unknown or malformed id, or the caller is not a member of its community); `403` "Only the author can do this." (a member who isn't the author); `409` "This post already has its links." (not pending). A conditional update (`WHERE conversion_pending = true`) makes a double tap write once; the second gets the current post.

### Changes to existing endpoints

- `DELETE /api/communities/:id/members/:userId` — also deletes the target's posts in that community (§3.3). Response unchanged.
- `DELETE /api/communities/:id` — posts cascade.

### 4.1 Supported links

A link is accepted only when it is `https:`, its host is listed (exact match), **and its path has the shape of a track or album on that service**. Everything else gets the UC-11 `422` before Chromium launches.

> **Amended in Stage 2 (2026-10-04).** The spec first relied on squigly.link answering "not found" for a broken link. A probe with `open.spotify.com/track/0000000000000000000000` showed squigly answers "We couldn't reach spotify just now. Please try again in a moment." — the same as an outage — so that case gives no not-found signal. A second probe during implementation (a made-up Apple Music id) showed squigly _does_ have one definitive message for some links: "This track could not be found. It may be region-specific or no longer available." Option A's split therefore works like this: what we can tell is wrong — host, shape, or squigly's "could not be found" — is rejected with `422`; anything else squigly can't resolve ("couldn't reach", a timeout, an unreadable page) is saved as pending (the safe side) and its author can retry.

Hosts (exact match, `https:` only):

| Service     | Hosts                                                             |
| ----------- | ----------------------------------------------------------------- |
| Spotify     | `open.spotify.com`                                                |
| Apple Music | `music.apple.com`                                                 |
| YouTube     | `music.youtube.com`, `www.youtube.com`, `youtube.com`, `youtu.be` |
| Tidal       | `tidal.com`, `listen.tidal.com`                                   |
| Deezer      | `www.deezer.com`, `deezer.com`, `link.deezer.com`                 |

Accepted shapes (ids are checked for their character set and length, not for existence):

| Service     | Track                                                                                             | Album                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Spotify     | `/track/<22 base62>` (optional `/intl-xx` prefix)                                                 | `/album/<22 base62>`                                                           |
| Apple Music | `/<cc>/song/…/<digits>`, or `/<cc>/album/…/<digits>?i=<digits>`                                   | `/<cc>/album/…/<digits>`                                                       |
| YouTube     | `music.youtube.com/watch?v=<id>`, `youtube.com/watch?v=<id>`, `youtu.be/<id>`                     | `music.youtube.com/playlist?list=OLAK5uy_…`, `music.youtube.com/browse/MPREb…` |
| Tidal       | `(/browse)/track/<digits>`                                                                        | `(/browse)/album/<digits>`                                                     |
| Deezer      | `(/<lang>)/track/<digits>`; `link.deezer.com/s/<code>` (short link, kind unknown until converted) | `(/<lang>)/album/<digits>`                                                     |

Playlists, artists, podcasts, episodes, users and home pages fail the shape check. The client mirrors these rules for an instant inline error; the server is authoritative. The URL is never fetched by our server — it is only typed into squigly.link — so there is no SSRF surface.

### 4.2 The converter (`services/linkScraper.service.ts`)

`convertLink(url): Promise<ConversionResult>` where the result is one of:

- `{ outcome: 'converted', kind, title, artist, coverArtUrl, links }`
- `{ outcome: 'not_found' }` — squigly showed "could not be found" → the caller rejects with `422`.
- `{ outcome: 'unavailable', reason }` — anything else: launch failure, navigation error, timeout, a page we can't read → the caller saves the post as pending.

How it reads the page (selectors confined to this file):

1. Launch Chromium with `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage`; block `image`, `stylesheet`, `font`, `media` requests.
2. Open `https://squigly.link`, fill the "Paste a track or album link" input, click **Create link**.
3. squigly converts by itself as soon as the link is filled in (the button then disappears; pressing it is only a 2 s fallback). Wait (≤ 8 s) for one of two answers: the result page (URL `/song/…` or `/album/…`) → continue; the text "could not be found" → `not_found`. squigly's other inline messages ("We couldn't reach … just now") are not interpreted: no answer within the limit is `unavailable`. On a result page, wait (≤ 8 s) for the first service link, which renders a moment after the metadata.
4. Read metadata from the page's `application/ld+json` (`MusicRecording` / `MusicAlbum`: `name`, `byArtist.name`, `image`), falling back to `og:title` / `og:image`.
5. Read links from the result anchors, mapping each **by its href's host** (not by CSS class or label) to a `StreamingService`; unknown hosts (Amazon, SoundCloud) are ignored.
6. **Scraped values are untrusted.** Each link must be `https:` on that service's host list, ≤ 2048 characters; the cover must be `https:`; title and artist are cleaned and capped at 300 characters. Anything failing is dropped. A result with no title is `unavailable`.
7. `browser.close()` in `finally`, always.

Limits: `p-limit(2)` around the whole operation; a 12 s ceiling measured **from the request's arrival, including time waiting in the queue** — a request still queued or running at 12 s is abandoned (`unavailable`) and its browser closed. Logging through Pino: `info` `{ context: 'linkScraper', outcome, durationMs, sourceService }`; `warn` on `unavailable` with the reason. Never the URL, never page HTML.

**E2E stand-in:** with `E2E_SCRAPER_STAND_IN=1` the service returns canned results from `e2e/fixtures` (a known track, a known album, and an outage link) instead of launching Chromium. The API refuses to start with it set unless `NODE_ENV=test`, exactly like `E2E_GOOGLE_PUBLIC_KEY`, and a unit test proves it.

### Logging

`info` `{ userId, communityId, postId, conversionPending }` on create and retry; `info` `{ userId, communityId, targetUserId, postsDeleted }` on removal. No URLs, titles or comments.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders.

### 5.1 Community page (`pages/Community.tsx`)

The "Posts are coming soon" panel is replaced, below the header and buttons, by:

1. **Composer** (`components/PostComposer.tsx`): a URL field (placeholder `https://open.spotify.com/track/…`, `inputMode="url"`), an optional comment textarea with a counter (n/280), and **Post** (disabled until the URL is filled).
2. **Feed**: `PostCard`s newest first; **Load more** at the bottom while `nextCursor` exists.

### 5.2 Posting (the designed wait — CLAUDE.md §7)

- On **Post**: the button becomes a busy state with a spinner and the copy "Finding this track on other services…"; both fields become read-only; a second tap does nothing.
- `201` converted → the fields clear and the post is prepended.
- `201` pending → the fields clear and the post is prepended showing its "Other services unavailable" note. No error dialog.
- `422` → the message inline under the URL field; the URL and comment stay as typed (never a lost draft).
- Network failure or `5xx` → inline "Couldn't post. Check your connection and try again."; the draft stays.
- Client-side: an unsupported host or a non-URL shows the UC-11 message inline without a request.
- `404` (removed mid-screen, community deleted) → the not-found page.

### 5.3 `PostCard` (`components/PostCard.tsx`)

- Header: author avatar + display name ("You" for your own), relative time ("2h").
- Body (converted): cover art (square; on image load error, a neutral placeholder tile), title, artist, an "Album" label for albums, the comment (line breaks kept).
- **Main button** (developer's choice, option A): "Open in {viewer's service}" linking to `links[viewerService]`; if that link is missing or the post is pending, "Open in {source service}" to `originalUrl`. Links open in a new tab / the service's app (`target="_blank" rel="noopener noreferrer"`).
- **Other services** (secondary, converted posts only): opens a `Sheet` listing every found link by service name.
- **Pending posts**: no cover (neutral tile), the title line reads "Shared from {source service}", a quiet note "Other services unavailable", and the main button to the original link. The **author** additionally sees **Find on other services** → the same busy copy as posting; success replaces the card in place; still unavailable → inline "Still unavailable. Try again later."; `409` → the card refreshes to the current post.

### 5.4 States

- **Loading:** the existing header skeleton plus three post-card skeletons.
- **Empty:** "Share the first song" / "Paste a link from Spotify, Apple Music, YouTube, Tidal or Deezer." — the composer sits right above it.
- **Feed load error:** `LoadError` "Couldn't load posts." with Try again (the header and composer stay usable). Load more failure → inline Try again under the list.
- **Offline:** the existing banner pattern — "You're offline. Connect to post."; Post and Find on other services disabled; the loaded feed stays readable.

### 5.5 Community Settings

The removal confirmation (`communities-membership.md` §5.4) gains: "Their posts in this community will be deleted too."

## 6. Edge cases & failure modes

- **squigly.link down / slow / layout changed** → post saved as pending within ≤ 12 s; the user sees it in the feed, not an error.
- **Wrong shape on a supported host** (playlist, artist, podcast, `open.spotify.com/track/abc`) → `422` before conversion, draft kept.
- **Well-shaped but nonexistent link**: when squigly says "could not be found" → `422`, draft kept; when it says it "couldn't reach" the service (as for `open.spotify.com/track/0000000000000000000000`) → saved as pending; the author can retry or, in feature 2, delete it.
- **A third simultaneous post** waits in the `p-limit` queue; its 12 s budget includes the wait, so under a burst late requests become pending instead of hanging.
- **The user navigates away mid-conversion** → the server finishes and saves the post; it appears on the next visit.
- **The poster is removed while their request is in flight** → the insert fails the membership re-check inside the transaction → `404`; nothing is saved.
- **The community is deleted mid-conversion** → `404`; nothing saved.
- **Two taps on Find on other services** → one conversion writes; the other returns the current post.
- **Duplicate song** in the same community → allowed (friends may re-recommend).
- **Scraped values** with a non-https link, a foreign host, or an over-long string → dropped (§4.2 step 6); never rendered as a `javascript:` URL.
- **Cover image fails to load** (hot-linked from the service's CDN) → placeholder tile.
- **Viewer has no preferred service** (cannot happen for onboarded members) → treated as the source service.
- **Comment of only whitespace** → `null`.
- **The author leaves** → posts stay, credited to them; they can no longer retry them (not a member → `404`).
- **The author is removed** → their posts in that community are deleted with the removal.
- **Malformed `before` cursor** → `422`; **malformed `postId`** → `404`.

## 7. Test scenarios

**Unit**

- ✅ `linkScraper.service` (Playwright mocked at module level): JSON-LD `MusicRecording` → `converted` TRACK with title, artist, cover and the five links mapped by host; `MusicAlbum` → ALBUM.
- ✅ Falls back to `og:` tags when JSON-LD is missing.
- ✅ Ignores Amazon / SoundCloud links; drops a non-https link, a link on a foreign host, an over-long value.
- ❌ `waitForSelector` timeout → `unavailable`; launch throws → `unavailable`; page without a title → `unavailable`.
- ✅ `browser.close()` is called on success and on every failure.
- ✅ Blocks image / stylesheet / font / media requests and passes the three launch flags.
- ✅ squigly's "could not be found" → `not_found`; ❌ "couldn't reach" (no answer) → `unavailable`.
- ✅ Concurrency: a burst of five calls never has more than two in flight.
- ❌ 12 s ceiling: a call still queued or running at 12 s resolves `unavailable` and closes its browser (fake timers).
- ✅ Stand-in: returns the canned results; ❌ the API refuses to start with `E2E_SCRAPER_STAND_IN` set unless `NODE_ENV=test`.
- ✅ `supportedLinks`: every track and album shape in §4.1 maps to its service; ❌ `http:`, unknown host, look-alike host (`open.spotify.com.evil.io`), playlist / artist / podcast paths, a too-short id, non-URL, > 2048 → rejected.
- ✅ `post.service.createPost`: converted → row with metadata and links; `unavailable` → row with `conversionPending` and nulls; ❌ wrong link shape → `422`, no row, converter never called; ❌ `not_found` → `422`, no row; ❌ non-member → `404`; ❌ comment too long → `422`.
- ✅ `listPosts`: newest first, 20 per page, cursor continues without gaps or duplicates (equal timestamps tie-broken by id); ❌ non-member → `404`; ❌ bad cursor → `422`.
- ✅ `retryConversion`: pending → converted; still unavailable → unchanged; not_found → unchanged; ❌ not the author → `403`; ❌ not pending → `409`; ❌ author no longer a member / unknown post → `404`.
- ✅ `removeMember` deletes the target's posts in that community only (their posts elsewhere and others' posts stay); ✅ leave deletes nothing.
- ✅ `toPublicPost`: exact key set; author has exactly three keys; `links` contains only found services; `isMine` per viewer.
- ✅ Frontend `lib/supportedLinks`, `lib/postLinks` (viewer's service → link, fallback to original; label text).

**Integration (Supertest, scraper mocked)**

- ✅ `POST /posts` converted → `201`, DB row has metadata and five links; ✅ scraper `unavailable` → `201` with `conversionPending: true`, DB row has the original URL only.
- ❌ `POST /posts` playlist link on a supported host → `422` UC-11 message, no row, converter not called.
- ❌ `POST /posts` scraper `not_found` → `422` UC-11 message, no row.
- ❌ `400` unparseable JSON; `422` missing URL, `http:` URL, unsupported host, comment > 280, unknown key.
- ❌ `401` signed out; `404` non-member, unknown and malformed community id.
- ✅ `GET /posts` → newest first, pages with `nextCursor`, `isMine` correct per caller; ❌ `401`, `404` non-member, `422` bad cursor.
- ✅ `POST /posts/:id/conversion` pending → converted; ❌ `401`; `403` member who isn't the author; `404` non-member, unknown, malformed id; `409` already converted.
- ✅ Leave → the leaver's posts still listed; remove → the removed member's posts gone, ban row present; unblock → posts still gone.
- ✅ Delete community → its posts are gone.
- 🔒 No post payload contains `preferredService`, `googleSub`, the author's dates, or any key beyond `PublicPost`.

**Component (Vitest + RTL)**

- ✅ Composer: Post disabled until a URL; busy copy "Finding this track on other services…" and read-only fields while waiting; clears and prepends on success.
- ❌ Composer: unsupported host → UC-11 message without a request; `422` → message inline, draft kept; network failure → inline error, draft kept; offline → disabled with the banner.
- ✅ PostCard converted: cover, title, artist, comment, "Open in {viewer's service}"; Album label for albums; missing viewer link → "Open in {source}" to the original.
- ✅ PostCard pending: "Other services unavailable", original link; author sees **Find on other services**, others don't; retry success replaces the card; ❌ still unavailable → inline message.
- ✅ Other services sheet lists every found link.
- ✅ Feed: skeletons while loading; empty state; Load more appends; ❌ load error with Try again; `404` → not-found page.
- ✅ Community Settings removal confirmation shows the new line.

**E2E (Playwright, scraper stand-in)**

- ✅ Golden loop extension: A creates a community, posts the stand-in's known track with a comment → the card shows title, artist and "Open in {A's service}"; B (different preferred service) joins and sees "Open in {B's service}" on the same post.
- ✅ An outage link → the post appears with "Other services unavailable".
- 🌙 Live (`RUN_LIVE_E2E=1`, set only on the nightly schedule, Chromium project only): with the real converter, posting a known stable Spotify track shows its real title. This is what detects a squigly.link layout change.

## 8. Open questions & risks

- **squigly.link is the single largest external risk** (`tech stack.md`): an unversioned page. Mitigations: pending on failure, host-based link mapping, JSON-LD metadata, all selectors in one file, and the nightly live test.
- **Dependencies (need the developer's approval at the start of Stage 2):** `playwright` (backend dependency, pinned to the same version as `e2e`'s `@playwright/test` so one Chromium download serves both) and `p-limit`. Chromium is installed with `npx playwright install chromium` locally and in CI for the nightly live test. Both are recorded in `docs/tech stack.md` §5.
- **Nonexistent but well-shaped links** become pending posts rather than being rejected (Stage 2 finding, §4.1).
- **Memory**: one Chromium per conversion, at most two; measured for real in feature 3 (Dockerfile) and Phase 6.

## 9. Doc updates in this PR

- `docs/tables.md` + `.docx`: `posts` — five link columns, `source_service`, `kind` / `PostKind`, `conversion_pending`, `updated_at`, indexes, cascades.
- `docs/use cases.md` + `.docx`: UC-11 — supported services, albums, the reject-versus-pending split, the viewer's-service button with fallback, retry by the author; UC-14 — removal deletes the member's posts in that community.
- `docs/frontend screens.md` + `.docx`: 3.1 Community Feed (composer, card, Other services, states; no rating/bookmark until Phase 4); 3.3 the removal line.
- `docs/link converter implementation guide.md` + `.docx`: the real squigly.link flow (JSON-LD, host-mapped links, the three outcomes, the queue-inclusive ceiling).
- `docs/tech stack.md` + `.docx` §5: `playwright`, `p-limit` (and squigly.link as a runtime dependency, already listed).
- `docs/tests.md` + `.docx`: the scraper stand-in and the nightly `RUN_LIVE_E2E` (and the `.docx` catches up with the Google stand-in paragraph).
- CLAUDE.md §7 if anything there changes (e.g. the 12 s ceiling including queue time).
- `communities-membership.md`: the removal confirmation's new line. `admin-panel.md`: both Merged boxes ticked.
- `DEVELOPMENT.md`: the Phase 3 re-slice and this step's entry per §13.

## 10. Decisions log

| Date       | Decision                                                                                                   | Reason                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 2026-10-04 | Phase 3 re-sliced into three PRs: posts + feed, delete, Dockerfile (option A)                              | Vertical slices (§11); the scraper lands with the screen that shows its output                       |
| 2026-10-04 | What we can tell is wrong → `422`; anything squigly can't resolve → saved as pending (option A)            | Honours both UC-11's fail path and §7's "never lose content"                                         |
| 2026-10-04 | Tracks and albums, with `kind` (option A)                                                                  | UC-11 says song/album; squigly supports both                                                         |
| 2026-10-04 | The author can retry a pending post's conversion (option A)                                                | Recoverable without background jobs                                                                  |
| 2026-10-04 | One button for the viewer's service with fallback to the original, plus an Other services sheet (option A) | UC-11's one tap, with a way out when the match is wrong                                              |
| 2026-10-04 | Leaving keeps a member's posts; removal deletes them, permanently (option C)                               | Developer's choice; admins clean up after a bad actor in one step                                    |
| 2026-10-04 | Five link columns, one per `StreamingService`                                                              | squigly returns all five; every viewer gets their own service                                        |
| 2026-10-04 | Unsupported hosts rejected before Chromium launches                                                        | Instant feedback; no browser cost for obvious mistakes                                               |
| 2026-10-04 | Metadata from JSON-LD/`og:`; links mapped by href host                                                     | Standard, far more stable than CSS classes                                                           |
| 2026-10-04 | The 12 s ceiling includes time queued behind `p-limit`                                                     | A burst becomes pending posts instead of hanging requests                                            |
| 2026-10-04 | Comments: optional, ≤ 280 graphemes, line breaks kept                                                      | Same rules as community descriptions                                                                 |
| 2026-10-04 | Feed: newest first, 20 per page, keyset cursor, Load more                                                  | Stable under inserts; simple on a phone                                                              |
| 2026-10-04 | E2E uses a scraper stand-in; one live test runs nightly only                                               | Deterministic PR-time E2E; the nightly run still detects squigly layout changes                      |
| 2026-10-04 | Link-shape check per service replaces squigly's not-found signal                                           | Stage 2 probe: squigly reports a broken id as "couldn't reach", indistinguishable from an outage     |
| 2026-10-04 | squigly's "could not be found" text → `422`; squigly converts on fill, the button is a fallback            | Stage 2 probes: that message is definitive; "couldn't reach" is not                                  |
| 2026-10-05 | A queued conversion with under 2 s of its 12 s budget left is not started                                  | Stage 4: the ceiling test showed a queued attempt launching Chromium a moment before its own timeout |
| 2026-10-05 | The stand-in's `live` list sends one link to the real converter                                            | The nightly live test needs the real squigly.link while every other E2E test keeps the stand-in      |
| 2026-10-05 | `tests.docx` gained the Google stand-in paragraph its `.md` already had                                    | Found while mirroring this feature's changes: Phase 1 drift                                          |
