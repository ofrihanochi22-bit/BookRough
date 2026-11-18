# Feature: PWA icons from the cassette logo

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-1 (the app a friend installs and opens) — no behaviour change   |
| **Phase**     | 6 (follow-up to the Mixtape redesign, `ui-redesign.md` §2)         |
| **Branch**    | `feat/pwa-icons-cassette`                                          |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged |

---

## 1. Goal

The Mixtape redesign gave BookRough a logo — the cassette mark (`ui-redesign.md` §3.8) — but the home-screen icon, the Android icon and the favicon still show the placeholder purple vinyl from `pwa-installable.md` §3.2. After this ships, a friend who adds BookRough to their iPhone home screen, installs it on Android or looks at the browser tab sees the same orange cassette the app shows on Welcome.

## 2. Scope

**In scope**

- A new source `frontend/public/icons/icon.svg`: the `CassetteMark` drawing, unchanged and about 338 px wide, centred on a full-bleed **canvas `#1B1A2E`** square (option A, chosen 2026-11-11).
- Re-rendering every PNG from it with the existing `frontend/scripts/render-icons.mjs`: `icons/icon-192.png`, `icons/icon-512.png` (also the maskable entry) and `apple-touch-icon.png` (180).
- The favicon follows automatically — it is `icon.svg` itself.
- Updating `pwa-installable.md` §3.2, whose text describes the placeholder, so it points here.

**Out of scope**

- Any new dependency or image tool. The script already uses the Chromium that `e2e/`'s Playwright installs (CLAUDE.md §18: nothing new to record).
- The manifest and `index.html`: names, paths, sizes, `theme_color` and `background_color` stay as they are. The Android splash therefore shows the dark icon on the light `#ECEAF4` background — accepted.
- New sizes (a 32 px PNG favicon, `.ico`, extra Apple sizes, iOS splash images). iOS scales the 180 icon for every device; modern browsers use the SVG favicon.
- The word "BookRough" inside the icon — the OS prints the name under it.
- Following the admin accent (`ui-redesign.md` §3.2): the mark's colours are fixed.
- A service worker (Step 6.2).

## 3. Data model changes

None.

## 4. API

None.

## 5. Screens & components

No screen changes. The artwork:

| Piece      | Value                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background | `#1B1A2E` (dark `canvas`), full bleed, square corners — iOS and Android apply their own mask                                                        |
| Mark       | `CassetteMark` (`frontend/src/components/ui/Cassette.tsx`), element for element, same colours                                                       |
| Mark size  | 338 × 214.5 px on a 512 canvas (the 104 × 66 mark at scale 3.25), exactly centred: `translate(87 148.75)`                                           |
| Safe zone  | The mark's corners sit at most 200.2 px from the centre, inside the 204.8 px maskable circle (40 % of 512), so one file serves `any` and `maskable` |

At 16 px (favicon) the yellow hubs blur away and the cassette reads as an orange block with a light window and two dark dots. Accepted.

## 6. Edge cases & failure modes

- **iOS caches the home-screen icon.** A friend who already installed BookRough keeps the purple icon until they remove it and add it again. Accepted; the manual check (§7) uses a fresh install.
- **Browsers cache the favicon.** A hard reload shows the new one.
- **The logo changes later.** `icon.svg` copies the mark rather than importing it (it is a static file). A test compares the two, so the copy cannot drift silently.

## 7. Test scenarios

**Unit (`frontend/src/manifest.test.ts`)** — the existing manifest tests (sizes, files exist, PNG dimensions, `index.html` links) keep passing unchanged. Added:

- ✅ `icon.svg` contains the `CassetteMark` drawing — the same elements with the same attributes as the rendered component.
- ✅ `icon.svg`'s background is a full-bleed `#1B1A2E` square.
- ✅ The scaled mark fits inside the maskable safe circle.
- ❌ The placeholder purple `#534ab7` appears nowhere in `icon.svg`.

**Production-build check (Claude, CLAUDE.md §16)** — `npm run build && npm run preview`, then in the browser: `dist/` holds the new icons; `/icons/icon.svg`, `/icons/icon-192.png`, `/icons/icon-512.png` and `/apple-touch-icon.png` all answer `200` and show the cassette; the tab shows the new favicon.

**Manual (developer, after merge)** — remove BookRough from the iPhone home screen, add it again from Safari: the icon is the orange cassette on dark indigo.

**E2E** — none; nothing in a golden loop changes.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                            | Reason                                                                                                                             |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-11 | Composition A: the whole cassette on the dark canvas                | Chosen by the developer over tape-paper (B) and full-bleed orange (C); keeps the mark identical to the logo                        |
| 2026-11-11 | Keep the existing render script and file set                        | It already renders every size from one SVG with no new dependency                                                                  |
| 2026-11-11 | Scale 3.25 at `translate(87 148.75)` instead of 3.269 at `(86 148)` | `/code-review`: the first value left the mark a quarter-pixel off centre; 3.25 centres it exactly and stays inside the safe circle |
