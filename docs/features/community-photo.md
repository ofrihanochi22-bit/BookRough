# Feature: A photo for a community

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------- |
| **Use cases** | UC-9 (create a community, and edit its details) and UC-19 (administration), amended             |
| **Phase**     | 6 — Step 6.1z11 of `DEVELOPMENT.md`, from parked idea **D5** of the 2026-11-22 manual test (§0) |
| **Branch**    | `feat/community-photo`                                                                          |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☑ Merged                              |

---

## 0. Where this comes from

Parked idea **D5** of the 2026-11-22 manual test, one of four ideas the developer set aside that day (D1 shipped as Step 6.1z9): a community's admins can give it a photo instead of the generated cassette.

**This reverses a recorded decision.** These are updated in this PR:

- CLAUDE.md §2 ("Explicitly rejected alternatives": "Uploads beyond the user's own photo. Community covers stay generated") and §8 ("One upload: the user's own photo"). From **2026-11-22** there are **two uploads**: a user's own photo, and a community's photo. Both go through the same pipeline: shrunk in the browser, re-encoded server-side with `sharp` to a 256×256 WebP without metadata, and stored in Postgres. There is still no storage bucket and no CDN.
- CLAUDE.md §17: the site admin's writes on communities grow by one, **Remove photo**, next to Delete.
- `docs/features/communities-create.md` §3 dropped `cover_image_url` and said "A later upload feature re-adds it". This is that feature, done as a separate table (§3).

No new dependency: `sharp` is already in the stack (avatar-upload.md).

Decided in this spec session, 2026-11-22:

| #   | Question                       | Decision                                                                                                                                                                              |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Who uploads, replaces, removes | **Every admin of the community, the owner included.** The same check as editing the name and description (`requireAdmin`).                                                            |
| D2  | Moderation by the site admin   | **Yes:** Remove photo on the Admin → Communities list, behind an "Are you sure?" sheet, recorded as a log line. Same as D2 in avatar-upload.md.                                       |
| D3  | Who may load the photo         | **Any signed-in user**, the same rule as `GET /users/:id/avatar`. A signed-out invite preview shows the generated cover. The community id, a UUID, reaches only members and invitees. |
| D4  | Where it's uploaded            | **Community Settings, and optionally on the Create Community form.**                                                                                                                  |

Not asked, and fixed here as the simplest placeholder (look-and-feel is deferred): removing a photo always falls back to the generated cassette. The photo takes the reel window's place on the cassette (§5.1).

## 1. Goal

A community's admin picks a photo from their phone or computer, on Create Community or later in Settings. Everywhere the community's cassette appears (Home, the feed banner, invitations, the share sheet, the invite preview for a signed-in viewer), the photo shows in it. Any admin can remove it, and so can the site admin. The cassette is then back to its generated look.

## 2. Scope

**In scope**

- A new table `community_photos`, and a column `communities.photo_updated_at` (§3).
- `PUT`, `DELETE` and `GET /api/communities/:id/photo`, and `DELETE /api/admin/communities/:id/photo` (§4).
- `photoUrl` on every community shape that reaches a client: `PublicCommunity`, the invitation and invite-preview community, the share-sheet list, and `AdminCommunity`.
- The image pipeline from avatar-upload.md, shared rather than copied: the server's `processAvatar` becomes `processSquareImage`, and the browser's `avatarImage.ts` is reused as is.
- Screens: `CommunityCover` (the photo variant), Community Settings (Photo section), Create Community (optional photo), Admin → Communities (Remove photo).
- Docs:
  - CLAUDE.md §2, §6 (eighteen tables, and a `community_photos` line), §8 and §17.
  - `tables`, `frontend screens` and `use cases` (UC-9, UC-19), each .md + .docx.
  - Amendment notes in `communities-create.md`, `communities-membership.md`, `admin-panel.md` and `avatar-upload.md`.
  - `production-hardening.md` §3.1's rate-limit table.

**Out of scope**

- A crop or zoom UI. The image is centre-cropped to a square automatically (as for user photos).
- A wide banner image. The photo is square at 256×256, and the banner shows it at the cassette's window size.
- Public access to the photo for signed-out visitors (D3).
- Notifying members that the photo changed.
- A history of photo changes. `setting_changes` is for the app's settings only, and admin actions on communities are log lines (as with Delete).
- GIFs, animation, HEIC (the browser converts it where it can), and video.
- Object storage or a CDN.

