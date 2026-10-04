/**
 * E2E only (docs/features/posts-feed.md §4.2): canned conversions read from a
 * JSON file instead of driving squigly.link, so the E2E suite is fast and
 * deterministic. A link the file does not list behaves like an outage. The env
 * schema refuses to start the API with this set unless NODE_ENV=test.
 */

import { readFileSync } from 'node:fs';

import { z } from 'zod';

import type { StreamingService } from '@prisma/client';
import type { ConversionResult, ServiceLinks } from './linkScraper.service.js';

const serviceLinks = z
  .object({
    SPOTIFY: z.string().url(),
    APPLE_MUSIC: z.string().url(),
    YOUTUBE: z.string().url(),
    TIDAL: z.string().url(),
    DEEZER: z.string().url(),
  })
  .partial()
  .strict();

const fixturesSchema = z
  .object({
    /** Long enough for the "Finding this track…" state to be seen. */
    delayMs: z.number().int().min(0).max(5000).default(0),
    conversions: z.record(
      z
        .object({
          kind: z.enum(['TRACK', 'ALBUM']),
          title: z.string().min(1),
          artist: z.string().nullable(),
          coverArtUrl: z.string().url().nullable(),
          links: serviceLinks,
        })
        .strict(),
    ),
  })
  .strict();

type Fixtures = z.infer<typeof fixturesSchema>;

let cached: { path: string; fixtures: Fixtures } | null = null;

function load(path: string): Fixtures {
  if (cached?.path !== path) {
    cached = { path, fixtures: fixturesSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) };
  }
  return cached.fixtures;
}

export async function convertWithStandIn(url: string, path: string): Promise<ConversionResult> {
  const fixtures = load(path);
  await new Promise((resolve) => setTimeout(resolve, fixtures.delayMs));
  const conversion = fixtures.conversions[url];
  if (!conversion) {
    return { outcome: 'unavailable', reason: 'stand-in outage' };
  }
  const links: ServiceLinks = {};
  for (const [service, link] of Object.entries(conversion.links)) {
    if (link) {
      links[service as StreamingService] = link;
    }
  }
  return { outcome: 'converted', ...conversion, links };
}
