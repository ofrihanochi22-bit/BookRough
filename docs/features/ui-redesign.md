# Feature: UI redesign — "Mixtape"

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| **Use cases** | None new. Presentation of the existing UCs; UC-19 touched (accent palette, design switch on Admin)         |
| **Phase**     | 6 — after the manual-test N-notes, before the N4 tutorial                                                  |
| **Branch**    | Six PRs — see §6                                                                                           |
| **Status**    | ☑ Spec approved (2026-11-09; logo amendment 2026-11-10) · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged |

---

## 1. Goal

The current look is clean but generic: every block is the same outlined dark card with one radius, nothing carries hierarchy, and nothing says "music" except the small album art. After this ships, BookRough has a distinct visual identity — **Mixtape**: cassette labels, stickers, a signal colour — while every screen keeps doing exactly what it does today. **No functionality changes.** The one new piece of UI, the Share button (§3.4), is a new way into flows that already exist, with no new capability and no new endpoint.

## 2. Scope

**In scope**

- New design tokens (palette, type, radii, motion) for light and dark mode, in `frontend/src/index.css`.
- Retuned shades for the admin's five accent names; default accent changes from `purple` to `orange`.
- New tab bar with a central Share button; Search moves to a header icon.
- Generated community covers redrawn as cassette labels (same deterministic hue per id).
- Rating sticker on the post card.
- Cassette-reel loading state.
- A logo — a cassette mark beside the word "BookRough" (§3.8) — large on Welcome, small in the top corner of every other screen. Added 2026-11-10.
- Every screen in `docs/frontend screens.md`, designed one by one in §5.
- A per-device design switch so the old and new looks live side by side until the swap (§4).

**Out of scope**

- Any change to what a screen can do, any endpoint, any schema change.
- New copy beyond what the new navigation strictly needs (Share sheet labels). Existing strings stay.
- Any text in the logo besides "BookRough" — no tagline, no slogan inside the mark.
- An app icon or PWA icon set redrawn from the logo — the icons in `frontend/public/` are unchanged by this spec.
- Uploaded or derived community covers — covers stay generated (CLAUDE.md §8).
- i18n / RTL (CLAUDE.md §8).
- Colour extraction from album art (cross-origin images cannot be read reliably).

## 3. Design system (agreed)

### 3.1 Palette

Semantic token names stay as they are today (`canvas`, `surface`, `ink`, `muted`, `line`, `accent*`, `danger*`), so screens keep using `bg-surface`, `text-muted`… New fixed tokens are added for the identity pieces that never follow the accent.

| Token                      | Dark      | Light     | Role                                                               |
| -------------------------- | --------- | --------- | ------------------------------------------------------------------ |
| `canvas`                   | `#1B1A2E` | `#ECEAF4` | Page background — indigo ink, not black / lavender-grey, not cream |
| `surface`                  | `#26253D` | `#FFFFFF` | Cards, sheets, tab bar                                             |
| `ink`                      | `#F2EDE4` | `#1B1A2E` | Body text                                                          |
| `muted`                    | `#A9A6C4` | `#5A5870` | Supporting text                                                    |
| `line`                     | `#4A4870` | `#D5D2E3` | Outlines, dashed "create" tiles, chips                             |
| `tape` (new, fixed)        | `#F2EDE4` | `#FBF8F2` | Cassette label paper                                               |
| `tape-ink` (new, fixed)    | `#1B1A2E` | `#1B1A2E` | Text on the label; the label's outline in light mode               |
| `sticker` (new, fixed)     | `#FFC93C` | `#FFC93C` | Rating sticker only                                                |
| `sticker-ink` (new, fixed) | `#4A3300` | `#4A3300` | Text on the sticker                                                |

`danger` values are re-checked against the new canvases in implementation; contrast ≥ 4.5:1 for text everywhere.

