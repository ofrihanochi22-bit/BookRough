# Feature: Link-only posts — Bandcamp, SoundCloud and YouTube videos

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------- |
| **Use cases** | UC-11 (amended); UC-20 inherits UC-11's link rules (one-line pointer)                          |
| **Phase**     | 6 — Step 6.1b, an exception to "one open PR at a time" while PR #40 (Step 6.2) waits on Vercel |
| **Branch**    | `feat/link-only-posts`                                                                         |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged                             |

---

## 0. Why, and what the tests showed

Much of the music friends share exists nowhere else: Bandcamp releases, SoundCloud uploads and mixes, live sessions on YouTube (KEXP, NPR Tiny Desk). Converting such a link is pointless — the matching item does not exist on other services — and today Bandcamp and SoundCloud links cannot be shared at all.

### 0.1 squigly.link and YouTube oEmbed, tested live on 2026-11-03

The project's real `convertLink` (headless Chromium → squigly.link) and `https://www.youtube.com/oembed` were run on 22 links:

| Link                                                                                                                                         | squigly result                                                      | oEmbed `author_name`                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| Rick Astley official video `dQw4w9WgXcQ` on `youtube.com/watch`, `youtu.be` and `music.youtube.com`                                          | Converted correctly, all 5 services, cover art (2–3 s)              | Rick Astley                            |
| Auto-generated uploads `lYBUbBu4W08` (Rick Astley), `BSTsnWoslP4` via `youtu.be` (Queen)                                                     | All 5 services                                                      | "Rick Astley - Topic", "Queen - Topic" |
| Billie Eilish official music video `V9PVRfjEBTI`                                                                                             | All 5 services                                                      | BillieEilishVEVO                       |
| KEXP single songs ×3 (`mxLJxKfrCeM`, `V8HVygM1Z6I`, `bVwSZQPjRYE`)                                                                           | "Converted", **only its own YouTube link**, no cover, artist "KEXP" | KEXP                                   |
| KEXP full sets ×3 (Fontaines D.C. `qEFk5RiGf9A`, Khruangbin `0PsOJ_fRckg`, …)                                                                | Same: YouTube only, artist "KEXP"                                   | KEXP                                   |
| Tiny Desk ×5 (Mac Miller `QrR_gm6RqCo`, Billie Eilish `fOAIrUZbOwo` via `music.youtube.com`, Fontaines D.C. `mgMwGBtt4rE` via `youtu.be`, …) | Same: YouTube only, artist "NPR Music"                              | NPR Music                              |
| Phoebe Bridgers "Kyoto" on SNL `VVLch5PXPmo` and Colbert `2nuQJRvkxgo`                                                                       | YouTube only — **not** matched to the studio "Kyoto"                | Phoebe Bridgers                        |
| Arctic Monkeys "Do I Wanna Know" ×3 (Radio X, Reading via `music.youtube.com`, ACL via `youtu.be`)                                           | YouTube only — **not** matched to the studio track                  | Radio X / BBC Music / a fan channel    |

Findings:

- **0 of 13 live videos were matched to a studio version, and none was "not found"** — including live versions of well-known songs.
- **9 of 9 songs converted fully**, on all three YouTube hosts.
- **squigly's own answer separates the two**: a song has links on other services and cover art; a performance has only its own YouTube link, the channel as "artist", and no cover. Today such a video is saved as a fake "song" by "KEXP".
- oEmbed adds little for YouTube: squigly already returns the title and channel. "- Topic" reliably marks a song but the hard cases (official music videos, TV performances) never carry it, and title words misfire ("Live Forever" by Oasis is a studio song).

### 0.2 Bandcamp and SoundCloud, probed the same day

