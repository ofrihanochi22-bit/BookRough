/**
 * Mock data for manual testing — docs/manual-tests/mock-data/README.md.
 *
 *   npx tsx scripts/mock-data/seed.ts             replace the mock set in the local DB
 *   npx tsx scripts/mock-data/seed.ts --remove    remove it from the local DB
 *   npx tsx scripts/mock-data/seed.ts --write-sql write out/seed.sql and out/remove.sql
 *
 * It runs only against a database on localhost. --write-sql touches no database:
 * it only writes the same statements as files (used once, for production on
 * 2026-11-22, through the Neon connector — README §1).
 *
 * Every row is marked so it can be removed: users by google_sub 'seed-mock-',
 * communities, posts, ratings and comments by a fixed '5eed000N-' UUID prefix.
 * Removing the posts, communities and users cascades to everything else.
 *
 * All values are this file's own constants, so building SQL as text is safe
 * here; app code must keep using bound parameters (eslint, backend/src).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { displayNameKey } from '../../src/services/displayName.js';
import {
  BOOKMARKS,
  COMMENTS,
  COMMUNITIES,
  type Content,
  DIRECT,
  EDITED_COMMENT_POST,
  FRIENDS,
  RATINGS,
  REAL,
  REAL_SERVICE,
  REVIEW_POOL,
  type Ref,
  type Service,
  USERS,
} from './data.js';

const here = dirname(fileURLToPath(import.meta.url));

interface Song {
  kind: 'track' | 'album';
  artist: string;
  title: string;
  cover: string;
  apple: string;
}
const SONGS = JSON.parse(readFileSync(join(here, 'songs.json'), 'utf8')) as Record<string, Song>;

// ---------- ids, literals, times ----------
//
// To keep the SQL small enough for the Neon connector, ids and times are written
// as calls to a few session-only helpers (pg_temp, dropped at the end):
//   pg_temp.r('A' | 'B' | 'm01')  a user's id      pg_temp.c('c1')  a community's id
//   pg_temp.p(12)                 a post's id      pg_temp.t(90)    now() minus 90 minutes
// Users are '5eed0001-…', communities '5eed0002-…', posts '5eed0003-…',
// ratings '5eed0004-…', comments '5eed0005-…'.

const pad = (n: number) => String(n).padStart(12, '0');
const ratingId = (n: number) => `'5eed0004-0000-4000-8000-${pad(n)}'::uuid`;
const commentId = (n: number) => `'5eed0005-0000-4000-8000-${pad(n)}'::uuid`;

const postIndex = new Map<string, number>();
const pid = (key: string) => {
  const index = postIndex.get(key);
  if (index === undefined) throw new Error(`Unknown post ${key}`);
  return `pg_temp.p(${index})`;
};
const cid = (key: string) => `pg_temp.c('${key}')`;
const ref = (who: Ref) => `pg_temp.r('${who}')`;
const ago = (hours: number) => `pg_temp.t(${Math.round(hours * 60)})`;

const lit = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
};

const HELPERS = [
  `CREATE TEMP TABLE _seed_real ON COMMIT DROP AS
  SELECT 'A' AS who, id FROM users WHERE display_name = ${lit(REAL.A)}
  UNION ALL SELECT 'B', id FROM users WHERE display_name = ${lit(REAL.B)}`,
  `DO $$ BEGIN
  IF (SELECT count(*) FROM _seed_real) <> 2 THEN
    RAISE EXCEPTION 'Both ${REAL.A} and ${REAL.B} must exist and be onboarded first';
  END IF;
END $$`,
  `CREATE FUNCTION pg_temp.r(k text) RETURNS uuid LANGUAGE sql AS $$
  SELECT CASE WHEN k IN ('A', 'B') THEN (SELECT id FROM _seed_real WHERE who = k)
    ELSE ('5eed0001-0000-4000-8000-' || lpad(substr(k, 2), 12, '0'))::uuid END $$`,
  `CREATE FUNCTION pg_temp.c(k text) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('5eed0002-0000-4000-8000-' || lpad(substr(k, 2), 12, '0'))::uuid $$`,
  `CREATE FUNCTION pg_temp.p(n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('5eed0003-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$`,
  `CREATE FUNCTION pg_temp.t(m numeric) RETURNS timestamptz LANGUAGE sql AS $$
  SELECT now() - m * interval '1 minute' $$`,
];
const DROP_HELPERS = `DROP FUNCTION pg_temp.r(text), pg_temp.c(text), pg_temp.p(int), pg_temp.t(numeric)`;

const serviceOf = (who: Ref): Service =>
  who === 'A' || who === 'B' ? REAL_SERVICE[who] : USERS.find((u) => u.key === who)!.service;

/** A deterministic PRNG, so every run builds the same data. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261122);

// ---------- posts ----------

interface PostRow {
  key: string;
  author: Ref;
  community?: string;
  recipient?: Ref;
  content: Content;
  hoursAgo: number;
  comment?: string;
  hidden?: boolean;
}

const posts: PostRow[] = [];
for (const c of COMMUNITIES) {
  for (const p of c.posts) posts.push({ ...p, community: c.key });
}
for (const d of DIRECT) {
  posts.push({
    key: d.key,
    author: d.from,
    recipient: d.to,
    content: { song: d.song },
    hoursAgo: d.hoursAgo,
    ...(d.comment === undefined ? {} : { comment: d.comment }),
    ...(d.hidden ? { hidden: true } : {}),
  });
}
posts.forEach((p, i) => postIndex.set(p.key, i + 1));
const postByKey = new Map(posts.map((p) => [p.key, p]));

/** A service's search page for the song, so every button opens something real. */
const SEARCH: Record<Exclude<Service, 'APPLE_MUSIC'>, string> = {
  SPOTIFY: 'https://open.spotify.com/search/',
  YOUTUBE: 'https://music.youtube.com/search?q=',
  TIDAL: 'https://tidal.com/search?q=',
  DEEZER: 'https://www.deezer.com/search/',
};
const SERVICES = ['SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE', 'TIDAL', 'DEEZER'] as const;
const link = (service: Service) =>
  service === 'APPLE_MUSIC' ? 's.apple' : `'${SEARCH[service]}' || s.q`;