**Tape paper in light mode** (amended 2026-11-10): `tape` on a white `surface` is about 1.03:1, so every tape-paper surface (the comment note, the pending cover, the Share sheet's "To a community" tile, the selected side of a pill track) gets a 1px `line` ring in light mode, none in dark. Cassette labels keep their 2px `tape-ink` outline (§3.5).

### 3.2 Accent (admin setting, UC-19)

The accent is the app's **signal colour**: main button, active tab, Share button, badges, selected states. The five names stay (`purple`, `blue`, `green`, `orange`, `pink`) and are still applied as `data-accent` on `<html>`; only the values change.

| Name     | Dark (`accent`, text `#1B1A2E`) | Light (`accent`, text `#FFFFFF`) |
| -------- | ------------------------------- | -------------------------------- |
| `orange` | `#FF5A36`                       | `#C23A17`                        |
| `purple` | `#9B8CFF`                       | `#5B47D6`                        |
| `blue`   | `#4FB0FF`                       | `#1F64C4`                        |
| `green`  | `#47D68F`                       | `#1E7A4C`                        |
| `pink`   | `#FF6FAE`                       | `#C2316F`                        |

`accent-soft` / `accent-ink` are derived per name in implementation and contrast-checked.

- **Default changes from `purple` to `orange`** — `DEFAULT_ACCENT` in `frontend/src/lib/appSettings.ts` and `accentColor.defaultValue` in `backend/src/services/appSettings.ts`. A database that already stores a choice keeps it.
- **Never follow the accent:** cassette paper, the sticker yellow, and each community's stripe colours.
- Under the **old** design (§4) the old values stay, including the purple default — the default constant is switched in the swap PR, not before.

### 3.3 Type

- **Headings:** Bricolage Grotesque (variable), via `@fontsource-variable/bricolage-grotesque` — approved by the developer 2026-11-09. Self-hosted in the bundle, never loaded from Google at runtime (privacy, and the offline PWA).
- **Body:** Inter Variable, unchanged.
- Space Grotesk stays while the old design exists; removed in the cleanup PR (§6).
- Scale and weights fixed in implementation; no all-caps labels.

### 3.4 Navigation

Tab bar, left to right: **Home · Friends · Share · My List · Profile**.

- **Share** is a raised accent button in the centre. It opens a sheet with two choices:
  - **To a community** → pick one of your communities → that community's existing composer (`PostComposer`).
  - **To a friend** → the existing `SendRecommendationSheet`, which already has a friend picker.
    No new endpoint, no new capability.
- **Search** leaves the tab bar and becomes an icon in the headers of Home and Friends.
- Badges keep their meaning (Home: unread notifications; Friends: waiting requests).
- The active tab is shown in the accent colour.

### 3.5 Shapes

- Radius follows hierarchy, not one value everywhere: screen-level cards `22px`, cassettes `12px`, chips and primary buttons pill-shaped, sticker round.
- **Community cover = cassette:** a label in `tape` with the name in the heading face, two reels, and a stripe band across the top in the community's own deterministic hue (`avatarHue`, unchanged). In light mode the label gets a 2px `tape-ink` outline.
- **"Create" tiles** are dashed outlines in `line`.
- **Post card:** album art full card width; one primary button ("Open in …"); secondary actions as quiet outlined chips.

### 3.6 Rating sticker

On the post card's album art, top corner, slightly rotated:

- **Big:** the group average and the number of ratings (from `ratingSummary`).
- **Small tag** "You: N" in the cover's opposite corner once the viewer has rated (`myScore`).
- No ratings → no sticker. Tapping the sticker goes to Post Detail, as "View ratings" does today.
- No server change — both values are already on the post.

### 3.7 Motion

- **One signature moment:** a cassette with spinning reels during link conversion (CLAUDE.md §7), above the existing progress copy; the same reels replace the generic spinner in other loading states.
- Otherwise motion only answers an action (a sheet opening, the sticker landing after a rating). No entrance animations on cards.
- `prefers-reduced-motion: reduce` → a still cassette, no rotation.

### 3.8 Logo — agreed 2026-11-10

- **Mark:** a front-on cassette — an orange body (`#FF5A36`), a `tape` label window holding two dark reels with sticker-yellow hubs, and a darker orange (`#C23A17`) tape guide along the bottom. Drawn as inline SVG, no image file.
- **Word:** "BookRough" — capital B and R — in Bricolage Grotesque, extra bold, slightly tight tracking, in `ink`. No other text in the logo.
- **Fixed colours:** the mark never follows the admin accent; it is the same orange and yellow in light and dark mode. In light mode the body is unchanged and the word is in `ink` (dark).
- **Two variants of the `Wordmark` component:**
  - `hero` — the mark (about 104px wide) stacked above the word (about 38px), centred. Welcome only (§5.12).
  - `compact` — the mark (about 30px wide) beside the word (about 18px), in one row.
- **Where the compact logo goes:** the top-left corner of every screen except Welcome. On a screen with a back button it sits to the right of the button. It is not a link and adds no behaviour; the screen's own `h1` is unchanged.
- **Accessibility:** the mark is `aria-hidden`; the word is real text, so the logo reads as "BookRough" once.

## 4. Two versions side by side

- Each redesigned screen merges to `main` in its own PR; the **old design stays the default for everyone**, so friends see no change until the swap.
- **Switch, per device:** `?design=new` / `?design=old` on any URL, and a toggle on the Admin screen (admins only). The choice is stored on the device (local storage), never on the server.
- The new tokens hang off a root attribute (e.g. `data-design="mixtape"` on `<html>`), so the old values stay untouched underneath. Structural differences (tab bar, cassette cover, post card) switch on the same flag.
- `theme-color` meta follows the active design and scheme (set at runtime, since `index.html` is static). From the swap, `index.html` ships Mixtape's `data-design` and `theme-color` values, so the default paints right before any script runs; a device on Current has them replaced at runtime.
- **Swap PR:** the new design becomes the default for everyone (and the `orange` default takes effect). **Cleanup PR:** the old tokens, components, Space Grotesk and the switch are removed.

## 5. Screens & components

Each screen: layout at 375px, light and dark, loading, empty and error states. Anything not mentioned keeps today's behaviour and copy.

Order agreed 2026-11-09: shared pieces (post card, buttons, sheets, fields, Share sheet) → Home, Community Feed, Post Detail → Friends, Recommendations, Public Profile, Search, Notifications → My List, Submit Rating, My Profile → Welcome, Complete Your Profile, Join Community → Create Community, Community Settings, Admin.

### 5.0 Shared: post card (`PostCard`) — agreed

Same data, same actions, same copy as today; only layout and treatment change.

- **Frame:** `surface` card, radius `22px`, no outline.
- **Header:** avatar, name (`PersonLink`), relative time, "· edited" when edited; on the right the bookmark (when it shows today) and ⋯. Direct items keep "From" / "To" before the name. The header line "You rated N/10" is **removed** — the score moves to the "You: N" tag (below).
- **Cover:** a 116×116 thumbnail (today 76) at the left, radius `12px`; title (heading face), artist, and the kind label ("Album", "Video") as a small rectangular tag in `line` on the right. Rating sticker (§3.6) on the cover's top corner when there are ratings — average large, rating count small; "You: N" tag on the cover's bottom corner once the viewer has rated. Sticker and title open Post Detail.
- **Comment:** the poster's comment as a note on `tape` paper with `tape-ink` text, radius `10px`.
- **Actions:**
  - One primary pill in the accent: "Open in …" (unchanged logic).
  - Chips (outlined in `line`): "Other services" (when it shows today); a comments chip — "N comments", or "Comments" when there are none — replacing the "★ … · N comments" line and the "View ratings" link, and opening Post Detail.
  - "Rate & Review" (received direct item, not yet rated) becomes a pill in `sticker` yellow with `sticker-ink` text, above the primary — yellow means rating throughout the app. Copy unchanged. The "no longer friends" line stays as text.
- **Conversion pending:** the cover is replaced by a `tape` square with two still reels; the existing "Other services unavailable" line stays; the author's "Find on other services" is a chip, and the reels spin while it runs (reduced motion: still).
- **Link-only posts:** no "Other services" chip, as today.
- **⋯ menu:** opens a bottom action sheet (the existing `Sheet`) instead of the inline button row: one row per action with an icon — Hide, Edit comment, Delete post — Delete in `danger`; a Cancel pill at the bottom. The follow-up sheets (edit, delete confirmation) are unchanged.

### 5.0b Shared: Share sheet (new entry point, §3.4) — agreed

Opened by the central tab-bar button. A bottom sheet in steps; the back arrow returns one step.

1. **"Share a song"** — two options: **To a community** (`tape` paper tile, "Post it to a group's feed") and **To a friend** (outlined tile, "Send it to one person").
2. **To a friend** → the existing `SendRecommendationSheet` with its friend picker, unchanged (including its empty and error states).
3. **To a community** → **"Choose a community"**: your communities as rows, each with a mini cassette (stripe in the community's hue) and the name. Loading: skeleton rows. Error: the existing load-error pattern with Retry. Empty: a "Create community" action leading to the existing Create Community screen.
4. **Community chosen** → the community's name as the sheet title and the **existing `PostComposer`** inside the sheet, with its own validation, reel waiting state, errors and offline state. After a successful Post the sheet closes and the app navigates to that community's feed, where the new post is at the top. A 404 from the composer (`onGone`) keeps the sheet open and returns to "Choose a community", freshly reloaded, so the community that is gone has left the list (amended 2026-11-10).

### 5.0c Shared: UI kit — agreed

- **Buttons (`Button`), by meaning:** primary = accent pill, one per screen; secondary = outlined pill in `line`; rating = `sticker` pill (Rate & Review, Submit rating); destructive = soft `danger` fill with `danger` text. All ≥ 44×44px. **Offline-disabled** buttons get a dashed `line` outline and muted text, so they never read as a faded-but-working button; `busy` keeps the inline spinner (the reels where the wait is a conversion).
- **Text fields:** `surface` background, 1.5px `line` border, radius `12px`; accent border on focus (plus the visible focus ring); `danger` border with the message below on error. Counters ("0/280") stay.
- **Toast:** a note on `tape` paper with `tape-ink` text and an icon (check / alert); existing messages unchanged.
- **Empty states:** dashed `line` frame, a small cassette illustration, heading in the display face, one line of the screen's existing copy, and its existing action if any.
- **Load error (`LoadError`):** quiet `surface` row, existing message, outlined Retry.
- **Skeletons (`Skeleton`):** static blocks in `surface` tones, no shimmer — motion is reserved for the reels.
- **Sheets (`Sheet`):** `surface`, top radius `22px`, grab handle, title in the display face.
- **Avatars (`Avatar`):** unchanged generator (initials, deterministic hue, uploaded or Google photo); circle.

### 5.1 Communities Dashboard (Home) — agreed

- **Header, two rows.** Row 1: the small mark and "BookRough" (Wordmark, compact variant) on the left; Search icon button (→ `/search`) and the notifications bell with its unread badge on the right. Row 2: the "Your communities" heading in the display face, and the secondary **Sign out** pill beside it (kept on Home per visible-sign-out.md §5.1; opens `SignOutSheet` as today). The split stops the heading from truncating at 375px.
- **List:** each community is a full-width **cassette card** (§3.5): stripe band in the community's hue, name in the display face, "N members · Role" below it, two reels on the right. The whole card links to the feed, as today.
- **Create community:** the floating button is **removed**; a dashed "+ Create community" tile ends the list. (Also reachable from the Share sheet when you have no communities.)
- **Loading:** three cassette-shaped skeletons. **Error:** `LoadError` with Retry, existing copy. **Empty:** the kit's empty state with the existing heading, line and primary "Create community" button.
- The header sits outside the request states, so Search, the bell and Sign out show in every state, as today.

### 5.2 Community Feed — agreed

- **Back:** "← Communities" as an icon + text link (≥ 44px), as today.
- **Banner:** a large cassette (`CommunityCover` banner variant): stripe band in the community's hue, the name on the `tape` label in the display face, and a reel window with two reels. The `h1` stays a real heading (the label is its visual treatment, not an image).
- **Details:** description and membership line unchanged. "Invite friends" (admins only) and "Settings" become outlined chips with icons; same targets.
- **Composer, collapsed:** a pill "Share a song or album" (link icon) in `surface`. Tapping it expands, in place, into the existing `PostComposer` with focus in the link field and an ✕ that collapses it again (the draft is kept while the screen is open). The offline alert above it stays. While posting, the reel cassette shows with the existing progress copy. After posting it collapses, and the new post is at the top, as today.
- **Feed:** `PostCard`s (§5.0); "Load more" / "Try again" as a secondary button, existing error line.
- **Loading:** a banner-shaped skeleton and two post skeletons. **Error:** `LoadError`, existing copy. **Empty:** the kit's empty state with the existing "Share the first song" copy. **404:** the existing NotFound.
- **InvitePanel** (after creating, or from Invite friends) is styled with the kit; behaviour unchanged.

### 5.3 Post Detail — agreed

- **Back:** "← {community name}" or "← Recommendations", as today.
- **Post:** the `PostCard` in its detail mode (`linkToDetail={false}`) with a **full-width square cover** (radius `16px`) instead of the thumbnail, a **large sticker** (average, count) and the "You: N" tag. Title in the display face, larger. No comments chip here (the discussion is on the page).
- **Ratings section** ("Ratings" heading in the display face): the old big-number block ("7.5 out of 10 · N ratings") is **removed** — the large sticker carries it. "No ratings yet" stays as text when there are none.
  - Each rating is a `surface` card: a small rotated `sticker` disc with the score, the rater's name (`PersonLink`, "You" for yours), time; the review text below; "Edit" (yours) as an outlined chip.
  - A review's thread: replies indented with a small avatar, name, time and text; the existing reply composer as an outlined field ("Reply to …"). Delete and edit-comment flows unchanged.
- **Comments section** ("Comments" heading): the same card treatment; the existing comment composer as the last element. The "no longer friends" note stays.
- **Order:** stacked — post, ratings, comments — as today.
- **States:** post loading skeleton (full-width square), ratings skeletons, `LoadError`s with existing copy, NotFound on 404, offline-disabled buttons per the kit.

### 5.4 Friends & Requests — agreed

- **Header:** "Friends" in the display face; a Search icon button (→ `/search`) on the right.
- **Recommendations entry:** the existing row becomes a featured `tape` paper tile at the top — envelope icon, "Recommendations" in the display face, the existing badge in the accent. Same target, same badge rule. **No new subtitle** (existing copy only).
- **Offline alert:** unchanged copy, kit styling.
- **Community invitations / Friend requests:** each section a `surface` card with dividers; section labels in `muted`. Invitation rows lead with a mini cassette in the community's hue; request rows with the avatar. Join / Accept as accent pills, Decline as outlined pills. Behaviour unchanged.
- **Your friends:** one `surface` card with divider rows — avatar, name, ⋯ (remove friend sheet, unchanged). "Friends you accept appear here." stays.
- **States:** row skeletons, `LoadError` with existing copy, the kit's empty state with the existing "No friends yet" copy and its Search link.

### 5.5 Recommendations — agreed

- **Back:** "← Friends", as today. **Heading:** "Recommendations" in the display face.
- **"Send a song"** moves to its own full-width row under the heading (the accent primary — the screen's one primary). Opens `SendRecommendationSheet` as today; offline-disabled per the kit.
- **Received / Sent:** one pill track in `surface`; the selected side is `tape` paper with `tape-ink` text (not the accent), unselected in `muted`. Still a `role="group"` of two `aria-pressed` buttons, each ≥ 44px.
- **List:** `PostCard`s in their direct variant (§5.0). Empty states keep "Nothing here yet" / "You haven't sent anything" in the kit's empty treatment. Offline alert, skeletons and `LoadError` per the kit.

### 5.6 Public User Profile — agreed

- **Back link:** unchanged from today's code.
- **Header:** a `tape` paper card with a stripe band in the **user's own hue** (`avatarHue(user.id)`, the same as their generated avatar); inside it the 72–80px avatar with a `tape-ink` ring, the display name in the display face, and "Listens on {service}" in `muted`.
- **Actions:** `FriendButton` (all its states) as a secondary pill and "Send a song" (friends only) as the primary, side by side at half width each; a single button takes the full row.
- **Ratings** (heading in the display face): each row is a `surface` card linking to Post Detail — a 64px cover with a small `sticker` disc carrying the score (replacing the "N/10" text), title, artist, review text, and "in {community} · {time}" in `muted`. Pending titles unchanged.
- **States:** avatar + name skeleton, rating skeletons, `LoadError`s and the "No ratings to show" empty state with existing copy; "Load more" as a secondary button.

### 5.7 Global Search — agreed

- **Heading:** "Search" in the display face. (Reached from the Home and Friends header icons now that it has no tab.)
- **Field:** a pill-shaped `surface` field with a leading search icon; accent border on focus; placeholder "Display name" and the screen-reader label unchanged.
- **Results:** one `surface` card with divider rows — avatar and name (`PersonLink`) leading to the profile, as today. No `FriendButton` in the rows (amended 2026-11-10): the search response carries no friendship state, so a button would need a backend change; it was deferred to a separate feature after the redesign — now `search-friend-button.md`, which puts Add Friend and Respond in rows as the accent pill.
- **States:** row skeletons while searching; existing empty / no-results / error copy in the kit's treatments (the one-sentence no-results line in the kit's dashed frame, without a heading — there is no heading copy).

### 5.8 Notifications — agreed

- **Back:** "← Home", as today. **Header:** "Notifications" in the display face with "Mark all as read" as an outlined chip beside it (same disabled rules).
- **Rows:** unread = a raised `surface` card, `ink` text, an accent dot on the right (plus the existing sr-only "Unread"); read = flat on `canvas` with `muted` text and a muted avatar. Replaces today's accent border + `accent-soft` fill. Tapping behaves as today (marks read, navigates).
- **Copy:** unchanged (`notificationCopy.ts`).
- **States:** row skeletons, `LoadError`, the "No notifications yet" empty state, "Load more" as a secondary button.

### 5.9 My List — agreed

- **Heading** "My List" in the display face; the existing line "Songs you saved to listen later." in `muted`.
- **`SavedPostCard`:** same skeleton as the post card — 96–116px side thumbnail, title, artist, kind tag; the "Shared by … in … · Saved …" / "Sent by …" line in `muted` (community link kept).
  - "Rate & Review" as the `sticker` yellow pill (when it shows today); the "no longer in / no longer friends" line otherwise.
  - "Open in …" becomes the **accent** pill (today outlined); "Remove" an outlined chip beside it.
- **States:** card skeletons, `LoadError`, the "Nothing saved yet" empty state, "Load more" as a secondary button.

### 5.10 Submit Rating sheet (`RatingSheet`) — agreed

- **Sheet:** kit sheet; title ("Rate & Review" / edit title) in the display face; song title and artist as today.
- **Score: one row of ten stars** (developer's choice, 2026-11-09), replacing the 5×2 grid of number buttons. Still a `role="radiogroup"` with ten `role="radio"` items, star N = score N, `aria-label` "N out of 10"; integer 1–10, same API.
  - Stars up to the chosen score fill in `sticker` yellow; the rest are `muted` outlines (amended 2026-11-10: `line` outlines were 1.7:1 against the sheet). The chosen star gets the small "stick" motion (rotate + scale; none under reduced motion).
  - A large readout "N/10" in the display face sits on the "Your score" row, so the choice is legible without counting.
  - **Declared exception to the 44×44px touch-target rule (CLAUDE.md §8):** at 375px each star is about 34×44px. Mitigations: the ten targets run edge to edge with no gaps (the sheet's side padding is reduced for this row only); dragging a finger across the row sets the score continuously (pointer events, released = chosen); arrow keys move the choice; the readout makes a mis-tap visible before submitting.
- **Comment, error, offline:** kit field with the existing counter and messages.
- **Submit:** a `sticker` yellow pill ("Submit Rating" / "Save changes" / "Submitting…"), disabled rules unchanged.

### 5.11 My Profile / Settings — agreed

- **Heading** "Your profile" in the display face.
- **Avatar section:** a `tape` paper card with a stripe band in the user's own hue (as on the Public Profile, §5.6): the 72–80px avatar with a `tape-ink` ring, "Upload a photo" as an outlined pill in `tape-ink`, "Use my Google photo" with its existing helper text. The Google button keeps **Google's own styling** (Google branding rules). Remove-photo and error/progress states unchanged, kit styling.
- **Display name:** kit field with the existing counter and help text.
- **"Where do you listen?":** selectable rows (`role` and `fieldset` unchanged); the selected row on `tape` paper with an accent radio, the others outlined; service names only, no logos.
- **Save changes:** accent primary, full width; same enable rules.
- **Admin area** (admins only): a `surface` row with an icon and a chevron.
- **Sign out:** an outlined chip, centred, opening `SignOutSheet` as today.

### 5.12 Welcome — agreed

- **Install hint** (`InstallHint`): unchanged behaviour, kit styling (a `tape` note bar).
- **Hero:** the logo, `hero` variant (§3.8), centred. Amended 2026-11-10: it replaces the tilted cassette agreed on 2026-11-09, so the screen shows one cassette, not two. Static — no animation.
- **Demo line removed:** the decorative "Spotify link → Apple Music" pills (`aria-hidden` today) are deleted, not moved and not replaced. Spotify to Apple Music is only one of many conversions and does not sum up the app; the admin's tagline below the logo does that job.
- **Tagline:** the admin's `welcomeTagline`, centred, in the display face at a medium size (it must fit up to 80 characters at 375px).
- **Sign in / Create account:** the pill track from §5.5 (selected side on `tape`), then the Google button in **Google's own styling**, then "No passwords. We never store your email." in `muted`. Errors and the "Create account" offer after a 404 unchanged, kit styling.
- Content sits at the bottom of the screen (thumb reach); the hero fills the top.

### 5.13 Complete Your Profile — agreed

- **Heading** "Complete your profile". Offline alert unchanged.
- **Your cassette:** a `tape` label with a stripe band in the user's hue, showing the display name **as it is typed** (presentation of the field's current value; placeholder look when empty). No new data.
- **Your avatar:** the two existing tiles (Generated / Google photo) side by side; the selected tile on `tape` paper, the other outlined. Helper line unchanged.
- **Display name / Where do you listen?:** as on My Profile (§5.11).
- **Continue:** accent primary, full width. The small "Sign out" link stays as it is (no confirmation), per visible-sign-out.md.

### 5.14 Join Community (invite preview) — agreed

- Compact Wordmark at the top; `InstallHint` unchanged.
- The community as a large `tape` cassette tilted about +2° (banner variant), name in the display face on the label, reel window; membership details below as in the code.
- Join (accent primary, full width) for signed-in users; for signed-out users the Sign in / Create account switch and Google button (§5.12), `defaultIntent="signup"` unchanged.
- **States:** cassette + title skeletons, `LoadError`, the invalid-link state in the kit's empty treatment with its existing copy; banned / already-member outcomes unchanged.

### 5.15 Create Community — agreed

- **Heading** "New community" and the existing cancel link.
- **Preview:** the existing `CommunityCover` preview (id `null`) becomes a **blank cassette** — the `tape` label and stripes in neutral greys — with the name appearing as typed. The real hue arrives with the id after creation, as today.
- **Fields:** `CommunityDetailsFields` in kit styling. **Invite friends:** the existing `FriendPicker` as a `surface` card of rows with accent checkboxes.
- **Create community:** accent primary, full width; busy and error states unchanged.

### 5.16 Community Settings & Members — agreed

- **Heading** "Settings"; section labels ("Details", role groups) in `muted`.
- **Details:** kit fields, Save as a secondary-sized primary as today.
- **Members:** grouped Owner / Admins / Members, each group a `surface` card with divider rows (avatar, name, ⋯). The ⋯ opens a **bottom action sheet** (as on the post card, §5.0) with the existing member actions; the confirmation sheets and their copy are unchanged.
- **Leave community:** outlined pill. **Delete community:** destructive (soft `danger`). Owner-cannot-leave sheet unchanged.

### 5.17 Admin — agreed

- **Heading** "Admin".
- **Design switch (new, temporary, §4):** above the section tabs, in its own dashed `line` frame — "Design on this device", a two-option pill track ("Current" / "Mixtape", selected on `tape`), and the line "Only this device. Everyone else sees Current." — "… sees Mixtape." from the swap. Stored in local storage only; never sent to the server. Removed in the cleanup PR.
- **Section tabs** (Users / Communities / Settings): the pill track style, selected on `tape`.
- **Users / Communities lists:** `surface` cards with divider rows; "Remove photo" and its sheet unchanged.
- **Settings:** accent swatches show the **new** shades under Mixtape (selected swatch ringed in `ink`); banner and tagline as kit fields; history list unchanged in content.

## 6. Delivery slices

Agreed 2026-11-09: **four slices, then the swap, then the cleanup** — six PRs in all, each a full Stage 2–4 cycle with `/code-review`, its own tests (CLAUDE.md §10), its DEVELOPMENT.md entry (§13), and the Vercel storage check before merging (CLAUDE.md §16). Until the swap, every slice is visible only behind the design switch.

| #   | Branch (proposed)           | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `feat/redesign-foundation`  | Design switch (§4) and `data-design`; Mixtape tokens for light and dark, accent shades (§3.1–§3.2); Bricolage Grotesque; the kit (§5.0c); tab bar with Share (§3.4); Share sheet (§5.0b); `PostCard` (§5.0); `RatingSheet` (§5.10); cassette `CommunityCover` and reel loader (§3.5, §3.7); the logo, both `Wordmark` variants (§3.8), placed on each screen in that screen's slice; runtime `theme-color`. Docs: `docs/tech stack.md` §5 (font) and §5.2 (the `frontend-design` and `Design` plugins), `.md` + `.docx` (CLAUDE.md §18). |
| 2   | `feat/redesign-core-loop`   | Home (§5.1), Community Feed (§5.2), Post Detail (§5.3), Create Community (§5.15), Community Settings (§5.16).                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | `feat/redesign-social`      | Friends (§5.4), Recommendations (§5.5), Public Profile (§5.6), Search (§5.7), Notifications (§5.8), My List (§5.9), My Profile (§5.11).                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4   | `feat/redesign-entry-admin` | Welcome (§5.12), Complete Your Profile (§5.13), Join Community (§5.14), Admin (§5.17).                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | `feat/redesign-swap`        | Mixtape becomes the default for everyone; `DEFAULT_ACCENT` / `accentColor.defaultValue` → `orange` (frontend + backend); the E2E suite updated for the new navigation (Search through the header icon). Docs: `frontend screens` (.md + .docx) for the tab bar, Share sheet and Search entry; CLAUDE.md §8 records the star-row touch-target exception.                                                                                                                                                                                  |
| 6   | `chore/redesign-cleanup`    | Old tokens, old component branches, Space Grotesk (`@fontsource/space-grotesk`) and the design switch removed; this spec marked done.                                                                                                                                                                                                                                                                                                                                                                                                    |

## 7. Edge cases & failure modes

- **No communities** → Share → "To a community" shows the empty state with Create community.
- **No friends** → Share → "To a friend" shows the friend picker's existing empty state.
- **Offline:** the Share button stays visible; the composer and send sheet show their existing offline states; offline-disabled buttons use the dashed treatment (§5.0c).
- **Composer 404 inside the Share sheet** (community deleted, or you were removed) → the sheet stays open on "Choose a community", reloaded without that community; the error shows as the usual toast.
- **Local storage unavailable** (private mode) or an unknown stored value → the default design; `?design=` values other than `new` / `old` are ignored.
- **Switch flipped mid-session** → applies at once (attribute on `<html>`); no reload, nothing on the server changes.
- **Long names:** community names on cassette labels wrap to two lines, then truncate with an ellipsis (the full name stays in the `h1` / accessible name); display names truncate in rows.
- **Sticker numbers:** averages such as "10" and "7.5" and counts in the hundreds fit the disc (the count abbreviates as the existing badge text does).
- **No cover art:** the existing `CoverArt` placeholder fills the 116px slot; the sticker still sits on it.
- **Reduced motion:** reels static, no sticker "stick", sheets open without sliding.
- **Light-mode contrast:** every text/background pair in §3.1–§3.2 meets 4.5:1 (3:1 for large display text); checked in Stage 3 with `design:accessibility-review`.
- **iPhone safe area:** the raised Share button and the tab bar stay clear of the home indicator in the standalone PWA.
- **Star row:** a mis-tap is corrected by tapping again or dragging; the readout shows the value before Submit.
- **Admin accent other than orange:** the logo stays fixed orange and yellow; the switch frame and stickers never follow the accent.
- **Crowded headers:** if a screen's top row cannot fit the compact logo beside its existing controls at 375px, that is raised with the developer in the slice that redesigns the screen — never solved by silently dropping a control.

## 8. Test scenarios

No backend behaviour changes before the swap. The old design is the default until then, so the **whole existing suite keeps passing unchanged** — that is the regression test for "no functionality changes". New tests set the design to Mixtape.

**Unit (frontend lib)**

- ✅ Design preference: `?design=new` stores Mixtape; `?design=old` stores Current; no parameter reads the stored value.
- ❌ An unknown parameter value is ignored; storage that throws falls back to the default.

**Unit (backend) — swap slice only**

- ✅ The `accentColor` default is `orange` when no row exists.
- ❌ A stored non-default accent still wins over the default.

**Integration (endpoints) — swap slice only**

- ✅ App settings with an empty `app_settings` table return `accentColor: 'orange'`.
- No new endpoints; the existing 400 / 401 / 403 / 404 coverage is unchanged.

**Component (Vitest + RTL, under Mixtape)**

- ✅ Tab bar: Home, Friends, Share, My List, Profile; no Search tab; the Home and Friends badges and their accessible names as today.
- ✅ Share sheet: both options; To a friend opens `SendRecommendationSheet` with the picker; To a community lists your communities; choosing one shows `PostComposer`; a successful post closes the sheet and navigates to the feed; back returns one step.
- ❌ Share sheet: community list loading, error with Retry, empty with Create community; the composer's `onGone` returns to the community list, reloaded.
- ✅ Post card: sticker with average and count when rated; "You: N" tag when the viewer rated; no "You rated" header line; comments chip "N comments" / "Comments" linking to Post Detail; Rate & Review on a received direct item; the pending variant with reels and "Find on other services"; no "Other services" on link-only posts.
- ❌ Post card: no sticker without ratings; the ⋯ sheet shows only the permitted actions (Hide / Edit comment / Delete post).
- ✅ Rating sheet: ten stars as radios; tapping star N checks N and shows "N/10"; arrow keys move the choice; a drag across the row sets the value; edit mode starts at the existing score.
- ❌ Rating sheet: Submit disabled with no score, offline, or a comment error; the existing error messages show.
- ✅ Home: Search icon and bell in row 1, Sign out beside the heading; cassette cards link to their feeds; the dashed Create tile; no floating button.
- ❌ Home: loading skeletons, `LoadError` with Retry, the empty state.
- ✅ Feed composer: the collapsed pill expands to the composer with focus in the link field; ✕ collapses it and keeps the draft; posting collapses it and the post is on top.
- ✅ Post Detail: no average block; "No ratings yet" with none; ratings, threads and comments stacked.
- ✅ Recommendations: Received / Sent keep `aria-pressed`; Send a song on its own row.
- ✅ Notifications: unread rows marked (dot + sr-only "Unread"), read rows not; Mark all as read as before.
- ✅ Friends: the Recommendations tile with its badge; the Search icon.
- ✅ Complete Your Profile: the cassette label shows the typed name.
- ✅ Admin: the design switch changes the `<html>` attribute and the stored value; it renders only for admins.
- ❌ Admin: the switch never calls the API.

**E2E (Playwright)** — golden loops only

- Before the swap: the existing suite, unchanged, on the default design.
- Swap slice: the suite updated for the new navigation (Search through the header icon; posting still works from the feed), running on Mixtape.

**Accessibility (Stage 3 of each slice)** — `design:accessibility-review` over the slice's screens at 375px, light and dark: contrast, focus visibility, touch targets (with the declared star-row exception), reduced motion.

## 9. Open questions

None.

## 10. Decisions log

| Date       | Decision                                                                                          | Reason                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-09 | Direction "Mixtape" chosen over "Gig poster" and "Equaliser"                                      | Most personality; addresses "generic" directly                                                                               |
| 2026-11-09 | Accent = signal colour; default `orange`; paper, sticker, stripes fixed                           | Identity survives any admin choice                                                                                           |
| 2026-11-09 | Keep both light and dark modes                                                                    | Respect each friend's phone setting                                                                                          |
| 2026-11-09 | Central Share button; Search to header                                                            | Puts the core action first; reuses existing flows only                                                                       |
| 2026-11-09 | Rating sticker shows average + count, plus "You: N"                                               | Data already on the post                                                                                                     |
| 2026-11-09 | Bricolage Grotesque approved as a new dependency                                                  | Heading face for the direction                                                                                               |
| 2026-11-09 | Per-device admin switch; screens merge to `main` behind it                                        | Compare on real data on the iPhone without affecting friends; no long-lived branch, no preview storage                       |
| 2026-11-09 | Single motion moment: spinning reels                                                              | The 3–8 s conversion wait is the one place motion helps                                                                      |
| 2026-11-09 | Post card: 116px side thumbnail, not full-width cover                                             | Two posts per screen keeps the feed scannable; Post Detail shows the full cover                                              |
| 2026-11-09 | Post card variants (direct, pending, link-only) and ⋯ as bottom sheet                             | Yellow = rating; reels for pending; familiar iPhone pattern, card doesn't jump                                               |
| 2026-11-09 | Share → community: the composer opens inside the sheet, then navigates to the feed                | No screen jump mid-action; `PostComposer` already takes a community id                                                       |
| 2026-11-09 | Home: two-row header keeps Sign out visible; floating Create button replaced by a dashed tile     | Avoids two floating accent buttons next to the Share button; few communities per user                                        |
| 2026-11-09 | Feed composer collapsed to a pill, expands in place                                               | Posts visible on the first screen; same component                                                                            |
| 2026-11-09 | Post Detail: big sticker replaces the average block; ratings and comments stay stacked            | Nothing hidden; reply notifications always land on visible content                                                           |
| 2026-11-09 | Rating sheet: one row of ten stars, a declared exception to the 44px rule                         | Developer's choice; mitigated by gapless targets, drag-to-set, arrow keys and an N/10 readout                                |
| 2026-11-09 | All 17 screens designed and approved one by one (§5.1–§5.17)                                      | Stage 1 screen pass complete                                                                                                 |
| 2026-11-10 | Logo: cassette mark + "BookRough"; large on Welcome, small top-left elsewhere                     | Developer chose option A and the capitalised spelling; one cassette on Welcome, so it replaces the tilted hero               |
| 2026-11-10 | Contrast: `muted` outlines for unfilled stars; 1px `line` ring on tape paper in light mode        | Slice 1 accessibility review: `line` stars 1.7:1, tape on white about 1.03:1; developer approved both                        |
| 2026-11-10 | Share sheet: a composer 404 returns to the reloaded community list, the sheet stays open          | Developer kept the slice-1 behaviour: the user stays in the flow and can pick another community at once                      |
| 2026-11-10 | Search under Mixtape: Home header icon in slice 2, Friends icon waits for slice 3                 | Developer accepted the gap; the old design stays the default until the swap                                                  |
| 2026-11-10 | `line` boundaries (fields, chips, dashed tiles) stay as specced although below 3:1                | Slice 2 accessibility review; developer's choice: labels and text identify the controls, and fields match the Current design |
| 2026-11-10 | Welcome demo line "Spotify link → Apple Music" removed, not replaced                              | One conversion of many, not the app's essence; the admin tagline already says what the app is                                |
| 2026-11-10 | Search results under Mixtape keep today's rows (no `FriendButton`); the button is a later feature | Slice 3: the search API returns no friendship state; adding it is a backend change, out of scope for a visual redesign       |
| 2026-11-10 | Swap: `index.html` carries Mixtape's `data-design` and bar colours; Current is set at runtime     | Without it every load painted the Current canvas for a moment before the default design applied                              |
