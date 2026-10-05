import { describe, expect, it } from 'vitest';

import { makePendingPost, makePost } from '../test/fixtures';
import { allLinks, mainLink, relativeTime } from './postLinks';

describe('mainLink', () => {
  it("opens the viewer's own service when a link was found for it", () => {
    // Act & Assert
    expect(mainLink(makePost(), 'APPLE_MUSIC')).toEqual({
      service: 'APPLE_MUSIC',
      url: 'https://music.apple.com/us/album/x/1?i=2',
      label: 'Apple Music',
    });
  });

  it("falls back to the pasted link when the viewer's service has none", () => {
    // Act & Assert
    expect(mainLink(makePost(), 'TIDAL')).toEqual({
      service: 'SPOTIFY',
      url: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
      label: 'Spotify',
    });
  });

  it('falls back for a pending post and for a viewer with no service', () => {
    // Act & Assert
    expect(mainLink(makePendingPost(), 'APPLE_MUSIC').label).toBe('Spotify');
    expect(mainLink(makePost(), null).label).toBe('Spotify');
  });
});

describe('allLinks', () => {
  it('lists found links in the picker order', () => {
    // Act & Assert
    expect(allLinks(makePost()).map((link) => link.label)).toEqual([
      'Spotify',
      'Apple Music',
      'Deezer',
    ]);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-04T12:00:00.000Z');

  it.each([
    ['2026-10-04T11:59:30.000Z', 'now'],
    ['2026-10-04T12:00:30.000Z', 'now'],
    ['2026-10-04T11:55:00.000Z', '5m'],
    ['2026-10-04T09:00:00.000Z', '3h'],
    ['2026-10-02T12:00:00.000Z', '2d'],
    ['2026-09-20T12:00:00.000Z', 'Sep 20'],
  ])('%s → %s', (iso, expected) => {
    // Act & Assert
    expect(relativeTime(iso, now)).toBe(expected);
  });
});
