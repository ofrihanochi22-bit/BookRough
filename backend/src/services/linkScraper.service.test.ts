import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BLOCKED_RESOURCES,
  CONVERSION_CEILING_MS,
  convertLink,
  LAUNCH_ARGS,
  parseResultPage,
  type ResultPage,
} from './linkScraper.service.js';

/*
 * Playwright is mocked at module level: no test here launches a browser
 * (link converter guide, "Testing This Service"). Each fake page answers the
 * calls the converter makes, and its outcome is set per test.
 */

type Answer = 'result' | 'not_found' | 'none';

interface FakeScript {
  answer: Answer;
  /** Hold `goto` until released (concurrency) or forever (ceiling). */
  gate?: Promise<void>;
  page?: ResultPage;
  launchFails?: boolean;
  linksNeverRender?: boolean;
}

const state = vi.hoisted(() => ({
  script: { answer: 'result' } as FakeScript,
  inFlight: 0,
  maxInFlight: 0,
  launches: 0,
  closes: 0,
  routeHandler: null as null | ((route: unknown) => unknown),
  launchOptions: null as unknown,
}));

class Closed extends Error {
  override name = 'TargetClosedError';
}
class Timeout extends Error {
  override name = 'TimeoutError';
}

function fakeBrowser() {
  let closed = false;
  let rejectPending: (error: Error) => void = () => undefined;
  const closedSignal = new Promise<never>((_, reject) => {
    rejectPending = reject;
  });
  closedSignal.catch(() => undefined);
  const untilClosed = <T>(promise: Promise<T>) => Promise.race([promise, closedSignal]);
  const script = state.script;

  const page = {
    route: vi.fn((_pattern: string, handler: (route: unknown) => unknown) => {
      state.routeHandler = handler;
      return Promise.resolve();
    }),
    goto: vi.fn(() => untilClosed(script.gate ?? Promise.resolve())),
    waitForURL: vi.fn(() =>
      script.answer === 'result' ? Promise.resolve() : Promise.reject(new Timeout('url')),
    ),
    getByText: vi.fn(() => ({
      waitFor: () =>
        script.answer === 'not_found' ? Promise.resolve() : Promise.reject(new Timeout('text')),
    })),
    fill: vi.fn(() => Promise.resolve()),
    click: vi.fn(() => Promise.reject(new Timeout('button gone'))),
    waitForSelector: vi.fn(() =>
      script.linksNeverRender ? Promise.reject(new Timeout('links')) : Promise.resolve(),
    ),
    evaluate: vi.fn(() => Promise.resolve(script.page ?? RESULT_PAGE)),
  };

  return {
    newPage: vi.fn(() => Promise.resolve(page)),
    close: vi.fn(() => {
      if (!closed) {
        closed = true;
        state.closes += 1;
        state.inFlight -= 1;
        rejectPending(new Closed('closed'));
      }
      return Promise.resolve();
    }),
  };
}

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn((options: unknown) => {
      state.launchOptions = options;
      state.launches += 1;
      if (state.script.launchFails) {
        return Promise.reject(new Error('no chromium'));
      }
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      return Promise.resolve(fakeBrowser());
    }),
  },
}));

const SOURCE = 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv';

const RESULT_PAGE: ResultPage = {
  jsonLd: [
    JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Squigly' }),
    JSON.stringify({
      '@type': 'MusicRecording',
      name: 'Bohemian Rhapsody - Remastered 2011',
      byArtist: { '@type': 'MusicGroup', name: 'Queen' },
      image: 'https://is1-ssl.mzstatic.com/cover.jpg',
    }),
  ],
  ogType: 'music.song',
  ogTitle: 'Bohemian Rhapsody - Remastered 2011 by Queen',
  ogImage: 'https://is1-ssl.mzstatic.com/og.jpg',
  hrefs: [
    'https://squigly.link/',
    'https://music.apple.com/us/album/bohemian-rhapsody/6781024026?i=6781024437',
    'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    'https://tidal.com/browse/track/534050211',
    'https://music.youtube.com/watch?v=BSTsnWoslP4',
    'https://www.deezer.com/track/4091937401',
    'https://music.amazon.com/albums/B0H5MWM7RB',
    'https://soundcloud.com/queen-69312/bohemian-rhapsody',
  ],
};

