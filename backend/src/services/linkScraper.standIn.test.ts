import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { convertWithStandIn } from './linkScraper.standIn.js';

const TRACK = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';

function fixtures(content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'scraper-stand-in-')), 'fixtures.json');
  writeFileSync(path, JSON.stringify(content));
  return path;
}

const VALID = {
  delayMs: 0,
  conversions: {
    [TRACK]: {
      kind: 'TRACK',
      title: 'Stand-in Song',
      artist: 'Stand-in Band',
      coverArtUrl: null,
      links: { SPOTIFY: TRACK, APPLE_MUSIC: 'https://music.apple.com/us/song/x/1' },
    },
  },
};

describe('convertWithStandIn', () => {
  it('returns the canned conversion for a listed link', async () => {
    // Act
    const result = await convertWithStandIn(TRACK, fixtures(VALID));

    // Assert
    expect(result).toEqual({ outcome: 'converted', ...VALID.conversions[TRACK] });
  });

  it('behaves like an outage for any other link', async () => {
    // Act
    const result = await convertWithStandIn(
      'https://open.spotify.com/track/0000000000000000000000',
      fixtures(VALID),
    );

    // Assert
    expect(result).toEqual({ outcome: 'unavailable', reason: 'stand-in outage' });
  });

  it('hands a link listed under live back to the real converter (null)', async () => {
    // Act
    const result = await convertWithStandIn(TRACK, fixtures({ ...VALID, live: [TRACK] }));

    // Assert
    expect(result).toBeNull();
  });

  it('refuses a fixtures file with an unknown service', async () => {
    // Arrange
    const broken = fixtures({
      conversions: { [TRACK]: { ...VALID.conversions[TRACK], links: { AMAZON: TRACK } } },
    });

    // Act & Assert
    await expect(convertWithStandIn(TRACK, broken)).rejects.toThrow();
  });
});