## 3. Data model changes

Migration: `npx prisma migrate dev --name add_community_photos`.

```prisma
/// A community's uploaded photo — docs/features/community-photo.md §3. Only
/// the server's 256×256 WebP re-encode, never the uploaded bytes.
model CommunityPhoto {
  communityId String    @id @map("community_id") @db.Uuid
  image       Bytes
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)
  community   Community @relation(fields: [communityId], references: [id], onDelete: Cascade)

  @@map("community_photos")
}

model Community {
  // …
  /// Set with the community_photos row, in one transaction; null = generated cover.
  photoUpdatedAt DateTime? @map("photo_updated_at") @db.Timestamptz(3)
  photo          CommunityPhoto?
}
```

- **One row per community at most**, in its own table, so the bytes stay out of every `communities` read (as with `user_avatars`).
- **`photo_updated_at` on `communities`** is what clients see: every serializer builds `photoUrl = /api/communities/<id>/photo?v=<photo_updated_at ms>`, or `null`. Every community query already loads the `Community` row, so no serializer needs a join. The `?v=` changes with every upload, so a cache never shows an old photo. The same idea as `users.profile_picture_url`, but stored as a timestamp rather than a URL, because a community has no outside URL to hold.
- The two are always written together in one transaction (upload: upsert the row, then set the timestamp from the row's `updatedAt`; removal: delete the row, then set it to null). No CHECK can tie a column to another table's row, so the transaction is the guard. The services are the only writers.
- Deleting a community (owner or site admin) cascades to the photo.

## 4. API

The CLAUDE.md §4 envelope throughout. An unknown or malformed community id, and a community the caller isn't a member of, are all the same `404` "Community not found." (`requireMember`), as on every community route. The exception is `GET`, which any signed-in user may call (D3).

### `PUT /api/communities/:id/photo`

- **Auth:** required, and the caller is an admin or the owner of the community (D1).
- **Rate limit:** tier 3 (`outreach`, 30 an hour per user, shared with community creation, friend requests, invitations and the user's own photo upload). Creating a community with a photo spends two.
- **Request:** the raw image bytes, with `Content-Type` `image/webp`, `image/jpeg` or `image/png`, at most 2 MB. This is the same `express.raw` parser as the avatar route, mounted on this route only.
- **Behaviour:** `processSquareImage` (the avatar pipeline unchanged: magic bytes, `limitInputPixels` 25 MP, `failOn: 'error'`, EXIF orientation, centre crop, 256×256 WebP at quality 80, 60, then 40 under 100 KB, no metadata). Then the row is upserted and `photo_updated_at` set, in one transaction.
- **Success `200`:** `{ community: PublicCommunity }`, the refreshed community, with its new `photoUrl`.
- **Errors:**
  - `401`.
  - `403` "Only admins can change the photo." for a member who isn't an admin.
  - `404` "Community not found.".
  - `413` "That image is too large. Choose one under 2 MB.".
  - `415` for a missing or unsupported `Content-Type`.
  - `422` "That file isn't a supported image. Use a JPEG, PNG or WebP.".
  - `429` for tier 3.
- **Logging:** `info` `{ userId, communityId, bytes }` "Community photo uploaded". Never the image.

### `DELETE /api/communities/:id/photo`

- **Auth:** required, admin or owner (D1). Idempotent: with no photo it still answers `200`.
- **Success `200`:** `{ community: PublicCommunity }` with `photoUrl: null`.
- **Errors:** `401`, `403` (same message), `404`.
- **Logging:** `info` `{ userId, communityId }` "Community photo removed", only when there was one.

### `GET /api/communities/:id/photo`

- **Auth:** required. Any signed-in user, member or not (D3).
- **Success `200`:** `Content-Type: image/webp`, `Cache-Control: private, max-age=31536000, immutable`, plus `nosniff`, set globally.
- **Errors:** `401`. `404` "No photo." for no photo, an unknown community, or a malformed id. The cover falls back to the generated look when an image fails to load.

### `DELETE /api/admin/communities/:communityId/photo`

- **Auth:** `requireAuth` plus `requireAppAdmin`. A non-admin gets `403`, and the frontend shows not-found (§17).
- **Behaviour:** deletes the row and sets `photo_updated_at` to null, in one transaction. Idempotent.
- **Success `200`:** `{ community: AdminCommunity }`, the refreshed row for the list.
- **Errors:** `401`, `403`, and `404` "Community not found." for an unknown or malformed id.
- **Record:** `info` `{ adminId, communityId }` "Admin removed a community's photo", a log line, as with Delete.

### Shapes

- `PublicCommunity` gains `photoUrl: string | null`. So do the invitation's community (`invite-friends.md` §4), the invite preview's community (`communities-invites.md` §4) and `AdminCommunity`. Each is set field by field in its mapper, from `photo_updated_at`.
- The invite preview's `photoUrl` is sent to signed-out visitors too. It's only a path, and `GET` answers them `401`, so they see the generated cover (D3).

## 5. Screens & components

### 5.1 `CommunityCover`

- A new optional prop `photoUrl`. When it's set, the image (`resolveApiUrl`, as `Avatar` does) takes the reel window's place:
  - in `card` and `banner`, a rounded square of the window's width;
  - in `thumb`, the whole thumb below the stripe band.
- The stripe band and the name stay, so the cassette is still recognisable. This is the simplest placeholder; the look is left to a later design pass.
- `alt=""`: the cover is decorative, and the name is printed beside it or on it.
- If the image fails to load (`onError`, including a signed-out `401`), the cover falls back to the reel window.
- Every caller passes `photoUrl` where it has it: Home, the feed banner, Friends → Invitations, the share sheet, the invite preview, the Community Settings header and Admin → Communities.

### 5.2 Community Settings — a Photo section (admins only)

- It sits above the name and description. The current cover is shown at `card` size, with **Upload a photo** (or **Replace photo**), and **Remove photo** when there is one.
- Upload uses the same file picker and browser step as My Profile (`avatarImage.ts`): files over 10 MB are refused before reading, with "That image is too large."; then centre crop, 512×512, WebP or JPEG.
- **Busy:** "Uploading…", with the section's buttons disabled.
- **Success:** the toast "Photo updated", and the cover shows it.
- **Remove:** a confirmation sheet, "Remove the community's photo? Everyone will see the generated cover again.", with Remove photo and Cancel. Then the toast "Photo removed".
- **Errors:** the server's message, inline under the cover.
- **Offline:** the buttons are disabled under the existing offline banner.
- A member who isn't an admin sees no Photo section, as with the name and description fields today.

### 5.3 Create Community — an optional photo

- Below the name and description: **Add a photo (optional)**. Picking one runs the browser step at once, and a preview replaces the neutral cover preview. **Remove** clears it. A file over 10 MB, or one the browser can't read, shows its message inline, and Create stays available.
- **Create** sends `POST /communities`, then, if a photo was chosen, `PUT /communities/:id/photo`. The button reads "Creating…" through both.
- **If the photo upload fails, the community still exists.** The user lands on the new community as usual, with the toast "Community created, but the photo couldn't be uploaded. Try again in Settings." No draft is lost, and the community isn't rolled back.

### 5.4 Admin → Communities

- Each row shows the cover thumb, with the photo when there is one. A row with a photo gets **Remove photo** next to Delete, with the sheet "Remove {name}'s photo? Its members will see the generated cover instead." and Remove photo and Cancel.
- On success the row updates and the toast "Photo removed" shows. A failure shows the server's message in a toast.

## 6. Edge cases & failure modes

- **The pipeline's own cases** (a renamed file, a decompression bomb, a truncated JPEG, EXIF GPS, a rotated phone photo, a transparent PNG) behave as in avatar-upload.md §6, because it's the same function.
- **An admin is demoted while uploading:** the role is checked when the request arrives, so the upload either completes or answers `403`.
- **Two admins upload at once:** the last upsert wins, and `photo_updated_at` matches it, because the timestamp is taken from the row inside the same transaction.
- **A removed or banned member:** they're no longer a member, so `PUT` and `DELETE` answer `404`. They can still `GET` the photo while signed in (D3), the same as any other user.
- **The community is deleted:** the photo cascades. Old URLs answer `404`, and the cover falls back.
- **Create with a photo, but over the tier-3 limit on the second request:** the community exists, and the `429` shows as the "Try again in Settings" toast.
- **Signed-out invite preview:** `GET` gives `401`, and the generated cover shows (D3).
- **Neon storage:** at most 100 KB per community, and fewer than 100 communities, so under 10 MB in the worst case.

## 7. Test scenarios

**Unit (services)**

- `processSquareImage`: avatar.service's existing tests keep passing under the new name (JPEG, PNG and WebP come out as 256×256 WebP; EXIF gone; orientation applied; wrong magic bytes, a truncated file, too many pixels → 422; over 2 MB → 413).
- `uploadCommunityPhoto`:
  - ✅ An admin's upload upserts the row and sets `photo_updated_at` from it. The returned community's `photoUrl` carries `?v=`.
  - ✅ The owner can upload.
  - ❌ A plain member → 403.
  - ❌ A non-member or an unknown community → 404.
  - ❌ A bad image → 422, and nothing is written.
- `removeCommunityPhoto`: ✅ It deletes the row and clears the timestamp. ✅ It's idempotent with no photo. ❌ A member → 403. ❌ A non-member → 404.
- `findCommunityPhoto`: ✅ returns the bytes. ✅ Returns null with none.
- `adminRemoveCommunityPhoto`: ✅ clears it and returns the admin row. ✅ It's idempotent. ❌ An unknown community → 404.
- Mappers: `toPublicCommunity`, `toAdminCommunity`, and the invitation and invite-preview mappers each give `photoUrl` from `photo_updated_at`, and `null` without one.

**Integration (endpoints)**

- `PUT /communities/:id/photo`:
  - ✅ `200` for a real PNG by an admin. Afterwards `GET` returns `image/webp` with the immutable cache header, and `GET /communities/:id` shows the same `photoUrl`.
  - ❌ `413` for over 2 MB.
  - ❌ `415` for `text/plain`.
  - ❌ `422` for HTML sent as `image/png`.
  - ❌ `401`. ❌ `403` for a member. ❌ `404` for a non-member, and for a malformed id.
- `DELETE /communities/:id/photo`: ✅ `200`, then `GET` gives `404`. ❌ `403` for a member. ❌ `401`.
- `GET /communities/:id/photo`: ✅ `200` for a signed-in non-member. ❌ `401`. ❌ `404` with no photo, and for a malformed id.
- `GET /communities` (Home) and the invitations list carry `photoUrl`.
- Admin: ✅ `200` removes it. ❌ `403` for a non-admin. ❌ `404` for an unknown community. ❌ `401`.
- Deleting the community removes the photo row (cascade).

**Component**

- `CommunityCover`: ✅ It shows the image in place of the reels when `photoUrl` is set. ✅ It falls back to the reels on an image error.
- Community Settings:
  - ✅ Upload shows "Uploading…", then the toast and the new cover.
  - ❌ A server `422` shows inline.
  - ❌ A file over 10 MB is refused before upload.
  - ✅ Remove, then confirm, gives the toast.
  - ❌ Offline disables the buttons.
  - ✅ A plain member sees no Photo section.
- Create Community:
  - ✅ A chosen photo previews, and Create sends both requests.
  - ❌ A failed photo upload still navigates to the community, with the "Try again in Settings" toast.
  - ✅ Create without a photo sends one request.
- Admin → Communities: ✅ Remove photo, then confirm, updates the row. ❌ A failure toasts.

**E2E:** none. The file chooser and canvas are covered by integration and component tests, and this isn't a golden loop.

## 8. Open questions

None.

## 9. Decisions log

| Date       | Decision                                                                                               | Reason                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 2026-11-22 | D1–D4 (§0). Reverses "community covers stay generated" (CLAUDE.md §2, §8)                              | Developer's choices in the spec session.                                                                 |
| 2026-11-22 | Built while D2 (archive rated recommendations) is still open on its own branch                         | Developer's explicit exception to CLAUDE.md §15's "one feature at a time".                               |
| 2026-11-22 | The bytes go in their own table; clients see a versioned URL built from `communities.photo_updated_at` | Keeps `communities` reads lean, needs no join in any serializer, and makes the cache-busting `?v=` free. |
| 2026-11-22 | The image pipeline is shared with user photos (`processSquareImage`, `avatarImage.ts`)                 | One audited path for uploaded bytes, not two.                                                            |
| 2026-11-22 | Create Community uploads after creating; a failed upload doesn't roll the community back               | The user's community and its invite link matter more than the photo, which can be retried in Settings.   |
