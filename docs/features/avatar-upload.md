# Feature: Upload your own profile picture

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                       |
| ------------- | --------------------------------------------------------------------- |
| **Use cases** | UC-4 (edit account details) and UC-19 (administration), amended       |
| **Phase**     | 6 — Step 6.1h of `DEVELOPMENT.md`, from manual-test note **N10** (§0) |
| **Branch**    | `feat/avatar-upload`                                                  |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged    |

---

## 0. Where this comes from

Note **N10** of the manual test session (`docs/manual-tests/2026-11-04.md` §7). The developer asked whether users can pick a photo from their own device. For fewer than 100 users, with every image compressed into a small round avatar, Claude's assessment was: yes, and cheaply (roughly 100 × 20–30 KB ≈ 3 MB).

**This reverses three recorded decisions**, all updated in this PR:

- CLAUDE.md §2 and §8: "User image uploads. Generated avatars only." Uploads are now allowed, for the user's own avatar only.
- CLAUDE.md §17: "Read-only lists of users… No deleting, suspending or editing anyone." Admins can now remove one thing, a user's photo.
- CLAUDE.md §11: a new dependency, **`sharp`**, approved by the developer in this session.

Decided in this spec session, 2026-11-08:

| #   | Question               | Decision                                                                                                                                                                                                 |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Where is it processed? | **The browser and the server.** The browser crops and shrinks it for a fast upload. The server re-encodes it with `sharp`, so nothing crafted survives and EXIF (including location) is always stripped. |
| D2  | Moderation             | **The site admin can remove a user's photo** from the Admin users list. The user falls back to the generated avatar.                                                                                     |

## 1. Goal

A user replaces the initials circle with a photo from their phone or computer. It's stored small and safely, and shown everywhere avatars appear today.

## 2. Scope

**In scope**

- Uploading, replacing and removing **your own** avatar from My Profile.
- Storing the bytes in Postgres (`user_avatars`), served from one authenticated endpoint.
- The admin's **Remove photo** on the Admin users list. It covers an uploaded photo or a chosen Google photo.
- Docs:
  - CLAUDE.md §2, §8, §11 and §17.
  - `tables`, `frontend screens`, `use cases` UC-4 and UC-19, and `tech stack` §5 (`sharp`), all .md + .docx.
  - Amendment notes in `profile-settings.md`, `onboarding.md` and `admin-panel.md`.

**Out of scope**

