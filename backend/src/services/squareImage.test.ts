import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { processSquareImage, SQUARE_IMAGE_MESSAGES } from './squareImage.js';

/**
 * Unit tests — docs/features/avatar-upload.md §7, shared with
 * docs/features/community-photo.md §7. `sharp` is real: every input image is
 * generated here, never read from a file.
 */

function image(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#2a6' } });
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, message?: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, ...(message ? { message } : {}) });
}

describe('processSquareImage', () => {
  it.each([
    ['JPEG', () => image(1200, 800).jpeg().toBuffer()],
    ['PNG', () => image(800, 1200).png().toBuffer()],
    ['WebP', () => image(600, 600).webp().toBuffer()],
  ])('turns a %s into a 256×256 WebP of at most 100 KB', async (_name, make) => {
    // Arrange
    const input = await make();

    // Act
    const output = await processSquareImage(input);

    // Assert
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
    expect(output.length).toBeLessThanOrEqual(100 * 1024);
  });

  it('strips EXIF (location included) from the stored image', async () => {
    // Arrange
    const input = await image(400, 400)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: 'gps-test' } } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    // Act
    const output = await processSquareImage(input);

    // Assert
    const meta = await sharp(output).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it('applies the EXIF orientation before cropping', async () => {
    // Arrange: a 400×200 image tagged "rotate 90°" is portrait once applied.
    const input = await image(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    // Act
    const output = await processSquareImage(input);

    // Assert — still square; the rotation was applied, not left as a tag.
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ width: 256, height: 256 });
    expect(meta.orientation).toBeUndefined();
  });

  it('refuses a file whose first bytes are not an image, whatever its name', async () => {
    // Act & Assert
    await expectAppError(
      processSquareImage(Buffer.from('<html><script>alert(1)</script></html>')),
      422,
      SQUARE_IMAGE_MESSAGES.unsupported,
    );
  });

  it('refuses a truncated image', async () => {
    // Arrange
    const whole = await image(400, 400).jpeg().toBuffer();

    // Act & Assert
    await expectAppError(
      processSquareImage(whole.subarray(0, 200)),
      422,
      SQUARE_IMAGE_MESSAGES.unsupported,
    );
  });

  it('refuses an image over the pixel limit before decoding it', async () => {
    // Arrange: 6000 × 5000 = 30 megapixels, over the 25 MP limit.
    const huge = await image(6000, 5000).png({ compressionLevel: 9 }).toBuffer();

    // Act & Assert
    await expectAppError(processSquareImage(huge), 422, SQUARE_IMAGE_MESSAGES.unsupported);
  });

  it('refuses more than 2 MB with 413', async () => {
    // Arrange
    const tooBig = Buffer.alloc(2 * 1024 * 1024 + 1);

    // Act & Assert
    await expectAppError(processSquareImage(tooBig), 413, SQUARE_IMAGE_MESSAGES.tooLarge);
  });
});