/** Lets queued promise callbacks run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  state.script = { answer: 'result' };
  state.inFlight = 0;
  state.maxInFlight = 0;
  state.launches = 0;
  state.closes = 0;
  state.routeHandler = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('convertLink', () => {
  it('converts a track: metadata from JSON-LD, links mapped by host', async () => {
    // Act
    const result = await convertLink(SOURCE, 'SPOTIFY');

    // Assert
    expect(result).toEqual({
      outcome: 'converted',
      kind: 'TRACK',
      title: 'Bohemian Rhapsody - Remastered 2011',
      artist: 'Queen',
      coverArtUrl: 'https://is1-ssl.mzstatic.com/cover.jpg',
      links: {
        APPLE_MUSIC: 'https://music.apple.com/us/album/bohemian-rhapsody/6781024026?i=6781024437',
        SPOTIFY: 'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
        TIDAL: 'https://tidal.com/browse/track/534050211',
        YOUTUBE: 'https://music.youtube.com/watch?v=BSTsnWoslP4',
        DEEZER: 'https://www.deezer.com/track/4091937401',
      },
    });
    expect(state.closes).toBe(1);
  });

  it('launches with the three memory flags and blocks heavy resources', async () => {
    // Act
    await convertLink(SOURCE, 'SPOTIFY');
    const route = (type: string) => ({
      request: () => ({ resourceType: () => type }),
      abort: vi.fn(),
      continue: vi.fn(),
    });
    const image = route('image');
    const script = route('script');
    state.routeHandler?.(image);
    state.routeHandler?.(script);

    // Assert
    expect(state.launchOptions).toEqual({ headless: true, args: LAUNCH_ARGS });
    expect(LAUNCH_ARGS).toEqual([
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ]);
    expect([...BLOCKED_RESOURCES].sort()).toEqual(['font', 'image', 'media', 'stylesheet']);
    expect(image.abort).toHaveBeenCalled();
    expect(script.continue).toHaveBeenCalled();
  });

  it('answers not_found for squigly\'s "could not be found", and closes the browser', async () => {
    // Arrange
    state.script = { answer: 'not_found' };

    // Act
    const result = await convertLink(SOURCE, 'SPOTIFY');

    // Assert
    expect(result).toEqual({ outcome: 'not_found' });
    expect(state.closes).toBe(1);
  });

  it('is unavailable when neither answer comes ("couldn\'t reach", a changed layout)', async () => {
    // Arrange
    state.script = { answer: 'none' };

    // Act
    const result = await convertLink(SOURCE, 'SPOTIFY');

    // Assert
    expect(result).toEqual({ outcome: 'unavailable', reason: 'no answer' });
    expect(state.closes).toBe(1);
  });

  it('is unavailable when the links never render, and closes the browser', async () => {
    // Arrange
    state.script = { answer: 'result', linksNeverRender: true };

    // Act
    const result = await convertLink(SOURCE, 'SPOTIFY');

    // Assert
    expect(result).toEqual({ outcome: 'unavailable', reason: 'TimeoutError' });
    expect(state.closes).toBe(1);
  });

  it('is unavailable when Chromium cannot launch', async () => {
    // Arrange
    state.script = { answer: 'result', launchFails: true };

    // Act
    const result = await convertLink(SOURCE, 'SPOTIFY');

    // Assert
    expect(result).toMatchObject({ outcome: 'unavailable' });
  });

  it('is unavailable when the result page has no title', async () => {
    // Arrange
    state.script = {
      answer: 'result',
      page: { jsonLd: [], ogType: null, ogTitle: null, ogImage: null, hrefs: [] },
    };

    // Act
    const result = await convertLink(SOURCE, 'SPOTIFY');

    // Assert
    expect(result).toEqual({ outcome: 'unavailable', reason: 'no title' });
    expect(state.closes).toBe(1);
  });

  it('never has more than two conversions in flight', async () => {
    // Arrange: every page waits on its own gate.
    const releases: Array<() => void> = [];
    state.script = {
      answer: 'result',
      get gate() {
        return new Promise<void>((resolve) => releases.push(resolve));
      },
    };

    // Act
    const results = Array.from({ length: 5 }, () => convertLink(SOURCE, 'SPOTIFY'));
    await flush();
    const launchedAtFirst = state.launches;
    while (releases.length > 0 || state.launches < 5) {
      releases.shift()?.();
      await flush();
    }
    const outcomes = await Promise.all(results);

    // Assert
    expect(launchedAtFirst).toBe(2);
    expect(state.maxInFlight).toBe(2);
    expect(outcomes.every((result) => result.outcome === 'converted')).toBe(true);
    expect(state.closes).toBe(5);
  });

  it('gives up at the ceiling, queue wait included, and closes what it opened', async () => {
    // Arrange: pages that never answer.
    vi.useFakeTimers();
    state.script = { answer: 'result', gate: new Promise<void>(() => undefined) };

    // Act: three at once — two run, one waits in the queue.
    const results = Array.from({ length: 3 }, () => convertLink(SOURCE, 'SPOTIFY'));
    await vi.advanceTimersByTimeAsync(0);
    const launchedBefore = state.launches;
    await vi.advanceTimersByTimeAsync(CONVERSION_CEILING_MS);
    const outcomes = await Promise.all(results);
    await vi.advanceTimersByTimeAsync(0);

    // Assert
    expect(launchedBefore).toBe(2);
    expect(outcomes).toEqual(Array(3).fill({ outcome: 'unavailable', reason: 'timeout' }));
    // The queued one was abandoned before it started: no third browser.
    expect(state.launches).toBe(2);
    expect(state.closes).toBe(2);
    expect(state.inFlight).toBe(0);
  });
});

describe('convertLink — leaving the queue', () => {
  it.each([
    [9_000, 3, 'converted'],
    [10_500, 2, 'unavailable'],
  ])(
    'when the slot frees at %ims, the queued attempt launches only with 2 s left (%i launches)',
    async (busyMs, launches, outcome) => {
      // Arrange: the first two conversions hold their slots for busyMs.
      vi.useFakeTimers();
      let calls = 0;
      state.script = {
        answer: 'result',
        get gate() {
          calls += 1;
          return calls <= 2
            ? new Promise<void>((resolve) => setTimeout(resolve, busyMs))
            : Promise.resolve();
        },
      };

      // Act
      const results = Array.from({ length: 3 }, () => convertLink(SOURCE, 'SPOTIFY'));
      await vi.advanceTimersByTimeAsync(busyMs);
      await vi.advanceTimersByTimeAsync(CONVERSION_CEILING_MS);
      const third = (await Promise.all(results))[2];

      // Assert
      expect(state.launches).toBe(launches);
      expect(third?.outcome).toBe(outcome);
    },
  );
});

describe('parseResultPage', () => {
  it('reads an album from MusicAlbum, with several artists joined', () => {
    // Act
    const result = parseResultPage({
      ...RESULT_PAGE,
      jsonLd: [
        JSON.stringify({
          '@graph': [
            {
              '@type': 'MusicAlbum',
              name: 'A Night At The Opera',
              byArtist: [{ name: 'Queen' }, { name: 'Guest' }],
              image: { url: 'https://img.example/album.jpg' },
            },
          ],
        }),
      ],
    });

    // Assert
    expect(result).toMatchObject({
      outcome: 'converted',
      kind: 'ALBUM',
      title: 'A Night At The Opera',
      artist: 'Queen, Guest',
      coverArtUrl: 'https://img.example/album.jpg',
    });
  });

  it('falls back to og: tags when the JSON-LD is missing or broken', () => {
    // Act
    const result = parseResultPage({
      ...RESULT_PAGE,
      jsonLd: ['{not json'],
      ogType: 'music.album',
    });

    // Assert
    expect(result).toMatchObject({
      outcome: 'converted',
      kind: 'ALBUM',
      title: 'Bohemian Rhapsody - Remastered 2011 by Queen',
      artist: null,
      coverArtUrl: 'https://is1-ssl.mzstatic.com/og.jpg',
    });
  });

  it('drops untrusted values: non-https links, foreign hosts, scripts, over-long text', () => {
    // Act
    const result = parseResultPage({
      jsonLd: [
        JSON.stringify({
          '@type': 'MusicRecording',
          name: `  Song\n\nTitle ${'x'.repeat(400)}`,
          image: 'javascript:alert(1)',
        }),
      ],
      ogType: null,
      ogTitle: null,
      ogImage: 'http://img.example/cover.jpg',
      hrefs: [
        'http://open.spotify.com/track/insecure',
        'javascript:alert(1)',
        'https://open.spotify.com.evil.io/track/x',
        `https://www.deezer.com/track/${'9'.repeat(2100)}`,
        'https://tidal.com/browse/track/1',
        'https://tidal.com/browse/track/2',
      ],
    });

    // Assert
    expect(result.outcome).toBe('converted');
    if (result.outcome === 'converted') {
      expect(result.title.startsWith('Song Title x')).toBe(true);
      expect(Array.from(result.title)).toHaveLength(300);
      expect(result.coverArtUrl).toBeNull();
      expect(result.artist).toBeNull();
      // The first link per service wins.
      expect(result.links).toEqual({ TIDAL: 'https://tidal.com/browse/track/1' });
    }
  });
});