const POST_COLUMNS =
  'id, author_id, community_id, recipient_id, recipient_hidden_at, original_url, source_service, link_platform, kind, song_title, song_artist, song_cover_art_url, universal_link_spotify, universal_link_apple, universal_link_youtube, universal_link_tidal, universal_link_deezer, conversion_pending, text_comment, comment_edited_at, created_at, updated_at';

const COVER_PREFIX = 'https://is1-ssl.mzstatic.com/image/thumb/';
const COVER_SUFFIX = '/1200x1200bb.jpg';
const APPLE_PREFIX = 'https://music.apple.com/';

/** The songs, once, in a temp table the song posts join. */
function songTable(): string[] {
  // Every cover and Apple link shares a prefix; the SQL stores the rest and
  // rebuilds the full URL, which keeps the statement small.
  const strip = (url: string, prefix: string, suffix = '') => {
    if (!url.startsWith(prefix) || !url.endsWith(suffix)) throw new Error(`Unexpected URL ${url}`);
    return url.slice(prefix.length, url.length - suffix.length);
  };
  const rows = Object.entries(SONGS).map(([key, song]) => {
    const cover = strip(song.cover, COVER_PREFIX, COVER_SUFFIX);
    const apple = strip(song.apple, APPLE_PREFIX);
    return `(${[key, song.kind, song.artist, song.title, cover, apple].map(lit).join(', ')})`;
  });
  // The search query: the characters that would break a URL path or query are
  // encoded; Hebrew and the rest the browser encodes itself.
  let q = `s.artist || ' ' || s.title`;
  for (const [from, to] of [
    ['%', '%25'],
    ['&', '%26'],
    ['#', '%23'],
    ['?', '%3F'],
    ['+', '%2B'],
    ['/', '%2F'],
    [' ', '%20'],
  ]) {
    q = `replace(${q}, '${from}', '${to}')`;
  }
  return [
    `CREATE TEMP TABLE _seed_song (k text PRIMARY KEY, kind text, artist text, title text, cover text, apple text, q text) ON COMMIT DROP`,
    `INSERT INTO _seed_song (k, kind, artist, title, cover, apple) VALUES\n  ${rows.join(',\n  ')}`,
    `UPDATE _seed_song s SET cover = '${COVER_PREFIX}' || cover || '${COVER_SUFFIX}', apple = '${APPLE_PREFIX}' || apple, q = ${q}`,
  ];
}