- **SoundCloud oEmbed** (`https://soundcloud.com/oembed?format=json&url=…`, official, no key): title "Flickermood by Forss", `author_name`, `thumbnail_url` on `i1.sndcdn.com`, 763 bytes. It answers `200` for a profile and a set too, so it cannot validate a shape; it answers `404` for a track that does not exist.
- **Bandcamp** has no oEmbed. An album page is 382 KB, but `og:title` ("A LA SALA, by Khruangbin"), `og:type` and `og:image` (`f4.bcbits.com`) sit in its first 10 KB. A missing album is `404`; a missing artist subdomain redirects to `bandcamp.com/signup`.
- **`on.soundcloud.com/<code>`** short links (what the SoundCloud app's Share button produces) answer a redirect; an unknown code is `404`.
- **YouTube oEmbed** answers `400` for a malformed or unknown video.

## 1. Goal

A user pastes a Bandcamp or SoundCloud track/album/set link, or a YouTube video of a live performance, into the community composer or the Send a song sheet, and it is shared without conversion: the card shows its title, artist and cover where the platform provides them, and one button — "Listen on Bandcamp", "Listen on SoundCloud", "Watch on YouTube" — for every viewer, whatever their preferred service. Songs shared through YouTube keep converting exactly as today; squigly's answer decides which is which, with no extra tap.

## 2. Scope

**In scope**

- A fixed host allowlist for Bandcamp and SoundCloud, with accepted link shapes (§4.1); `youtube.com/live/<id>` joins today's YouTube video shapes.
- The YouTube rule (decided: **E + C**, §4.2): a YouTube conversion whose only link is YouTube becomes a video post; a YouTube "could not be found" becomes a video post instead of a `422`, unless YouTube itself says the video does not exist.
- Server-side metadata fetching (decided: **C, falling back to A**, §4.3) from three fixed endpoints, with strict limits; a failed fetch never blocks the post.
- SoundCloud short links resolved through exactly one checked redirect (§4.4).
- Schema: `LinkPlatform` enum, `posts.link_platform`, nullable `source_service`, `PostKind` gains `VIDEO` and `SET`, two hand-written CHECKs (§3).
- Both posting targets — community posts (UC-11) and direct recommendations (UC-20) — and everywhere a post is shown: feed, Recommendations (Received, Sent), My List, Post Detail, Public Profile.
- The retry endpoint: `409` on a link-only post; a pending YouTube post's retry applies the YouTube rule.

**Out of scope** — deliberately

- **Embedded players (iframes)** — privacy (third-party cookies on page load), weight on a 20-post feed, Bandcamp needs a numeric id from the page, offline/PWA handling. A tap-to-load player on Post Detail could be its own later spec.
- **Mixcloud, Vimeo**, any other platform; **Bandcamp custom domains** (cannot be recognised safely by host); **any arbitrary URL**.
- A composer choice "Live / session — don't convert" (option B, rejected: rule E classified all 22 test links correctly). Can be added later if a wrong match ever appears.
- Classifying by title keywords or oEmbed signals (option D, rejected); classifying by host (option A, rejected — breaks songs shared from `youtube.com`).
- SoundCloud profiles, likes, reposts, user playlists pages, Bandcamp artist home pages, `/music`, `daily.bandcamp.com`; YouTube channels, Shorts, and playlists other than YouTube Music albums (as today).
- Backfilling existing YouTube-only "fake song" posts — they stay as they are (production has had no real users).
- Admin-area statistics per platform; the admin area has no post counts today.
- Editing a post, or changing a link-only post into a converted one or back.
- PWA runtime caching of the new cover hosts: Step 6.2 (PR #40) is not on `main`. Whichever of the two PRs merges second adds `*.bcbits.com`, `*.sndcdn.com` and `i.ytimg.com` to the album-art cache (noted in both PRs).
- Visual design: every visual choice is a placeholder from existing primitives and tokens.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_link_only_posts` (with hand-written SQL appended to the generated file before it is applied).

```prisma
/// A platform whose links are shared without conversion (docs/features/link-only-posts.md).
enum LinkPlatform {
  BANDCAMP
  SOUNDCLOUD
  YOUTUBE
}

enum PostKind {
  TRACK
  ALBUM
  /// A YouTube video kept as a video (link-only-posts.md §4.2).
  VIDEO
  /// A SoundCloud set: an album, an EP or a playlist — SoundCloud's own word.
  SET
}

model Post {
  …
  /// The service a converted link came from. Null on a link-only post.
  sourceService  StreamingService? @map("source_service")
  /// Set on a link-only post, which is never converted. Exactly one of this
  /// and `sourceService` is set (`posts_one_source`).
  linkPlatform   LinkPlatform?     @map("link_platform")
  …
}
```

- **`kind`** on a link-only post: Bandcamp `/track/` → `TRACK`, `/album/` → `ALBUM`; SoundCloud track → `TRACK`, set → `SET`; YouTube video → `VIDEO`. `null` only for a SoundCloud short link that could not be resolved (§4.4).
- **`song_title`, `song_artist`, `song_cover_art_url`** hold the fetched metadata, or null (§4.3). For YouTube the artist is the channel name.
- **`original_url`**: as pasted (trimmed), except a resolved SoundCloud short link, which stores the resolved `https://soundcloud.com/<user>/<…>` without its query string (tracking parameters).

### 3.1 Hand-written objects (invisible to Prisma; recorded in CLAUDE.md §6)

```sql
ALTER TABLE posts ADD CONSTRAINT posts_one_source
  CHECK ((source_service IS NULL) <> (link_platform IS NULL));

ALTER TABLE posts ADD CONSTRAINT posts_link_only_unconverted
  CHECK (link_platform IS NULL OR (
    conversion_pending = false
    AND universal_link_spotify IS NULL AND universal_link_apple IS NULL
    AND universal_link_youtube IS NULL AND universal_link_tidal IS NULL
    AND universal_link_deezer IS NULL));
```

- Existing rows all have `source_service` set and `link_platform` null, so both CHECKs hold without a backfill.
- `conversion_pending` keeps its single meaning: "a conversion that should have run could not". A link-only post is never pending.
- No new index: link-only posts are read through the existing feed, Received, Sent and bookmark queries.
- `prisma migrate diff` must show no drift other than the two CHECKs (as with `posts_one_target`).

## 4. API

No new endpoints. All responses use the CLAUDE.md §4 envelope. The UC-11 message for every refused link is unchanged: "Invalid link. We couldn't retrieve the song information. Please ensure it's a valid link from a supported streaming service."

### `PublicPost` — two changes

```ts
type LinkPlatform = 'BANDCAMP' | 'SOUNDCLOUD' | 'YOUTUBE';

PublicPost {
  …
  sourceService: StreamingService | null; // null on a link-only post
  platform: LinkPlatform | null;          // set on a link-only post, null otherwise
  kind: 'TRACK' | 'ALBUM' | 'VIDEO' | 'SET' | null;
  links: {};                              // always empty on a link-only post
  conversionPending: false;               // always false on a link-only post
  …
}
```

`toPublicPost` maps `platform` field by field like every other field. Every reader of `sourceService` (backend utils, frontend `postLinks`, cards) handles `null`.

### `POST /api/communities/:id/posts` (UC-11) and `POST /api/recommendations` (UC-20)

- **Request:** unchanged — `{ url, comment? }` (and `recipientId` for a recommendation), `.strict()`.
- **Behaviour:** `prepareSharedLink` (shared by both) classifies the link (§4.1):
  - A **streaming-service** link other than YouTube → today's path, unchanged: squigly, `converted` / `pending` / `422`.
  - A **YouTube** link → squigly as today, then the YouTube rule (§4.2).
  - A **Bandcamp or SoundCloud** link → never sent to squigly; short link resolved (§4.4), metadata fetched (§4.3), saved as link-only.
  - Then, as today: the membership (`FOR SHARE`) or friendship re-check, and the insert.
- **Success:** `201 { post: PublicPost }` (and the existing UC-20 response shape for recommendations).
- **Errors (unchanged list, new triggers marked ★):** `400` unparseable JSON; `401`; `403` not a friend (recommendations); `404` not a member / unknown community, unknown recipient; `422` comment too long or unknown key; `422` UC-11 message for: an invalid URL, a host not on the allowlist, a wrong shape (§4.1), squigly's "could not be found" for a non-YouTube streaming link, ★ a platform answering `404` (Bandcamp page, SoundCloud oEmbed, SoundCloud short link), ★ a SoundCloud short link redirecting anywhere off the allowlist or to a refused shape, ★ a YouTube "could not be found" that YouTube oEmbed confirms (`400`/`404`).

### `POST /api/posts/:postId/conversion`

- **★ A link-only post** → `409` "This post already has its links." (checked after access and authorship, like a converted post).
- **★ A pending YouTube post** (squigly was down when it was shared): the retry applies the YouTube rule. If it now classifies as a video, the row becomes link-only in one conditional update (`WHERE conversion_pending = true`): `link_platform = YOUTUBE`, `source_service = NULL`, `kind = VIDEO`, metadata set, `conversion_pending = false`, the five links null. A `not_found` with YouTube oEmbed confirming the video is gone leaves the post unchanged (an accepted post is never refused after the fact).
- Everything else unchanged.

### Unchanged endpoints that return posts

Feeds, Received, Sent, My List, Post Detail, Public Profile, ratings, bookmarks, hide, delete: no behaviour change; they serialise the two new fields.

### 4.1 Classification and accepted shapes (`services/supportedLinks.ts`, mirrored in `frontend/src/lib/supportedLinks.ts`)

Every link: trimmed, ≤ 2048 characters, an absolute `https:` URL, no userinfo, no port. The result is either `{ type: 'service', service, kind, url }` (today's shape) or `{ type: 'platform', platform, kind, url, needsResolve }`.

| Platform   | Host rule                                                                                        | Accepted                                                                                                                                 | Refused (examples)                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bandcamp   | Exactly `<sub>.bandcamp.com`, one label, `[a-z0-9-]+`; not `www`, `daily`, `bandcamp.com` itself | `/track/<slug>` → `TRACK`, `/album/<slug>` → `ALBUM` (slug `[a-z0-9-]+`, optional trailing `/`)                                          | `/`, `/music`, `/merch`, `/track`, `bandcamp.com/…`, `daily.bandcamp.com/…`, `a.b.bandcamp.com`, custom domains                                                    |
| SoundCloud | Exactly `soundcloud.com`, `www.soundcloud.com`, `m.soundcloud.com`                               | `/<user>/<track>` → `TRACK`; `/<user>/<track>/s-<token>` (secret link) → `TRACK`; `/<user>/sets/<set>` (optional `/s-<token>`) → `SET`   | `/<user>`, `/<user>/tracks`, `/likes`, `/reposts`, `/albums`, `/sets`, `/popular-tracks`, `/followers`, `/discover`, `/search…`, `/stations…`, `/you…`, `/charts…` |
| SoundCloud | Exactly `on.soundcloud.com`                                                                      | `/<code>` (`[A-Za-z0-9]+`) → resolved first (§4.4)                                                                                       | Any other path                                                                                                                                                     |
| YouTube    | Today's hosts, unchanged                                                                         | Today's shapes, plus `www.youtube.com/live/<id>` and `youtube.com/live/<id>` → sent to squigly as `https://www.youtube.com/watch?v=<id>` | Channels, Shorts, non-album playlists (as today)                                                                                                                   |

- Reserved SoundCloud first segments (`discover`, `search`, `stream`, `upload`, `you`, `charts`, `stations`, `pages`, `settings`, `messages`, `notifications`, `mobile`, `terms-of-use`, `jobs`, `imprint`, `pro`, `popular`, `tags`, `people`, `groups`) are refused as users; reserved second segments (`tracks`, `albums`, `sets`, `likes`, `reposts`, `followers`, `following`, `comments`, `popular-tracks`, `spotlight`) are refused as tracks.
- Host comparison is exact on `URL.hostname` (already lowercased by the parser) — never `includes` or `endsWith` on the raw string, so `soundcloud.com.evil.example`, `evilsoundcloud.com`, `bandcamp.com.evil.example` and `https://soundcloud.com@evil.example/…` fail.
- The frontend mirror gives the instant inline error and picks the spinner copy; the server is authoritative.

### 4.2 The YouTube rule (E + C)

Applies to any link classified as `service: YOUTUBE`, from any of its hosts.

1. Run squigly exactly as today.
2. **`converted`, with a link for at least one service other than YouTube** → a normal converted post. Unchanged.
3. **`converted`, with no link other than YouTube** (rule E) → a link-only post: `platform: YOUTUBE`, `kind: VIDEO`, title and artist from squigly (the video title and channel), cover from squigly, else `https://i.ytimg.com/vi/<id>/hqdefault.jpg` built from the id (no request).
4. **`not_found`** (rule C) → YouTube oEmbed for the id, within what is left of the 12 s ceiling (at most 4 s):
   - `200` → a link-only video post with its title, `author_name` and thumbnail.
   - `400` / `404` → `422` UC-11 (YouTube confirms the video does not exist).
   - Anything else (timeout, `5xx`, no time left) → a link-only video post without metadata.
5. **`unavailable`** → a pending post with `source_service: YOUTUBE`, as today; the author's retry applies this rule (§4 retry).

A YouTube Music **album** link (`OLAK5uy_…`, `MPREb…`) is never a video: if squigly returns it YouTube-only, it stays a converted post (rule E applies to video ids only).

### 4.3 Metadata fetcher (`services/linkMetadata.service.ts`)

`fetchLinkMetadata(platform, url, deadline)` → `{ outcome: 'found', title, artist, coverArtUrl } | { outcome: 'missing' } | { outcome: 'gone' }`. It never throws.

| Platform   | Request                                                                                                 | Read                                                                                                   | `gone` on    |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| SoundCloud | `GET https://soundcloud.com/oembed?format=json&url=<encoded link>`                                      | `title` (a trailing " by {author_name}" removed), `author_name`, `thumbnail_url`                       | `404`        |
| Bandcamp   | `GET <the validated link itself>`                                                                       | `og:title` split at the last ", by " into title and artist, `og:image`; read only from the first 64 KB | `404`        |
| YouTube    | `GET https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=<id>` (rule C only) | `title`, `author_name`, `thumbnail_url`                                                                | `400`, `404` |

Safeguards — this is the project's first server-side fetch of a user-influenced URL:

- **Fixed hosts only.** The request host is one of `soundcloud.com`, `www.youtube.com`, or the Bandcamp host that already passed §4.1. The user's URL is only ever a query parameter or the already-validated Bandcamp page. No DNS-rebinding concern beyond the platform's own: we never connect to a host the user named freely.
- **No redirects followed** (`redirect: 'manual'`): any `3xx` is `missing` (Bandcamp's `bandcamp.com/signup` for a missing artist is therefore `missing`, not followed). The single exception is §4.4.
- **Timeout** 4 s per request (`AbortSignal.timeout`), and the whole link-only preparation stays under the 12 s ceiling.
- **Size cap**: the body is read as a stream and abandoned at 16 KB for oEmbed JSON, 64 KB for a Bandcamp page; over the cap → `missing` for JSON, "parse what was read" for Bandcamp (the `og:` tags sit in the first 10 KB).
- **`200` with `application/json`** (oEmbed) or **`text/html`** (Bandcamp) only; anything else → `missing`.
- **No cookies, no credentials**; a fixed `User-Agent: BookRough/1.0 (+https://bookrough.vercel.app)`.
- **Values are untrusted**, exactly like squigly's (`linkScraper.parseResultPage`): text cleaned with `cleanLine` and capped at 300 characters; the cover kept only if `https:` on its platform's image host (`*.bcbits.com`, `*.sndcdn.com`, `i.ytimg.com`) and ≤ 2048 characters. HTML is read with a bounded regex for the `og:` meta tags only — never executed, never stored.
- Logging: `info` `{ context: 'linkMetadata', platform, outcome, durationMs }`, `warn` on a timeout or unexpected status. Never the URL, the title or the body.

`found` and `missing` both save the post; `gone` refuses it with the UC-11 `422`. A `missing` title renders as the platform's name (§5).

### 4.4 SoundCloud short links

`on.soundcloud.com/<code>` → one `GET` with `redirect: 'manual'`, 4 s:

- `301`/`302`/`303`/`307`/`308` with a `Location` that parses as `https:` on `soundcloud.com`, `www.soundcloud.com` or `m.soundcloud.com` and passes the §4.1 SoundCloud shape → the link becomes `https://soundcloud.com<path>` (query and fragment dropped), and metadata is fetched for it.
- A `Location` anywhere else, or a refused shape → `422` UC-11. The redirect target is **never** requested.
- `404` → `422` UC-11.
- Timeout, network error, `5xx`, any other status → a link-only SoundCloud post with the short link as `original_url`, `kind: null`, no metadata. The content is not lost (CLAUDE.md §7).

### 4.5 Latency

Bandcamp or SoundCloud: no Chromium, no `p-limit` slot; typically under 1 s, at most ~8 s (short link + oEmbed). YouTube: today's squigly path (3–5 s), plus at most 4 s of oEmbed on rule C, within the 12 s ceiling.

### Logging

The existing `Post created` / recommendation logs gain `linkPlatform` (or `null`). No URLs, titles or comments, as today.

## 5. Screens & components

Mobile-first at 375 px; touch targets ≥ 44 px; semantic tokens only; visuals are placeholders reusing existing primitives.

### 5.1 Composer (`PostComposer`, `SendRecommendationSheet`, both through `LinkCommentForm`)

- Nothing new to tap. The community feed's empty-state copy names the new platforms: "Paste a link from Spotify, Apple Music, YouTube, Tidal, Deezer, Bandcamp or SoundCloud." The URL field's example placeholder is unchanged.
- **Busy copy** chosen from the client-side classification: Bandcamp / SoundCloud → "Getting the details…"; any streaming link including YouTube → "Finding this track on other services…" (as today).
- `201` → fields clear and the post is prepended (community) or "Sent to {name}" (recommendation), as today.
- `422` → the UC-11 message inline, draft kept; network / `5xx` → today's inline error, draft kept; offline → today's disabled state with the banner. Unchanged.
- Client-side refusal of a non-allowlisted host or shape → the UC-11 message inline, no request.

### 5.2 `PostCard`, `SavedPostCard`, Post Detail's card, Recommendations items, Public Profile items

For a post with `platform` set:

- **Main button**: one link to `originalUrl` — "Listen on Bandcamp", "Listen on SoundCloud", "Watch on YouTube" (`target="_blank" rel="noopener noreferrer"`, as today). The viewer's preferred service plays no part.
- **Never shown**: the Other services button and sheet, the "Other services unavailable" note, Find on other services.
- **With metadata**: cover, title, artist (the channel for YouTube) as for a converted post. Kind label: "Album" (`ALBUM`), "Set" (`SET`), "Video" (`VIDEO`); none for `TRACK` or `null`.
- **Without metadata**: the title line reads the platform's name ("SoundCloud"), the artist line is hidden, the cover is the existing placeholder tile.
- **Cover fails to load** → the existing placeholder tile (as today).
- Rating, bookmark, ⋯ delete / hide, comment, rating summary, "You're no longer friends…" / "You're no longer in…" lines: unchanged.

### 5.3 States

Loading, empty, error and offline states are the existing ones on every screen touched; only the copy in §5.1 changes. Offline reading of a cached feed shows link-only posts like any other (their covers are cached only once Step 6.2 lists the new hosts, §2).

## 6. Edge cases & failure modes

- **Lookalike hosts** (`soundcloud.com.evil.example`, `evilsoundcloud.com`, `bandcamp.com.evil.example`, `xbandcamp.com`) and **userinfo tricks** (`https://soundcloud.com@evil.example/a/b`, `https://user:pw@artist.bandcamp.com/track/x`) → `422` before any request.
- **`http:`**, a port, or an IP-literal host → `422`.
- **A non-music page on an allowed host** (Bandcamp home page, artist page, `/music`; SoundCloud profile, likes, `/discover`) → `422` before any request.
- **Mixed-case host** (`SoundCloud.com`) → accepted (the URL parser lowercases it); mixed-case path → accepted for SoundCloud (paths are case-insensitive there), slugs checked case-insensitively for Bandcamp.
- **The platform answers `404`** → `422`, draft kept. **Times out / `5xx` / `3xx` / oversized / wrong content type** → saved without metadata.
- **A SoundCloud short link redirecting off the allowlist** (or to a profile) → `422`; the target is never requested.
- **A SoundCloud short link that cannot be resolved** (timeout) → saved with the short link, `kind: null`, no metadata.
- **A YouTube link while squigly is down** → a pending post with `source_service: YOUTUBE`, as today; the retry may turn it into a video post.
- **A YouTube video that exists only on YouTube Music as a real song** (no other service has it) → becomes a video post: it could not convert anyway; it opens on YouTube.
- **Two taps on retry of a pending YouTube post** → the conditional update writes once; the second gets the current post (or `409` once it is link-only).
- **A link-only post retried through the API** → `409`.
- **Duplicates** → allowed, as for every post. **Delete, hide, removal cascade, ratings, bookmarks, Post Detail access** → unchanged.
- **The poster is removed, the community deleted, or the friendship ends during the fetch** → the existing re-checks inside the insert transaction refuse it (`404` / `403`), nothing saved.
- **Cover URL on a foreign host or `http:`** in a platform's answer → dropped; the post saves without a cover.
- **Hostile text in a title** (control characters, 10 000 characters, HTML) → cleaned and capped; rendered as text by React, never as HTML.

## 7. Test scenarios

**Unit — `supportedLinks` (backend, and the frontend mirror with the same table)**

- ✅ Bandcamp `/track/<slug>` → `TRACK`, `/album/<slug>` → `ALBUM`, trailing slash, mixed-case slug.
- ❌ Bandcamp: artist home `/`, `/music`, `/merch`, bare `bandcamp.com/album/x`, `daily.bandcamp.com/…`, `www.bandcamp.com/…`, `a.b.bandcamp.com/track/x`, empty slug, `bandcamp.com.evil.example`, `xbandcamp.com`, `http:`.
- ✅ SoundCloud track, secret track, set, secret set; on `soundcloud.com`, `www.`, `m.`; `on.soundcloud.com/<code>` → `needsResolve`.
- ❌ SoundCloud: profile, `/tracks`, `/likes`, `/reposts`, `/albums`, `/sets` alone, `/followers`, `/discover`, `/search?q=`, `/stations/…`, `/you/likes`, `on.soundcloud.com/` with an extra segment, `soundcloud.com.evil.example`, `evilsoundcloud.com`, `https://soundcloud.com@evil.example/a/b`, port, userinfo.
- ✅ YouTube: every shape accepted today on all three hosts still maps to `YOUTUBE` with the same kind; `youtube.com/live/<id>` → `TRACK` with the squigly URL normalised to `watch?v=<id>`.
- ❌ YouTube: channel, Shorts, `/live/` with a bad id, non-album playlist (unchanged).
- ✅ Spotify, Apple Music, Tidal, Deezer: every existing accepted shape returns exactly today's result (regression table).
- ❌ Malformed URLs: not a URL, empty, whitespace, > 2048 characters, `javascript:`, `data:`.

**Unit — `linkMetadata.service` (`fetch` mocked)**

- ✅ SoundCloud oEmbed `200` → title with " by Forss" removed, artist, `*.sndcdn.com` cover.
- ✅ Bandcamp page → title and artist split at the last ", by ", `*.bcbits.com` cover; `og:` tags found in a page larger than 64 KB because only the head is read.
- ✅ YouTube oEmbed `200` → title, channel, `i.ytimg.com` thumbnail.
- ❌ `404` → `gone` (SoundCloud, Bandcamp); `400` → `gone` (YouTube).
- ❌ Timeout → `missing`; `5xx` → `missing`; `3xx` → `missing` and the `Location` is never requested; wrong content type → `missing`; oEmbed body over 16 KB → `missing`; malformed JSON → `missing`; Bandcamp page without `og:title` → `found` with no title → treated as `missing`.
- ❌ Cover on a foreign host, `http:`, or > 2048 → dropped; title with control characters and 1 000 characters → cleaned and capped at 300.
- ✅ Requests go only to the fixed hosts, with `redirect: 'manual'`, the timeout signal and the fixed `User-Agent`, no cookies.

**Unit — short-link resolver**

- ✅ `302` to `https://soundcloud.com/a/b?si=x&utm_source=y` → `https://soundcloud.com/a/b`; to `m.soundcloud.com` → normalised.
- ❌ Redirect to `https://evil.example/a/b`, to `http://soundcloud.com/a/b`, to a SoundCloud profile → refused (`422`), target never requested; `404` → refused.
- ✅ Timeout / `5xx` / `200` without redirect → unresolved (saved with the short link, `kind: null`).

**Unit — `post.service` / `prepareSharedLink`**

- ✅ Bandcamp / SoundCloud → link-only row (`link_platform` set, `source_service` null, five links null, `conversion_pending` false), **`convertLink` never called**.
- ✅ Metadata `missing` → saved without metadata; ❌ `gone` → `422`, no row.
- ✅ YouTube rule E: squigly `converted` with Spotify + YouTube links → converted post, unchanged; YouTube-only → video post with squigly's title/channel and the `i.ytimg.com` cover when squigly has none.
- ✅ YouTube rule C: squigly `not_found` + oEmbed `200` → video post with metadata; + oEmbed timeout → video post without metadata; ❌ + oEmbed `400` → `422`.
- ✅ YouTube `unavailable` → pending post with `source_service: YOUTUBE` (unchanged).
- ✅ YouTube Music album link returned YouTube-only → converted post, not a video.
- ✅ Regression: Spotify, Apple Music, Tidal, Deezer → `convertLink` called with the same arguments as before and the same row written; `not_found` → `422` as before.
- ✅ `retryConversion`: link-only → ❌ `409`; pending YouTube now YouTube-only → becomes a video post; pending YouTube now converted with other services → converted post; pending YouTube `not_found` + oEmbed gone → unchanged.
- ✅ `toPublicPost`: `platform` set and `sourceService` null on a link-only post; `platform` null on a converted post; exact key set.

**Integration (Supertest, scraper and `fetch` mocked) — for both `POST /api/communities/:id/posts` and `POST /api/recommendations`**

- ✅ `201` Bandcamp album, SoundCloud track, SoundCloud set, SoundCloud short link (resolved), YouTube live video (rule E), YouTube rule C; the DB row satisfies both CHECKs; the scraper mock is not called for Bandcamp / SoundCloud.
- ✅ Regression `201`: a Spotify track and a YouTube song on each of `youtube.com/watch`, `youtu.be`, `music.youtube.com` still convert with all links.
- ❌ `422`: host not on the allowlist (`mixcloud.com/…`), lookalike host, userinfo trick, Bandcamp home page, SoundCloud profile, malformed URL, platform `404`, short link redirecting off the allowlist; no row in each case.
- ❌ `400` unparseable JSON; `401` signed out; `403` recipient not a friend (recommendations); `404` non-member / unknown community, unknown recipient.
- ✅ `POST /api/posts/:id/conversion`: ❌ `409` on a link-only post; ✅ pending YouTube → video; ❌ `401`; `403` not the author; `404` unknown or inaccessible post.
- ✅ Feed, Received, Sent, My List, Post Detail, Public Profile return link-only posts with `platform`; rating, bookmark, hide and delete work on them (one test each).
- ✅ A direct `INSERT` violating `posts_one_source` and one violating `posts_link_only_unconverted` both fail (the CHECKs exist).

**Component (Vitest + RTL)**

- ✅ Composer: a Bandcamp link shows "Getting the details…" while waiting; a YouTube link shows "Finding this track on other services…"; ❌ a Mixcloud link shows the UC-11 message without a request; ❌ `422` inline, draft kept.
- ✅ Send a song sheet: the same two busy copies; ❌ the same client-side refusal.
- ✅ PostCard link-only with metadata: cover, title, artist, "Listen on SoundCloud" to `originalUrl`, "Set" label; no Other services, no Find on other services (even for the author).
- ✅ PostCard link-only without metadata: the platform's name as title, no artist line, placeholder tile; YouTube video: "Watch on YouTube", "Video" label.
- ✅ SavedPostCard (My List) and Post Detail show the same button and labels; ❌ Post Detail error state unchanged.
- ✅ Converted posts render exactly as before (existing tests stay green).

**E2E (Playwright, scraper stand-in)**

- None. The golden loop already proves posting, rating and bookmarking; integration tests prove the new link type end to end at the API, and component tests the cards. The stand-in and a live platform would add flakiness without new coverage.

## 8. Open questions & risks

- **Platform pages and endpoints are unversioned.** Bandcamp's `og:` tags and SoundCloud's oEmbed could change; the fetcher degrades to "saved without metadata", never to a refused post. squigly's YouTube-only answer (rule E) is an observed behaviour, not a contract: if squigly ever starts matching live videos to studio tracks, the wrong match would show as a normal converted post — the trigger to add option B.
- **No new dependency**: Node 24's built-in `fetch`. The three endpoints are new **runtime** external services and are recorded in `docs/tech stack.md` §5 (+ `.docx`) per CLAUDE.md §18.
- **Interaction with PR #40** (§2): the album-art runtime cache gains the three cover hosts in whichever PR merges second; docs (`DEVELOPMENT.md`, `HANDOFF.md`, CLAUDE.md) get a small merge.
- Nothing else is unresolved.

## 9. Doc updates in this PR

- `docs/use cases.md` + `.docx`: UC-11 — accepted platforms, link-only posts, the YouTube rule, the fail description; UC-20 — a one-line pointer.
- `docs/tables.md` + `.docx`: `posts.link_platform`, nullable `source_service`, `PostKind` values, the two CHECKs.
- `docs/frontend screens.md` + `.docx`: the composer copy and the link-only card on every screen that shows posts.
- `docs/link converter implementation guide.md` + `.docx`: which links skip the converter, the YouTube rule, the test results.
- `docs/tech stack.md` + `.docx` §5: SoundCloud oEmbed, Bandcamp pages, YouTube oEmbed.
- `docs/system architecture conventions.md` + `.docx` if it describes the link pipeline; `docs/general.md` + `.docx` if it lists supported services.
- Feature specs: amendment notes in `posts-feed.md` (SoundCloud no longer out of scope; §4.1), `direct-recommendations.md`, `post-detail.md`, `bookmarks-my-list.md`.
- CLAUDE.md §6 (the two CHECKs, `link_platform`), §7 (which links skip the converter; the YouTube rule), §12 (Step 6.1b).
- `DEVELOPMENT.md`: Step 6.1b with What I did and How to view & test, sample links per platform and per YouTube case; the Phase 6 order. `HANDOFF.md`.

## 10. Decisions log

| Date       | Decision                                                                                                    | Reason                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-11-03 | YouTube rule E + C: squigly's answer decides; YouTube "not found" saves a video post                        | Live test: 13/13 live videos came back YouTube-only, 9/9 songs fully converted; no wrong match, no not-found |
| 2026-11-03 | No "don't convert" composer choice (B), no keyword signals (D), no host rule (A)                            | B solves an unobserved problem with a tap; D misfires; A breaks songs from `youtube.com`                     |
| 2026-11-03 | Bandcamp, SoundCloud, YouTube videos, on a fixed host allowlist                                             | Covers the motivating content; any URL means phishing and SSRF exposure                                      |
| 2026-11-03 | Metadata fetched server-side from fixed endpoints, falling back to the platform's name                      | A bare link card is weak; strict limits keep SSRF out; a failed fetch never loses the post                   |
| 2026-11-03 | SoundCloud short links accepted through one checked redirect                                                | The SoundCloud phone app shares only short links                                                             |
| 2026-11-03 | `LinkPlatform` + `posts.link_platform`, nullable `source_service`, two CHECKs; `PostKind` gains VIDEO, SET  | Keeps `StreamingService` (shared with `preferred_service`) clean; never overloads `conversion_pending`       |
| 2026-11-03 | One platform button; no Other services, no retry; platform's name when metadata is missing                  | The viewer's preferred service has no meaning for these links                                                |
| 2026-11-03 | No embedded player                                                                                          | Privacy, feed weight, Bandcamp ids, offline handling; native apps open from the button                       |
| 2026-11-03 | Link-only posts behave like posts for duplicates, delete, hide, ratings, bookmarks, admin                   | One mental model; no new permission rules                                                                    |
| 2026-11-03 | Amend UC-11 (pointer in UC-20) rather than add UC-21                                                        | Same user goal and flow; one place for link rules                                                            |
| 2026-11-03 | Built as Step 6.1b while PR #40 waits on Vercel                                                             | Developer's exception, as for UC-20                                                                          |
| 2026-11-03 | Stage 2: the placeholder cover stays the plain ♪ tile, and the URL field's example placeholder is unchanged | The title line already names the platform; the example URL is an example, not a list                         |
| 2026-11-03 | Stage 3: the converter waits up to 1.5 s for a link on a service other than the source's before reading     | `/code-review`: a page read on the first link could make a song look YouTube-only and lose its conversion    |
| 2026-11-03 | Stage 4: scraped and fetched text drops control characters (`cleanScrapedText`, shared with the converter)  | A metadata test showed `cleanLine` kept them; §4.3 promised they were cleaned                                |