- Community cover uploads, which stay generated. Uploading during onboarding: the existing Google or generated choice stays there.
- A crop or zoom UI. The image is centre-cropped to a square automatically, which is the simplest placeholder (the look is left to the redesign).
- Object storage or a CDN (Vercel Blob, S3, R2). Not needed at this size, and it would add an external service (§18).
- Automatic content moderation, and user reports.
- GIFs, animation, HEIC (the browser converts it where it can), and video.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_user_avatars`.

```prisma
model UserAvatar {
  userId    String   @id @map("user_id") @db.Uuid
  image     Bytes    // WebP, 256×256, re-encoded by the server
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_avatars")
}
```

- One row per user at most. It's deleted when the user switches to the generated avatar or to their Google photo, or when an admin removes it. A separate table keeps the bytes out of every `users` read.
- **No change to how avatars reach clients:** an uploaded photo sets `users.profile_picture_url` to `/api/users/<id>/avatar?v=<updatedAt ms>`, with `use_google_picture = false`. Every existing serializer (`toMemberUser`, `PublicUser`) and the `Avatar` component work unchanged. The `?v=` changes on every upload, so caches never show an old photo.
- **Sign-in never touches an uploaded photo.** Today `authenticateWithGoogle` refreshes or clears `profile_picture_url` (`syncPicture`). It now leaves a URL alone when it points at `/api/users/…/avatar`.

## 4. API

### `PUT /api/users/me/avatar`

- **Auth:** required, and onboarding must be finished.
- **Rate limit:** tier 3 (`outreach`, 30 an hour per user, **shared** with friend requests, invitations and community creation). Uploads are heavier than ordinary requests. Sharing the budget is accepted at this scale, and `production-hardening.md` §3.1's table lists the endpoint (Stage 3).
- **Request:** the raw image bytes, with `Content-Type` `image/webp`, `image/jpeg` or `image/png`, **at most 2 MB** (`express.raw`, mounted on this route only).
- **Behaviour:**
  1. The magic bytes must match one of the three formats, whatever the header says. Otherwise `422`.
  2. `sharp` decodes it with `limitInputPixels` 25 megapixels, and fails on a truncated or corrupt file. EXIF orientation is applied, then the image is centre-cropped to a square and resized to **256×256**, then encoded as **WebP quality 80**. Metadata isn't kept.
  3. If the output is over 100 KB, it's re-encoded at a lower quality. If it's still over, `422`.
  4. The row is upserted. `profile_picture_url` becomes the versioned URL, and `use_google_picture` becomes false.
- **Success `200`:** the refreshed session (`sessionPayload`), so the store updates like any profile save.
- **Errors:**
  - `401`.
  - `403` "Finish your profile first.".
  - `413` "That image is too large. Choose one under 2 MB.".
  - `415` for a missing or unsupported `Content-Type`.
  - `422` "That file isn't a supported image. Use a JPEG, PNG or WebP." for wrong magic bytes, a decode failure or too many pixels.
  - `429` for tier 3.
- **Logging:** `info` `{ userId, bytes }` "Avatar uploaded". Never the image.

### `DELETE /api/users/me/avatar`

- **Auth:** required. Idempotent. It deletes the row and, if the URL is an uploaded one, clears it. Returns `200` with the session.
- The existing **Use generated avatar** (`PATCH /users/me { useGooglePicture: false }`) and **Use my Google photo** paths also delete the row.

### `GET /api/users/:userId/avatar`

- **Auth:** required. Any signed-in user may see any avatar, the same as names today.
- **Success `200`:** `Content-Type: image/webp`, `Cache-Control: private, max-age=31536000, immutable` (the URL is versioned), plus `X-Content-Type-Options: nosniff`, set globally.
- **Errors:** `401`, and `404` for no upload or a malformed id. The `Avatar` component already falls back to initials when an image fails to load.

### `DELETE /api/admin/users/:userId/avatar`

- **Auth:** `requireAuth` plus `requireAppAdmin`, as on every admin route. A non-admin gets `403`, and the frontend shows not-found (§17).
- **Behaviour:** removes the user's photo, whether uploaded or a chosen Google photo. It deletes the row, sets `profile_picture_url = null` and `use_google_picture = false`. Idempotent.
- **Success `200`:** `{ user: AdminUserRow }`, the refreshed row for the list.
- **Errors:** `401`, `403`, and `404` for an unknown or malformed id.
- **Record:** `info` `{ adminId, userId }` "Admin removed a user's photo". This is **a structured log line, not a table**: the settings history (`setting_changes`) is for settings only.

## 5. Screens & components

### 5.1 My Profile — the avatar block (`profile-settings.md` §5.1, extended)

- An **Upload a photo** button sits under the avatar in every state. It opens the file picker (`accept="image/jpeg,image/png,image/webp"`, plus HEIC where the browser can convert it).
- **In the browser:** the image is read, centre-cropped to a square, drawn at 512×512 on a canvas, and exported as WebP (or JPEG where WebP export isn't supported). It's then sent with `PUT`. A file over 10 MB is refused before reading, with the message "That image is too large."
- **Busy:** "Uploading…". The other avatar actions and Save are disabled meanwhile.
- **Success:** the toast "Photo updated", and the avatar shows the new photo.
- **Errors:** the server's message, inline under the avatar.
- With an uploaded photo, the existing **Use generated avatar** removes it ("Your photo will be deleted from BookRough."). **Use my Google photo** appears once the avatar is generated again: the same two-state switch as today, so a photo is always replaced through one clear step (amended in Stage 3).
- **Offline:** Upload is disabled, under the existing banner.

### 5.2 Admin users list (`admin-panel.md` §5)

- Each row with a photo gets **Remove photo**. A confirmation sheet asks "Remove {name}'s photo? They'll see their initials instead." with Remove photo and Cancel.
- On success the row updates and the toast "Photo removed" shows. A failure shows a toast with the server's message.

## 6. Edge cases & failure modes

- **A renamed file** (an `.exe` named `.png`): the magic bytes don't match → `422`.
- **A decompression bomb** (huge dimensions in a small file): `limitInputPixels` → `422`.
- **A truncated JPEG:** `sharp` fails → `422`.
- **EXIF GPS in a phone photo:** stripped by the re-encode, and never stored.
- **A rotated phone photo:** EXIF orientation is applied before the crop.
- **A transparent PNG:** WebP keeps the alpha. The circle shows the page background behind it.
- **Uploading, then signing in again:** the uploaded photo is kept (§3).
- **Uploading, then choosing the Google photo:** the row is deleted, and the Google URL is stored as today.
- **The user deletes their account:** there's no such flow, but the cascade covers it.
- **An image request from a signed-out page** (the invite preview shows no avatars): not reachable. A `401` makes it fall back to initials anyway.
- **Two uploads racing:** the last upsert wins, and the `?v=` matches it.
- **A larger Docker image:** `sharp` adds about 10–15 MB. **After merging, read Vercel's Images Storage and Function Storage meters** (CLAUDE.md §16).

## 7. Test scenarios

**Unit (services)**

- `avatar.service` (with real `sharp` on generated fixture images, created in the test, never from external files):
  - ✅ JPEG, PNG and WebP each come out as 256×256 WebP, at most 100 KB.
  - ✅ EXIF is gone.
  - ✅ The orientation is applied.
  - ❌ Wrong magic bytes → 422.
  - ❌ A truncated file → 422.
  - ❌ Over the pixel limit → 422.
- `uploadAvatar`:
  - ✅ It upserts and sets the versioned URL and `useGooglePicture: false`.
  - ❌ Mid-onboarding → 403.
- `removeAvatar`: ✅ deletes the row and clears an uploaded URL. ✅ It's idempotent. ✅ It leaves a Google URL alone.
- `authenticateWithGoogle`: ✅ keeps an uploaded URL on sign-in.
- `updateProfile`: ✅ switching to generated or to Google deletes the row.
- `adminRemovePhoto`: ✅ clears an uploaded or a Google photo. ❌ An unknown user → 404.

**Integration (endpoints)**

- `PUT`:
  - ✅ `200` for a real PNG. Afterwards `GET /users/:id/avatar` returns `image/webp` with the immutable cache header, and the profile shows the versioned URL.
  - ❌ `413` for an image over 2 MB.
  - ❌ `415` for `text/plain`.
  - ❌ `422` for HTML sent as `image/png`.
  - ❌ `401`. ❌ `403` mid-onboarding.
- `DELETE /users/me/avatar`: ✅ `200`, then `GET` gives `404`.
- `GET /users/:id/avatar`: ❌ `401`. ❌ `404` with no photo, or a malformed id.
- Admin: ✅ `200` removes it. ❌ `403` for a non-admin. ❌ `404` for an unknown user. ❌ `401`.
- Sign-in after an upload keeps the URL.

**Component**

- My Profile:
  - ✅ Upload shows "Uploading…", then the toast and the new avatar.
  - ❌ A server `422` shows inline.
  - ❌ A file over 10 MB is refused before upload.
  - ❌ Offline disables it.
  - ✅ Use generated avatar removes the upload.
- Admin users: ✅ Remove photo, then confirm, then the row updates. ❌ A failure toasts.

**E2E:** none. The upload needs a real file chooser and canvas, which integration and component tests cover. It isn't a golden loop.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                                                                                  | Reason                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 2026-11-08 | D1, D2 (§0); `sharp` approved                                                                                                                             | Developer's choices in the spec session.                                              |
| 2026-11-08 | Bytes in Postgres, in their own table                                                                                                                     | No new service. Neon Free fits it easily, and `users` reads stay lean.                |
| 2026-11-08 | The uploaded photo is exposed through the existing `profile_picture_url`                                                                                  | Every serializer and the `Avatar` component work unchanged.                           |
| 2026-11-08 | Raw body, not multipart                                                                                                                                   | No multipart parser dependency, and one image per request.                            |
| 2026-11-08 | In development the API is another origin, so `Avatar` resolves `/api/…` photo URLs against it (`resolveApiUrl`)                                           | Found live: the relative URL hit the Vite server. Production is one origin.           |
| 2026-11-08 | `/code-review`: the avatar deletion and the user update run in one transaction, the image is decoded once, and the frontend pattern matches the backend's | Review findings.                                                                      |
| 2026-11-08 | The admin's removal is recorded as a log line, not a table                                                                                                | `setting_changes` is for settings. One moderation action doesn't justify a new table. |