function postStatements(): string[] {
  const head = (p: PostRow) => [
    pid(p.key),
    ref(p.author),
    p.community ? cid(p.community) : 'NULL',
    p.recipient ? ref(p.recipient) : 'NULL',
    p.hidden ? ago(p.hoursAgo / 2) : 'NULL',
  ];
  const tail = (p: PostRow) => [
    lit(p.comment),
    p.key === EDITED_COMMENT_POST ? ago(p.hoursAgo - 1) : 'NULL',
    ago(p.hoursAgo),
    ago(p.hoursAgo),
  ];

  // Song posts: one short row per post; the song's fields come from _seed_song.
  const songRows = posts.flatMap((p) => {
    if (!('song' in p.content)) return [];
    if (!SONGS[p.content.song]) throw new Error(`Unknown song ${p.content.song}`);
    return [
      `(${[...head(p), lit(p.content.song), lit(serviceOf(p.author)), ...tail(p)].join(', ')})`,
    ];
  });
  const original = SERVICES.map((sv) => `WHEN '${sv}' THEN ${link(sv)}`).join(' ');
  const songInsert = `INSERT INTO posts (${POST_COLUMNS})
SELECT v.id, v.author, v.community, v.recipient, v.hidden,
  CASE v.src ${original} END,
  v.src::"StreamingService", NULL,
  (CASE s.kind WHEN 'album' THEN 'ALBUM' ELSE 'TRACK' END)::"PostKind",
  s.title, s.artist, s.cover,
  ${SERVICES.map(link).join(', ')},
  false, v.comment, v.edited, v.created, v.updated
FROM (VALUES
  ${songRows.join(',\n  ')}
) AS v(id, author, community, recipient, hidden, song, src, comment, edited, created, updated)
JOIN _seed_song s ON s.k = v.song`;

  // Pending and link-only posts, written out in full.
  const otherRows = posts.flatMap((p) => {
    const c = p.content;
    if ('song' in c) return [];
    let body: string[];
    if ('pending' in c) {
      // As the app saves it when the converter gives up: the original link only.
      const song = SONGS[c.pending];
      if (!song) throw new Error(`Unknown song ${c.pending}`);
      body = [
        lit(song.apple),
        `'APPLE_MUSIC'::"StreamingService"`,
        'NULL',
        ...Array<string>(9).fill('NULL'),
        'true',
      ];
    } else {
      body = [
        lit(c.url),
        'NULL',
        `'${c.link}'::"LinkPlatform"`,
        `'${c.kind}'::"PostKind"`,
        lit(c.title),
        lit(c.artist),
        lit(c.cover),
        ...Array<string>(5).fill('NULL'),
        'false',
      ];
    }
    return [`(${[...head(p), ...body, ...tail(p)].join(', ')})`];
  });
  return [songInsert, ...insert('posts', POST_COLUMNS, otherRows)];
}

// ---------- ratings ----------

interface RatingRow {
  n: number;
  post: string;
  user: Ref;
  score: number;
  review?: string;
  hoursAgo: number;
}
const ratings: RatingRow[] = [];
const rated = new Set<string>();
/** A hand-written rating lands right after the post, so its thread can follow it. */
function addRating(post: string, user: Ref, score: number, review?: string, early = false) {
  const p = postByKey.get(post)!;
  rated.add(`${post}|${user}`);
  ratings.push({
    n: ratings.length + 1,
    post,
    user,
    score,
    ...(review === undefined ? {} : { review }),
    hoursAgo: early ? p.hoursAgo * 0.95 : Math.max(0.2, p.hoursAgo * (0.3 + rand() * 0.6)),
  });
}
for (const r of RATINGS) addRating(r.post, r.user, r.score, r.review, true);
const randomScore = () =>
  Math.min(10, Math.max(1, Math.round(7 + (rand() + rand() + rand() - 1.5) * 3)));
