/**
 * The link converter — CLAUDE.md §7, docs/features/posts-feed.md §4.2.
 *
 * Drives squigly.link in headless Chromium: paste the link, press "Create
 * link", read the result page. Every squigly-specific selector lives in this
 * file, so a layout change on their side is a small, local fix.
 *
 * It never throws. squigly's explicit "could not be found" is `not_found` (the
 * caller refuses the link); anything else short of a readable result page
 * within the limits is `unavailable`, and the caller saves the post with its
 * original link only.
 */

import type { PostKind, StreamingService } from '@prisma/client';
import pLimit from 'p-limit';
import { type Browser, chromium } from 'playwright';

import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { convertWithStandIn } from './linkScraper.standIn.js';
import { cleanLine } from './textRules.js';
import { MAX_URL_LENGTH, SERVICE_HOSTS, serviceForHost } from './supportedLinks.js';

const log = createLogger('linkScraper');

// Straight to stderr, not the logger: the stand-in only runs under
// NODE_ENV=test, where the logger is silent.
if (env.E2E_SCRAPER_FIXTURES) {
  process.stderr.write('WARNING: E2E scraper stand-in is active — links are not converted.\n');
}

export type ServiceLinks = Partial<Record<StreamingService, string>>;

export type ConversionResult =
  | {
      outcome: 'converted';
      kind: PostKind;
      title: string;
      artist: string | null;
      coverArtUrl: string | null;
      links: ServiceLinks;
    }
  | { outcome: 'not_found' }
  | { outcome: 'unavailable'; reason: string };

/** Two Chromium instances at most: the deployment target is memory-constrained. */
export const MAX_CONCURRENT_CONVERSIONS = 2;
/** The whole operation, queue wait included (CLAUDE.md §7). */
export const CONVERSION_CEILING_MS = 12_000;
/** A queued attempt with less time left than this is not started (squigly takes ~2 s). */
export const MIN_ATTEMPT_MS = 2_000;
/** Each wait on squigly's page. */
export const STEP_TIMEOUT_MS = 8_000;

const SQUIGLY_URL = 'https://squigly.link/';
export const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
export const BLOCKED_RESOURCES = new Set(['image', 'stylesheet', 'font', 'media']);

// squigly.link selectors. Checked against the live site on 2026-10-04.
const INPUT_SELECTOR = 'input[placeholder="Paste a track or album link"]';
const SUBMIT_SELECTOR = 'button:has-text("Create link")';
const RESULT_PAGE_URL = /^https:\/\/squigly\.link\/(?:song|album)\//;
/** The result page's links render a moment after its metadata. */
const SERVICE_LINK_SELECTOR = Object.values(SERVICE_HOSTS)
  .flat()
  .map((host) => `a[href^="https://${host}/"]`)
  .join(', ');
/** squigly's one definitive answer; "We couldn't reach … just now" is not one. */
const NOT_FOUND_TEXT = /could not be found/i;
const SUBMIT_FALLBACK_MS = 2_000;

const limit = pLimit(MAX_CONCURRENT_CONVERSIONS);

const unavailable = (reason: string): ConversionResult => ({ outcome: 'unavailable', reason });

/** What the result page hands back — raw strings, parsed and checked in Node. */
export interface ResultPage {
  jsonLd: string[];
  ogType: string | null;
  ogTitle: string | null;
  ogImage: string | null;
  hrefs: string[];
}

interface Attempt {
  browser: Browser | null;
  abandoned: boolean;
}

/**
 * Converts a supported link. Resolves within CONVERSION_CEILING_MS of being
 * called, whether the attempt is still queued, running, or done.
 */
export async function convertLink(
  url: string,
  sourceService: StreamingService,
): Promise<ConversionResult> {
  const started = Date.now();
  const attempt: Attempt = { browser: null, abandoned: false };
  let timer: NodeJS.Timeout | undefined;

  const canned = env.E2E_SCRAPER_FIXTURES
    ? convertWithStandIn(url, env.E2E_SCRAPER_FIXTURES)
    : Promise.resolve(null);
  const run = canned.then(
    (result) =>
      result ??
      limit(() =>
        // Leaving the queue too late to finish is the same as timing out:
        // don't launch a browser only to close it a moment later.
        attempt.abandoned || Date.now() - started > CONVERSION_CEILING_MS - MIN_ATTEMPT_MS
          ? Promise.resolve(unavailable('timeout'))
          : scrape(url, attempt),
      ),
  );

  const ceiling = new Promise<ConversionResult>((resolve) => {
    timer = setTimeout(() => {
      attempt.abandoned = true;
      // Frees the queue slot: the pending page call rejects and `scrape` ends.
      void attempt.browser?.close().catch(() => undefined);
      resolve(unavailable('timeout'));
    }, CONVERSION_CEILING_MS);
  });

  const result = await Promise.race([run, ceiling]).finally(() => clearTimeout(timer));

  const durationMs = Date.now() - started;
  if (result.outcome === 'converted') {
    log.info({ outcome: result.outcome, durationMs, sourceService }, 'Link converted');
  } else if (result.outcome === 'not_found') {
    log.info({ outcome: result.outcome, durationMs, sourceService }, 'Link not found');
  } else {
    log.warn(
      { outcome: result.outcome, reason: result.reason, durationMs, sourceService },
      'Link conversion unavailable',
    );
  }
  return result;
}

