/**
 * How an uploaded photo is addressed — docs/features/avatar-upload.md §3. It
 * reaches clients through `users.profile_picture_url`, so every existing
 * serializer works unchanged; `?v=` changes with every upload, so a cache
 * never shows an old photo.
 */
const UPLOADED_PATH = /^\/api\/users\/[0-9a-f-]{36}\/avatar\?v=\d+$/;

export function uploadedAvatarUrl(userId: string, updatedAt: Date): string {
  return `/api/users/${userId}/avatar?v=${updatedAt.getTime()}`;
}

/** Whether `profile_picture_url` points at our own upload (not a Google photo). */
export function isUploadedAvatarUrl(url: string | null): boolean {
  return url !== null && UPLOADED_PATH.test(url);
}