for (const c of COMMUNITIES) {
  for (const p of c.posts) {
    if ('pending' in p.content) continue;
    for (const [member] of c.members) {
      if (member === p.author || rated.has(`${p.key}|${member}`)) continue;
      const real = member === 'A' || member === 'B';
      if (rand() < (real ? 0.25 : 0.5)) {
        const review =
          rand() < 0.4 ? REVIEW_POOL[Math.floor(rand() * REVIEW_POOL.length)] : undefined;
        addRating(p.key, member, randomScore(), review);
      }
    }
  }
}
for (const d of DIRECT) {
  if (!d.hidden && !rated.has(`${d.key}|${d.to}`) && d.to !== 'A' && d.to !== 'B' && rand() < 0.7) {
    addRating(d.key, d.to, randomScore());
  }
}
const ratingOf = (post: string, user: Ref) => {
  const r = ratings.find((x) => x.post === post && x.user === user);
  if (!r) throw new Error(`Comment hangs from a missing rating: ${post} by ${user}`);
  return r;
};

// ---------- notifications (derived, as the app would have written them) ----------

const isReal = (who: Ref): who is 'A' | 'B' => who === 'A' || who === 'B';
const READ_AFTER_HOURS = 48;
const notifications: string[] = [];
function notify(
  reader: 'A' | 'B',
  type: string,
  actor: Ref,
  hoursAgo: number,
  extra: { community?: string; post?: string; count?: number; unread?: boolean } = {},
) {
  const unread = extra.unread ?? hoursAgo < READ_AFTER_HOURS;
  // Short rows; notificationInsert() turns the keys into ids and the minutes into times.
  notifications.push(
    `(${[
      lit(reader),
      lit(type),
      lit(actor),
      lit(extra.community),
      extra.post ? String(postIndex.get(extra.post)!) : 'NULL',
      String(extra.count ?? 1),
      String(Math.round(hoursAgo * 60)),
      unread ? 'NULL' : String(Math.round(hoursAgo * 48)),
    ].join(', ')})`,
  );
}
// New posts: one unread group per reader and community for the last 3 days.
for (const c of COMMUNITIES) {
  for (const [reader] of c.members) {
    if (!isReal(reader)) continue;
    const fresh = c.posts.filter((p) => p.author !== reader && p.hoursAgo < 72);
    if (fresh.length > 0) {
      const latest = fresh.reduce((a, b) => (a.hoursAgo < b.hoursAgo ? a : b));
      notify(reader, 'COMMUNITY_POSTS', latest.author, latest.hoursAgo, {
        community: c.key,
        count: fresh.length,
        unread: true,
      });
    }
  }
}
for (const d of DIRECT) {
  if (isReal(d.to)) notify(d.to, 'RECOMMENDATION', d.from, d.hoursAgo, { post: d.key });
}
for (const r of ratings) {
  const author = postByKey.get(r.post)!.author;
  if (isReal(author) && author !== r.user)
    notify(author, 'RATING', r.user, r.hoursAgo, { post: r.post });
}
for (const [requester, addressee, status, daysAgo] of FRIENDS) {
  if (status === 'PENDING' && isReal(addressee)) {
    notify(addressee, 'FRIEND_REQUEST', requester, daysAgo * 24, { unread: true });
  }
  if (status === 'ACCEPTED' && isReal(requester) && !isReal(addressee)) {
    notify(requester, 'FRIEND_ACCEPTED', addressee, daysAgo * 24);
  }
}
for (const c of COMMUNITIES) {
  for (const inv of c.invitations ?? []) {
    if (isReal(inv.user)) {
      notify(inv.user, 'COMMUNITY_INVITATION', inv.by, inv.hoursAgo, {
        community: c.key,
        unread: true,
      });
    }
  }
  const owner = c.members[0]![0];
  for (const [member, role] of c.members) {
    if (isReal(member) && role === 'ADMIN') {
      notify(member, 'COMMUNITY_ADMIN', owner, 20 * 24, { community: c.key });
    }
  }
}
// Replies: one group per reader and post, as the app's upsert keeps it.
const replyGroups = new Map<
  string,
  { reader: 'A' | 'B'; post: string; actor: Ref; hoursAgo: number; count: number }
