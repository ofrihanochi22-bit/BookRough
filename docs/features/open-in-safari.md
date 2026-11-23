# Feature: Open in Safari from the installed app

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-11, UC-12, UC-20 (presentation only: how a post's links open)   |
| **Phase**     | 6                                                                  |
| **Branch**    | `feat/open-in-safari`                                              |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged |

---

## 1. Goal

In the installed PWA on an iPhone, iOS opens a link in a browser window over BookRough, and closing that window with **Done** stops the song (manual-test-fixes-1122.md §5.2). After this ships, tapping an external link in the installed app first asks **"Open in browser?"**. **Open in Safari** hands the link to full Safari, where the song keeps playing while the user goes back to BookRough. **Copy link** is the fallback that always works. It is an alternative to the parked in-app player (D6), not a replacement for it.

## 2. Scope

**In scope**

- `components/ExternalLink.tsx` (the only external link in the app, kept so by `externalLinks.test.ts`) asks first, but only on iOS in standalone mode. That covers its three users: the "Open in …" pill on a post card (`PostCard`), the same pill on a saved card (`SavedPostCard`), and the links in the Other services sheet (`postCardParts`).
- A new sheet, `OpenInBrowserSheet`, built on the existing `Sheet`.
- A pure helper in `lib/` that decides "iOS standalone" (reusing `isIos` from `lib/installHint.ts`) and builds the Safari address.

**Out of scope**

- **Android and desktop.** An installed PWA there already opens an out-of-scope link in the real browser (a Chrome tab or window), so the song keeps playing. No prompt.
- **A normal browser tab, iOS Safari included.** The link opens in a new tab exactly as today (D3); Safari already keeps the song playing.
- **"Don't ask again".** The sheet asks on every tap (developer's choice, 2026-11-22, §8).
- **An in-app player** (D6, parked).
- **Detecting the service's own app.** When Spotify, YouTube or Bandcamp is installed, iOS may pass a universal link to that app; that is iOS's decision, before or after Safari, and unchanged.

## 3. Data model changes

None.

## 4. API

None. The change is frontend only.

## 5. Screens & components

### 5.1 How Safari is reached

A website has no documented way to leave the standalone window for full Safari. The one known route is Safari's own URL scheme: the address with `https://` replaced by `x-safari-https://` (and `http://` by `x-safari-http://`). iOS hands such an address to Safari, which opens the real link.

**Honest limits, recorded for the decision (§8):**

- Apple does not document the scheme. Reports disagree on whether it still works: some say it stopped on iOS 18.5, others that it works on iOS 26, and a February 2026 report says it stopped again. It can disappear in any iOS update.
- The page can't learn whether Safari opened. §5.3 uses the one signal it has.
- So **Copy link** is always on the sheet, and is the path that keeps working whatever Apple does.

### 5.2 `ExternalLink`

- **Not iOS standalone:** renders `<a href target="_blank" rel="noopener noreferrer">`, unchanged.
- **iOS standalone:** renders the same `<a>`, with the same `href` (so a long-press still shows the real address), but a tap is intercepted (`preventDefault`) and opens `OpenInBrowserSheet` for that address. A tap with a modifier key never happens on an iPhone, so no special case.
- "iOS standalone" means `isIos(navigator)` and (`navigator.standalone === true` or `matchMedia('(display-mode: standalone)')` matches): the same test as `shouldOfferInstall`, inverted. It is read on each tap, not once at load.

### 5.3 `OpenInBrowserSheet`

Phone width first; a bottom sheet (the `Sheet` default).

- **Title:** "Open in browser?"
- **Body:** "Open this link in Safari, so the music keeps playing while you use BookRough."
- **Buttons**, stacked full width, primary first:
  1. **Open in Safari** (primary). Navigates to the `x-safari-` address (`window.location.assign`), then closes the sheet.
  2. **Copy link** (secondary). Writes the original `https://` address with `navigator.clipboard.writeText`. On success: closes the sheet and toasts "Link copied. Paste it in Safari." On failure (no clipboard access): the sheet stays open and shows the address in a read-only field, selected, with the note "Copy this link and paste it in Safari.", as `InvitePanel` does.
  3. **Cancel** (secondary, text-only weight). Closes the sheet; nothing opens.
- **If Safari didn't open:** after **Open in Safari**, if the page has neither become hidden (`visibilitychange` to `hidden`, or `pagehide`) nor lost focus (`blur`, as when an iOS prompt covers it) within 2 seconds, the app toasts "Safari didn't open. Try Copy link instead." This is how a dropped scheme shows itself, instead of a tap that silently does nothing. If the page does become hidden, nothing is shown.
- **Loading / empty / error:** no network is involved, so no loading or empty state. The only error states are the clipboard failure and the "Safari didn't open" toast above.
- **Offline:** the sheet works the same; Safari shows its own offline page. Opening a link is reading, not writing (CLAUDE.md §16).
- All buttons are at least 44 px tall (CLAUDE.md §8).

### 5.4 Opened from the Other services sheet

The links there sit inside a `Sheet`. The new sheet opens on top of it (rendered later, same `z-20`, so it is the one shown and the one Tab is kept in). Choosing any button closes only the new sheet; the Other services sheet stays open behind it.

## 6. Edge cases & failure modes

- **The scheme is gone in a future iOS:** the "Safari didn't open" toast points to Copy link (§5.3). Recorded as a known risk; if it happens, a follow-up removes the Open in Safari button (§8).
- **A link that is neither `https:` nor `http:`:** can't come from the server (every stored link is a service URL), but the helper returns no Safari address for it, and the sheet then shows only Copy link and Cancel.
- **iPad in standalone:** `isIos` counts an iPad (desktop user agent plus touch points), so it gets the sheet too. Same iOS behaviour, so that is right.
- **Escape with two sheets open** (§5.4, a keyboard on an iPad): both sheets listen on the document, so Escape closes both. Acceptable; nothing is lost.
- **A user who taps the pill twice quickly:** the first tap opens the sheet, which covers the pill, so the second can't reach it.
- **The page hidden for another reason within 2 seconds** (the user switches apps): no toast. That is correct either way.

## 7. Test scenarios

**Unit (`lib/`)**

- ✅ `isIosStandalone`: true for an iPhone user agent with `standalone: true`; true for an iPhone with the `display-mode: standalone` media match; true for an iPad (Macintosh user agent, touch points > 1) in standalone.
- ❌ `isIosStandalone`: false for iPhone Safari in a tab; false for Android in standalone; false for desktop Chrome in standalone; false when `matchMedia` is missing and `standalone` is undefined.
- ✅ `safariUrl`: `https://…` → `x-safari-https://…`; `http://…` → `x-safari-http://…`; query and hash kept.
- ❌ `safariUrl`: returns `null` for `mailto:`, `javascript:` and an unparseable string.

**Component (`ExternalLink`, `OpenInBrowserSheet`)**

- ✅ Not iOS standalone: renders the new-tab link and a click opens no sheet (existing test kept).
- ✅ iOS standalone: a click is prevented and shows "Open in browser?" with the three buttons.
- ✅ Open in Safari navigates to the `x-safari-https://` address and closes the sheet.
- ✅ Open in Safari, page becomes hidden: no toast.
- ❌ Open in Safari, page stays visible for 2 seconds: toasts "Safari didn't open. Try Copy link instead."
- ✅ Copy link writes the original address, closes the sheet and toasts "Link copied. Paste it in Safari."
- ❌ Copy link with the clipboard refused: the sheet stays open and shows the address, selected.
- ✅ Cancel closes the sheet and navigates nowhere.
- ❌ A link with no Safari address shows only Copy link and Cancel.
- ✅ Opened from the Other services sheet: closing the new sheet leaves Other services open.

**Guard**

- `externalLinks.test.ts` still passes: the only raw `<a>` stays in `ExternalLink.tsx`.

**Manual (after merge, developer's choice, §8)** — all three passed on the developer's iPhone, in the installed production app, on 2026-11-23: the `x-safari-https://` scheme opened full Safari and the music kept playing.

- M1. In the installed app on the developer's iPhone: tap "Open in Bandcamp", choose Open in Safari. Safari opens the album; play it, switch back to BookRough; the song keeps playing.
- M2. Same, with Copy link: paste in Safari, same result.
- M3. In Safari (not installed): the link opens in a new tab with no sheet.

## 8. Decisions log

| Date       | Decision                                                                                     | Why                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-22 | **Reverses** manual-test-fixes-1122.md §5.2: use the undocumented `x-safari-https://` scheme | It is the only way a standalone PWA can reach full Safari. The risk is accepted because the user is asked first and Copy link is always beside it. |
| 2026-11-22 | The sheet offers Open in Safari, Copy link and Cancel (no "Open here")                       | Developer's choice (option A). The overlay window is what stops the music, so it is not offered.                                                   |
| 2026-11-22 | Ask on every tap; no "Don't ask again"                                                       | Developer's choice. If the scheme stops working, a remembered choice would make every link tap do nothing; asking keeps Copy link in view.         |
| 2026-11-22 | Only iOS in standalone mode                                                                  | Android and desktop PWAs already open links in the real browser; iOS Safari tabs already keep the music playing.                                   |
| 2026-11-22 | Verified on the iPhone after merge, in production, not on a preview                          | Developer's choice: saves a ~1.2 GB preview image. If M1 fails, a follow-up PR removes Open in Safari and leaves Copy link.                        |
