import sharp, { type OutputInfo } from 'sharp';

import { AppError } from '../utils/AppError.js';

/**
 * The one pipeline every uploaded image goes through: a user's photo
 * (docs/features/avatar-upload.md §4) and a community's photo
 * (docs/features/community-photo.md §4). One audited path, not two.
 */
export const SQUARE_IMAGE_LIMITS = {
  /** The raw upload, before anything else is read. */
  maxUploadBytes: 2 * 1024 * 1024,
  /** A decompression bomb is refused before it is decoded. */
  maxInputPixels: 25_000_000,
  size: 256,
  maxOutputBytes: 100 * 1024,
} as const;

export const SQUARE_IMAGE_MESSAGES = {
  unsupported: "That file isn't a supported image. Use a JPEG, PNG or WebP.",
  tooLarge: 'That image is too large. Choose one under 2 MB.',
} as const;

/** JPEG, PNG or WebP by their first bytes — never by a header or a file name. */
function hasImageSignature(bytes: Buffer): boolean {
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes.length > 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    bytes.length > 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  return jpeg || png || webp;
}

/**
 * The server's own re-encode (avatar-upload.md D1): orientation applied, centre-cropped to a
 * square, 256×256 WebP, no metadata. Whatever was uploaded, only these bytes
 * are ever stored, so a crafted file and its EXIF (location) never survive.
 */
export async function processSquareImage(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > SQUARE_IMAGE_LIMITS.maxUploadBytes) {
    throw new AppError(SQUARE_IMAGE_MESSAGES.tooLarge, 413);
  }
  if (!hasImageSignature(bytes)) {
    throw new AppError(SQUARE_IMAGE_MESSAGES.unsupported, 422);
  }
  // Decoded and resized once; only the small result is encoded per quality step.
  let square: { data: Buffer; info: OutputInfo };
  try {
    square = await sharp(bytes, {
      limitInputPixels: SQUARE_IMAGE_LIMITS.maxInputPixels,
      failOn: 'error',
      animated: false,
    })
      .rotate()
      .resize(SQUARE_IMAGE_LIMITS.size, SQUARE_IMAGE_LIMITS.size, {
        fit: 'cover',
        position: 'centre',
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    // Truncated, corrupt, or too many pixels: all the same to the user.
    throw new AppError(SQUARE_IMAGE_MESSAGES.unsupported, 422);
  }
  const { width, height, channels } = square.info;
  for (const quality of [80, 60, 40]) {
    const output = await sharp(square.data, { raw: { width, height, channels } })
      .webp({ quality })
      .toBuffer();
    if (output.length <= SQUARE_IMAGE_LIMITS.maxOutputBytes) {
      return output;
    }
  }
  throw new AppError(SQUARE_IMAGE_MESSAGES.unsupported, 422);
}