async function scrape(url: string, attempt: Attempt): Promise<ConversionResult> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    attempt.browser = browser;
    if (attempt.abandoned) {
      return unavailable('timeout');
    }

    const page = await browser.newPage();
    await page.route('**/*', (route) =>
      BLOCKED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue(),
    );

    await page.goto(SQUIGLY_URL, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT_MS });
    // squigly converts by itself once a link is filled in, then either opens a
    // result page or shows a message in place. Only two answers are read:
    // a result page, and "could not be found".
    const answer = Promise.any([
      page
        .waitForURL(RESULT_PAGE_URL, { timeout: STEP_TIMEOUT_MS, waitUntil: 'commit' })
        .then(() => 'result' as const),
      page
        .getByText(NOT_FOUND_TEXT)
        .waitFor({ timeout: STEP_TIMEOUT_MS })
        .then(() => 'not_found' as const),
    ]);
    answer.catch(() => undefined); // Awaited below; never an unhandled rejection.
    await page.fill(INPUT_SELECTOR, url, { timeout: STEP_TIMEOUT_MS });
    // The button goes away once squigly starts on its own; pressing it is only
    // a fallback in case that ever stops.
    const fallback = page
      .click(SUBMIT_SELECTOR, { timeout: SUBMIT_FALLBACK_MS, noWaitAfter: true })
      .catch(() => undefined);
    await Promise.race([answer, fallback]);
    if ((await answer) === 'not_found') {
      return { outcome: 'not_found' };
    }
    await page.waitForSelector(SERVICE_LINK_SELECTOR, {
      state: 'attached',
      timeout: STEP_TIMEOUT_MS,
    });

    return parseResultPage(await page.evaluate<ResultPage>(READ_RESULT_PAGE));
  } catch (error) {
    if (attempt.abandoned) {
      return unavailable('timeout');
    }
    // Neither answer came: Promise.any rejects with an AggregateError.
    return unavailable(
      error instanceof AggregateError ? 'no answer' : (error as Error).name || 'error',
    );
  } finally {
    // Always: a leaked Chromium on a small instance is fatal within a few requests.
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

/**
 * Runs inside the page and reads raw values only; nothing is trusted here.
 * A string rather than a function: bundlers (tsx, esbuild) rewrite functions
 * with helpers that do not exist inside the page.
 */
const READ_RESULT_PAGE = `(() => {
  const meta = (property) =>
    document.querySelector('meta[property="' + property + '"]')?.getAttribute('content') ?? null;
  return {
    jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]'), (s) => s.textContent ?? ''),
    ogType: meta('og:type'),
    ogTitle: meta('og:title'),
    ogImage: meta('og:image'),
    hrefs: Array.from(document.querySelectorAll('a[href]'), (a) => a.href),
  };
})()`;

const MAX_TEXT_LENGTH = 300;

/** Cleaned, capped, and null when nothing is left. */
function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = Array.from(cleanLine(value)).slice(0, MAX_TEXT_LENGTH).join('');
  return text.length > 0 ? text : null;
}

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** The JSON-LD objects describing music, wherever they sit (arrays, @graph). */
function musicObjects(jsonLd: string[]): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (record['@type'] === 'MusicRecording' || record['@type'] === 'MusicAlbum') {
        found.push(record);
      }
      if ('@graph' in record) {
        visit(record['@graph']);
      }
    }
  };
  for (const text of jsonLd) {
    try {
      visit(JSON.parse(text));
    } catch {
      // A broken block is skipped; the og: tags are the fallback.
    }
  }
  return found;
}

function artistName(byArtist: unknown): string | null {
  const artists = Array.isArray(byArtist) ? byArtist : [byArtist];
  const names = artists
    .map((artist) =>
      artist && typeof artist === 'object'
        ? cleanText((artist as Record<string, unknown>).name)
        : null,
    )
    .filter((name): name is string => name !== null);
  return names.length > 0 ? cleanText(names.join(', ')) : null;
}

function imageUrl(image: unknown): string | null {
  const first = Array.isArray(image) ? image[0] : image;
  const candidate =
    first && typeof first === 'object' ? (first as Record<string, unknown>).url : first;
  return httpsUrl(candidate)?.toString() ?? null;
}

/**
 * Turns the raw page into a result. Scraped values are untrusted: a link is
 * kept only when it is https on one of our services' hosts, and text is cleaned
 * and capped. Exported for unit tests.
 */
export function parseResultPage(page: ResultPage): ConversionResult {
  const music = musicObjects(page.jsonLd)[0];

  const title = cleanText(music?.name) ?? cleanText(page.ogTitle);
  if (!title) {
    return unavailable('no title');
  }

  let kind: PostKind;
  if (music) {
    kind = music['@type'] === 'MusicAlbum' ? 'ALBUM' : 'TRACK';
  } else {
    kind = page.ogType === 'music.album' ? 'ALBUM' : 'TRACK';
  }

  const links: ServiceLinks = {};
  for (const href of page.hrefs) {
    const url = httpsUrl(href);
    const service = url ? serviceForHost(url.hostname) : null;
    if (url && service && !links[service]) {
      links[service] = url.toString();
    }
  }

  return {
    outcome: 'converted',
    kind,
    title,
    artist: music ? artistName(music.byArtist) : null,
    coverArtUrl: imageUrl(music?.image) ?? imageUrl(page.ogImage),
    links,
  };
}
