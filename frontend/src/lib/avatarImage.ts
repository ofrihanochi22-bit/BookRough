/**
 * The browser's half of an avatar upload — docs/features/avatar-upload.md §5.1:
 * centre-crop to a square and shrink, so the upload is small and fast. The
 * server re-encodes whatever arrives (D1), so this is about speed, not safety.
 */

/** Refused before reading, so a huge file never ties up the phone. */
export const MAX_PICKED_BYTES = 10 * 1024 * 1024;
const EDGE = 512;

export const AVATAR_COPY = {
  tooLarge: 'That image is too large.',
  unreadable: "That file isn't a supported image. Use a JPEG, PNG or WebP.",
  uploaded: 'Photo updated',
} as const;

/** Mirrors backend/src/utils/avatarUrl.ts — keep the two patterns identical. */
const UPLOADED = /^\/api\/users\/[0-9a-f-]{36}\/avatar\?v=\d+$/;

/** Whether the avatar URL is the user's own upload (not a Google photo). */
export function isUploadedAvatar(url: string | null): boolean {
  return url !== null && UPLOADED.test(url);
}

export class AvatarImageError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

/** A square, at most 512px, WebP where the browser can make one, else JPEG. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (file.size > MAX_PICKED_BYTES) {
    throw new AvatarImageError(AVATAR_COPY.tooLarge);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new AvatarImageError(AVATAR_COPY.unreadable);
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const edge = Math.min(EDGE, side);
  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new AvatarImageError(AVATAR_COPY.unreadable);
  }
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    edge,
    edge,
  );
  bitmap.close();
  // Safari may answer a WebP request with a PNG; anything not WebP goes as JPEG.
  const webp = await toBlob(canvas, 'image/webp');
  if (webp && webp.type === 'image/webp') {
    return webp;
  }
  const jpeg = await toBlob(canvas, 'image/jpeg');
  if (!jpeg) {
    throw new AvatarImageError(AVATAR_COPY.unreadable);
  }
  return jpeg;
}