>();
for (const k of COMMENTS) {
  if (!k.replyTo || !isReal(k.replyTo) || k.replyTo === k.author || k.deleted) continue;
  const id = `${k.replyTo}|${k.post}`;
  const group = replyGroups.get(id);
  if (!group) {
    replyGroups.set(id, {
      reader: k.replyTo,
      post: k.post,
      actor: k.author,
      hoursAgo: k.hoursAgo,
      count: 1,
    });
  } else {
    group.count += 1;
    if (k.hoursAgo < group.hoursAgo)
      Object.assign(group, { actor: k.author, hoursAgo: k.hoursAgo });
  }
}
for (const g of replyGroups.values()) {
  notify(g.reader, 'COMMENT_REPLY', g.actor, g.hoursAgo, { post: g.post, count: g.count });
}

// ---------- SQL ----------

const insert = (table: string, columns: string, rows: string[]) =>
  rows.length === 0 ? [] : [`INSERT INTO ${table} (${columns}) VALUES\n  ${rows.join(',\n  ')}`];

export function removeStatements(): string[] {
  return [
    `DELETE FROM posts WHERE id::text LIKE '5eed0003-%'`,
    `DELETE FROM communities WHERE id::text LIKE '5eed0002-%'`,
    `DELETE FROM users WHERE google_sub LIKE 'seed-mock-%'`,
  ];
}

export function seedStatements(): string[] {
  const commentIndex = new Map(COMMENTS.map((k, i) => [k.key, i + 1]));
  return [
    ...removeStatements(),
    ...HELPERS,
    ...songTable(),
    ...insert(
      'users',
      'id, google_sub, display_name, display_name_key, preferred_service, created_at, updated_at, walkthrough_seen_at, save_tip_seen_at, list_tip_seen_at',
      USERS.map(
        (u) =>
          `(${[
            ref(u.key),
            lit(`seed-mock-${u.key.slice(1)}`),
            lit(u.name),
            lit(displayNameKey(u.name)),
            `'${u.service}'::"StreamingService"`,
            ago(u.joinedDaysAgo * 24),
            ago(u.joinedDaysAgo * 24),
            ago(u.joinedDaysAgo * 24),
            ago(u.joinedDaysAgo * 24),
            ago(u.joinedDaysAgo * 24),
          ].join(', ')})`,
      ),
    ),
    ...insert(
      'friends',
      'requester_id, addressee_id, status, created_at, updated_at',
      FRIENDS.map(
        ([from, to, status, days]) =>
          `(${ref(from)}, ${ref(to)}, '${status}'::"FriendStatus", ${ago(days * 24 + 5)}, ${ago(days * 24)})`,
      ),
    ),
    ...insert(
      'communities',
      'id, name, description, created_at, updated_at',
      COMMUNITIES.map(
        (c) =>
          `(${cid(c.key)}, ${lit(c.name)}, ${lit(c.description)}, ${ago(c.createdDaysAgo * 24)}, ${ago(c.createdDaysAgo * 24)})`,
      ),
    ),
    ...insert(
      'community_members',
      'user_id, community_id, role, joined_at, updated_at',
      COMMUNITIES.flatMap((c) =>
        c.members.map(
          ([who, role], i) =>
            `(${ref(who)}, ${cid(c.key)}, '${role}'::"CommunityRole", ${ago(c.createdDaysAgo * 24 - i * 6)}, ${ago(c.createdDaysAgo * 24 - i * 6)})`,
        ),
      ),
    ),
    ...insert(
      'community_bans',
      'community_id, user_id, banned_by_id, created_at',
      COMMUNITIES.flatMap((c) =>
        (c.bans ?? []).map((b) => `(${cid(c.key)}, ${ref(b.user)}, ${ref(b.by)}, ${ago(5 * 24)})`),
      ),
    ),
    ...insert(
      'community_invitations',
      'community_id, user_id, invited_by_id, created_at',
      COMMUNITIES.flatMap((c) =>
        (c.invitations ?? []).map(
          (inv) => `(${cid(c.key)}, ${ref(inv.user)}, ${ref(inv.by)}, ${ago(inv.hoursAgo)})`,
        ),
      ),
    ),
    ...postStatements(),
    `INSERT INTO ratings (id, post_id, user_id, score, comment, created_at, updated_at)
SELECT ('5eed0004-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid, pg_temp.p(v.post),
  pg_temp.r(v.who), v.score, v.review, pg_temp.t(v.m), pg_temp.t(v.m)
FROM (VALUES
  ${ratings
    .map(
      (r) =>
        `(${r.n}, ${postIndex.get(r.post)!}, ${lit(r.user)}, ${r.score}, ${lit(r.review)}, ${Math.round(r.hoursAgo * 60)})`,
    )
    .join(',\n  ')}
) AS v(n, post, who, score, review, m)`,
    ...insert(
      'comments',
      'id, post_id, author_id, rating_id, parent_id, reply_to_id, body, created_at, deleted_at',
      COMMENTS.map((k, i) => {
        const rating = k.onRating ? ratingId(ratingOf(k.post, k.onRating).n) : 'NULL';
        const parent = k.parent ? commentId(commentIndex.get(k.parent)!) : 'NULL';
        return `(${[
          commentId(i + 1),
          pid(k.post),
          ref(k.author),
          rating,
          parent,
          k.replyTo ? ref(k.replyTo) : 'NULL',
          lit(k.deleted ? null : k.body),
          ago(k.hoursAgo),
          k.deleted ? ago(k.hoursAgo - 0.5) : 'NULL',
        ].join(', ')})`;
      }),
    ),
    ...insert(
      'bookmarks',
      'user_id, post_id, created_at',
      BOOKMARKS.map(
        ([who, post]) => `(${ref(who)}, ${pid(post)}, ${ago(postByKey.get(post)!.hoursAgo / 2)})`,
      ),
    ),
    `INSERT INTO notifications (user_id, type, actor_id, community_id, post_id, count, created_at, updated_at, read_at)
SELECT pg_temp.r(v.reader), v.type::"NotificationType", pg_temp.r(v.actor), pg_temp.c(v.community),
  pg_temp.p(v.post), v.count, pg_temp.t(v.m), pg_temp.t(v.m), pg_temp.t(v.read_m)
FROM (VALUES
  ${notifications.join(',\n  ')}
) AS v(reader, type, actor, community, post, count, m, read_m)`,
    DROP_HELPERS,
  ];
}

// ---------- run ----------

function assertLocal(url: string | undefined) {
  let host = '';
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    // fall through to the refusal below
  }
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error('Refusing to run: DATABASE_URL is not a localhost database (README §1).');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--write-sql')) {
    const out = join(here, 'out');
    mkdirSync(out, { recursive: true });
    const file = (statements: string[]) => `BEGIN;\n\n${statements.join(';\n\n')};\n\nCOMMIT;\n`;
    writeFileSync(join(out, 'seed.sql'), file(seedStatements()));
    writeFileSync(join(out, 'remove.sql'), file(removeStatements()));
    process.stdout.write(`Wrote ${out}/seed.sql and remove.sql\n`);
    return;
  }

  const { config } = await import('dotenv');
  config({ path: join(here, '../../.env') });
  assertLocal(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    const statements = args.includes('--remove') ? removeStatements() : seedStatements();
    const results = await prisma.$transaction(
      statements.map((sql) => prisma.$executeRawUnsafe(sql)),
    );
    statements.forEach((sql, i) => {
      process.stdout.write(
        `${String(results[i]).padStart(4)}  ${sql.split('\n')[0]!.slice(0, 70)}\n`,
      );
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
