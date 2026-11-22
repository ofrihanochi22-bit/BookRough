/**
 * The mock data set for manual testing (docs/manual-tests/mock-data/README.md).
 * Plain constants; seed.ts turns them into SQL. "A" and "B" are the two real
 * test accounts, found by display name when the seed runs.
 */

export type Service = 'SPOTIFY' | 'APPLE_MUSIC' | 'YOUTUBE' | 'TIDAL' | 'DEEZER';
/** "A", "B", or a mock user's key. */
export type Ref = string;

export const REAL = { A: 'OfriChrome', B: 'OfriEdge' } as const;
export const REAL_SERVICE: Record<'A' | 'B', Service> = { A: 'SPOTIFY', B: 'APPLE_MUSIC' };

export interface MockUser {
  key: string;
  name: string;
  service: Service;
  joinedDaysAgo: number;
}

export const USERS: MockUser[] = [
  { key: 'm01', name: 'Maya Levi', service: 'SPOTIFY', joinedDaysAgo: 58 },
  { key: 'm02', name: 'Noam Cohen', service: 'TIDAL', joinedDaysAgo: 55 },
  { key: 'm03', name: 'דנה שגיא', service: 'YOUTUBE', joinedDaysAgo: 52 },
  { key: 'm04', name: 'Yoni Mizrahi', service: 'DEEZER', joinedDaysAgo: 50 },
  { key: 'm05', name: 'Tamar Ben-David', service: 'APPLE_MUSIC', joinedDaysAgo: 47 },
  { key: 'm06', name: 'Lior Avraham', service: 'TIDAL', joinedDaysAgo: 45 },
  { key: 'm07', name: 'Itay Shapira', service: 'SPOTIFY', joinedDaysAgo: 44 },
  { key: 'm08', name: 'Shira Katz', service: 'APPLE_MUSIC', joinedDaysAgo: 41 },
  { key: 'm09', name: 'עומר פרץ', service: 'SPOTIFY', joinedDaysAgo: 39 },
  { key: 'm10', name: 'Gal Friedman', service: 'SPOTIFY', joinedDaysAgo: 20 },
  { key: 'm11', name: 'Roni Peled', service: 'DEEZER', joinedDaysAgo: 18 },
  { key: 'm12', name: 'Avi Goldberg', service: 'YOUTUBE', joinedDaysAgo: 33 },
  { key: 'm13', name: 'Neta Rosen', service: 'APPLE_MUSIC', joinedDaysAgo: 30 },
  { key: 'm14', name: 'Eden Biton', service: 'SPOTIFY', joinedDaysAgo: 12 },
];

/** [requester, addressee, status, daysAgo] */
export const FRIENDS: [Ref, Ref, 'ACCEPTED' | 'PENDING', number][] = [
  ['m01', 'A', 'ACCEPTED', 40],
  ['A', 'm02', 'ACCEPTED', 38],
  ['m03', 'A', 'ACCEPTED', 35],
  ['A', 'm04', 'ACCEPTED', 30],
  ['m05', 'A', 'ACCEPTED', 25],
  ['A', 'm06', 'ACCEPTED', 3],
  ['B', 'm01', 'ACCEPTED', 37],
  ['m02', 'B', 'ACCEPTED', 33],
  ['B', 'm06', 'ACCEPTED', 29],
  ['m07', 'B', 'ACCEPTED', 27],
  ['m08', 'B', 'ACCEPTED', 21],
  ['B', 'm09', 'ACCEPTED', 2],
  ['m10', 'A', 'PENDING', 1],
  ['A', 'm11', 'PENDING', 2],
  ['m11', 'B', 'PENDING', 0.5],
  // Mock users among themselves, so their profiles look lived-in.
  ['m01', 'm02', 'ACCEPTED', 50],
  ['m01', 'm05', 'ACCEPTED', 45],
  ['m02', 'm04', 'ACCEPTED', 44],
  ['m07', 'm08', 'ACCEPTED', 40],
  ['m09', 'm07', 'ACCEPTED', 35],
  ['m12', 'm13', 'ACCEPTED', 30],
  ['m12', 'm14', 'ACCEPTED', 10],
  ['m06', 'm08', 'ACCEPTED', 20],
];

/** A song from songs.json, or a link-only post. */
export type Content =
  | { song: string }
  | { pending: string }
  | {
      link: 'BANDCAMP' | 'SOUNDCLOUD' | 'YOUTUBE';
      kind: 'TRACK' | 'ALBUM' | 'VIDEO';
      url: string;
      title: string;
      artist: string;
      cover: string;
    };

export interface CommunityPost {
  key: string;
  author: Ref;
  content: Content;
  hoursAgo: number;
  comment?: string;
  editedComment?: boolean;
}

export interface MockCommunity {
  key: string;
  name: string;
  description: string;
  createdDaysAgo: number;
  /** [member, role]; the first is the OWNER. */
  members: [Ref, 'OWNER' | 'ADMIN' | 'MEMBER'][];
  bans?: { user: Ref; by: Ref }[];
  invitations?: { user: Ref; by: Ref; hoursAgo: number }[];
  posts: CommunityPost[];
}

const BANDCAMP: Content = {
  link: 'BANDCAMP',
  kind: 'ALBUM',
  url: 'https://khruangbin.bandcamp.com/album/mordechai',
  title: 'Mordechai',
  artist: 'Khruangbin',
  cover: 'https://f4.bcbits.com/img/a0911513519_5.jpg',
};
const SOUNDCLOUD: Content = {
  link: 'SOUNDCLOUD',
  kind: 'TRACK',
  url: 'https://soundcloud.com/kaytranada/at-all',
  title: 'At All',
  artist: 'KAYTRANADA',
  cover: 'https://i1.sndcdn.com/artworks-000058970439-8qxgy0-t500x500.jpg',
};
const TINY_DESK_MAC: Content = {
  link: 'YOUTUBE',
  kind: 'VIDEO',
  url: 'https://www.youtube.com/watch?v=QrR_gm6RqCo',
  title: 'Mac Miller: NPR Music Tiny Desk Concert',
  artist: 'NPR Music',
  cover: 'https://i.ytimg.com/vi/QrR_gm6RqCo/hqdefault.jpg',
};
const TINY_DESK_PAAK: Content = {
  link: 'YOUTUBE',
  kind: 'VIDEO',
  url: 'https://www.youtube.com/watch?v=ferZnZ0_rSM',
  title: 'Anderson .Paak & The Free Nationals: NPR Music Tiny Desk Concert',
  artist: 'NPR Music',
  cover: 'https://i.ytimg.com/vi/ferZnZ0_rSM/hqdefault.jpg',
};

/** Spread posts evenly back from now: post i is about `step` hours older than post i-1. */
function spread(community: string, step: number, rows: [Ref, Content, string?][]): CommunityPost[] {
  return rows.map(([author, content, comment], i) => ({
    key: `${community}-p${String(i + 1).padStart(2, '0')}`,
    author,
    content,
    hoursAgo: 2 + i * step + (i % 3) * 1.5,
    ...(comment === undefined ? {} : { comment }),
  }));
}

const s = (song: string): Content => ({ song });

export const COMMUNITIES: MockCommunity[] = [
  {
    key: 'c1',
    name: 'Indie Rock Night',
    description: 'Guitars, feelings, and the songs we play at 2am.',
    createdDaysAgo: 42,
    members: [
      ['A', 'OWNER'],
      ['m01', 'ADMIN'],
      ['B', 'MEMBER'],
      ['m02', 'MEMBER'],
      ['m03', 'MEMBER'],
      ['m06', 'MEMBER'],
      ['m05', 'MEMBER'],
    ],
    bans: [{ user: 'm11', by: 'A' }],
    posts: spread('c1', 28, [
      ['m01', s('indie01'), 'That bassline. Every single time.'],
      ['A', s('indie07')],
      ['m05', { pending: 'pend01' }, 'Found this on a late-night drive, tell me what you think'],
      ['m02', s('indie02')],
      ['B', s('indie04'), 'Cried on the bus to this one, no regrets.'],
      ['m03', s('indie05')],
      ['m06', s('indie03'), 'The best Radiohead song and I will not take questions.'],
      ['A', s('indie23'), 'Full album, front to back. Trust me.'],
      ['m01', s('indie06')],
      ['m05', s('indie08')],
      ['B', s('indie11')],
      ['m02', s('indie09'), 'Eight minutes and not a second too long'],
      ['m03', s('indie10')],
      ['A', s('indie15'), 'Morrissey aside, this song is perfect.'],
      ['m06', s('indie12')],
      ['m01', s('indie13')],
      ['m05', s('indie14')],
      ['B', s('indie19')],
      ['m02', s('indie16')],
      ['A', s('indie01')],
      ['m03', s('indie17'), 'Summer 2008 in one track'],
      ['m06', s('indie18')],
      ['m01', s('indie20')],
      ['m02', s('indie24')],
      ['m05', s('indie25'), 'Long one, but the middle section is unreal.'],
    ]),
  },
  {
    key: 'c2',
    name: 'Jazz & Coffee',
    description: 'Slow mornings, good records.',
    createdDaysAgo: 36,
    members: [
      ['B', 'OWNER'],
      ['A', 'MEMBER'],
      ['m08', 'MEMBER'],
      ['m07', 'MEMBER'],
      ['m06', 'MEMBER'],
    ],
    posts: spread('c2', 60, [
      ['B', s('jazz01'), 'Where it all starts.'],
      ['m08', s('jazz07')],
      ['A', s('jazz05')],
      ['m07', TINY_DESK_PAAK, 'Not strictly jazz, but that drummer...'],
      ['m06', s('jazz03')],
      ['m08', { pending: 'pend02' }],
      ['B', s('jazz10')],
      ['m07', s('jazz06')],
      ['A', s('jazz09'), 'Sunday soundtrack'],
      ['m06', s('jazz02')],
    ]),
  },
  {
    key: 'c3',
    name: 'מזרחית ותיקה',
    description: 'הקלאסיקות של פעם, בלי פשרות.',
    createdDaysAgo: 30,
    members: [
      ['m09', 'OWNER'],
      ['A', 'MEMBER'],
      ['B', 'MEMBER'],
      ['m07', 'MEMBER'],
    ],
    posts: spread('c3', 70, [
      ['m09', s('mz01'), 'אין דברים כאלה'],
      ['A', s('mz02')],
      ['m07', s('mz03')],
      ['B', s('mz04'), 'שיר החתונות של אמא שלי'],
      ['m09', s('mz05')],
      ['A', s('mz06')],
      ['m07', s('mz07')],
      ['m09', s('mz08')],
    ]),
  },
  {
    key: 'c4',
    name: 'Workout Bangers',
    description: 'Only songs that make you lift heavier.',
    createdDaysAgo: 28,
    members: [
      ['m07', 'OWNER'],
      ['B', 'ADMIN'],
      ['m08', 'MEMBER'],
      ['m10', 'MEMBER'],
    ],
    posts: spread('c4', 66, [
      ['m07', s('gym01')],
      ['B', s('gym04'), 'Leg day anthem'],
      ['m10', s('gym03')],
      ['m08', s('gym06')],
      ['m07', s('gym07')],
      ['B', s('gym02')],
      ['m10', s('gym05')],
      ['m08', s('gym08')],
    ]),
  },
  {
    key: 'c5',
    name: 'Lo-fi Study',
    description: 'Beats to focus to. No vocals preferred.',
    createdDaysAgo: 25,
    members: [
      ['m02', 'OWNER'],
      ['m04', 'MEMBER'],
      ['m03', 'MEMBER'],
    ],
    invitations: [{ user: 'A', by: 'm02', hoursAgo: 5 }],
    posts: spread('c5', 80, [
      ['m02', s('lofi01'), 'RIP Nujabes. Still the best.'],
      ['m04', BANDCAMP, 'Buy it on Bandcamp, support the band'],
      ['m03', s('lofi03')],
      ['m02', s('lofi04')],
      ['m04', s('lofi02')],
      ['m03', s('lofi05')],
    ]),
  },
  {
    key: 'c6',
    name: 'Hip-Hop Heads',
    description: 'Bars only.',
    createdDaysAgo: 22,
    members: [
      ['m12', 'OWNER'],
      ['m13', 'MEMBER'],
      ['m14', 'MEMBER'],
    ],
    posts: spread('c6', 72, [
      ['m12', s('hh01')],
      ['m13', TINY_DESK_MAC, 'This one hurts to watch now'],
      ['m14', SOUNDCLOUD],
      ['m12', s('hh02')],
      ['m13', s('hh06'), 'A masterpiece, no notes'],
      ['m14', s('hh04')],
    ]),
  },
  {
    key: 'c7',
    name: 'Classical Corner',
    description: 'From Bach to Richter.',
    createdDaysAgo: 18,
    members: [
      ['m13', 'OWNER'],
      ['m12', 'MEMBER'],
    ],
    posts: spread('c7', 90, [
      ['m13', s('cl02')],
      ['m12', s('cl01')],
      ['m13', s('cl03'), 'Arrival soundtrack, if it sounds familiar'],
      ['m12', s('cl04')],
    ]),
  },
  {
    key: 'c8',
    name: 'Empty Room',
    description: 'Nothing here yet.',
    createdDaysAgo: 4,
    members: [['m14', 'OWNER']],
    posts: [],
  },
];

export interface DirectRec {
  key: string;
  from: Ref;
  to: Ref;
  song: string;
  hoursAgo: number;
  comment?: string;
  hidden?: boolean;
}

export const DIRECT: DirectRec[] = [
  {
    key: 'd01',
    from: 'm01',
    to: 'A',
    song: 'dm01',
    hoursAgo: 3,
    comment: 'This made me think of you',
  },
  { key: 'd02', from: 'm03', to: 'A', song: 'dm07', hoursAgo: 20 },
  {
    key: 'd03',
    from: 'm04',
    to: 'A',
    song: 'dm02',
    hoursAgo: 50,
    comment: 'Headphones on for this one',
  },
  { key: 'd04', from: 'm05', to: 'A', song: 'dm03', hoursAgo: 120 },
  { key: 'd05', from: 'm06', to: 'A', song: 'dm04', hoursAgo: 200 },
  {
    key: 'd06',
    from: 'm07',
    to: 'B',
    song: 'dm05',
    hoursAgo: 6,
    comment: 'Classic. You need this.',
  },
  { key: 'd07', from: 'm08', to: 'B', song: 'dm06', hoursAgo: 30 },
  { key: 'd08', from: 'm09', to: 'B', song: 'dm08', hoursAgo: 70, comment: 'שיר מושלם' },
  { key: 'd09', from: 'm01', to: 'B', song: 'dm09', hoursAgo: 150 },
  { key: 'd10', from: 'm02', to: 'B', song: 'dm10', hoursAgo: 260, hidden: true },
  {
    key: 'd11',
    from: 'A',
    to: 'm02',
    song: 'dm11',
    hoursAgo: 40,
    comment: 'You will love the hook',
  },
  { key: 'd12', from: 'A', to: 'm05', song: 'dm12', hoursAgo: 180 },
  { key: 'd13', from: 'B', to: 'm07', song: 'dm13', hoursAgo: 60 },
  { key: 'd14', from: 'B', to: 'm09', song: 'dm14', hoursAgo: 220 },
  { key: 'd15', from: 'A', to: 'B', song: 'dm15', hoursAgo: 10, comment: 'Old favourite' },
  { key: 'd16', from: 'B', to: 'A', song: 'dm16', hoursAgo: 14 },
];

/** Ratings written by hand, so the discussion threads have a review to hang from. */
export const RATINGS: { post: string; user: Ref; score: number; review?: string }[] = [
  { post: 'c1-p02', user: 'm01', score: 9, review: 'Best National song, easily.' },
  { post: 'c1-p02', user: 'B', score: 7, review: 'Good, but I prefer the live version' },
  { post: 'c1-p05', user: 'A', score: 10, review: 'Same. Every time.' },
  { post: 'c1-p05', user: 'm02', score: 8 },
  { post: 'c1-p07', user: 'A', score: 6, review: 'Hot take: Reckoner is better' },
  { post: 'c1-p07', user: 'm03', score: 10, review: 'No it is not' },
  { post: 'c2-p01', user: 'A', score: 9, review: 'Perfect morning record.' },
  { post: 'c2-p01', user: 'm08', score: 10 },
  { post: 'd01', user: 'A', score: 8, review: 'You know me too well' },
  { post: 'd06', user: 'B', score: 9 },
  { post: 'd15', user: 'B', score: 10, review: 'Still gives me chills' },
];

/** Review lines the generator picks from for the other ratings. */
export const REVIEW_POOL = [
  'On repeat all week.',
  'Not for me, but I get it.',
  'The production on this is insane',
  'Took a few listens, now I love it',
  'Instant classic',
  'A bit long, but worth it.',
  'Reminds me of high school',
  'Chorus is stuck in my head',
  'Solid, nothing special.',
  'מושלם',
  'Wow. Just wow.',
  'Better live',
];

export interface MockComment {
  key: string;
  post: string;
  author: Ref;
  /** Under a review: [post, rater] of a rating in RATINGS. */
  onRating?: Ref;
  /** Under a post comment: that comment's key. */
  parent?: string;
  /** The person replied to (gets a COMMENT_REPLY). */
  replyTo?: Ref;
  body?: string;
  deleted?: boolean;
  hoursAgo: number;
}

export const COMMENTS: MockComment[] = [
  // c1-p07 (Weird Fishes): an argument under A's review.
  {
    key: 'k01',
    post: 'c1-p07',
    author: 'm06',
    onRating: 'A',
    replyTo: 'A',
    body: 'Reckoner?? Bold.',
    hoursAgo: 150,
  },
  {
    key: 'k02',
    post: 'c1-p07',
    author: 'm03',
    onRating: 'A',
    replyTo: 'A',
    body: 'Agree with Lior, Weird Fishes wins',
    hoursAgo: 140,
  },
  {
    key: 'k03',
    post: 'c1-p07',
    author: 'A',
    onRating: 'A',
    replyTo: 'm03',
    body: 'Fine, fine. Both are great.',
    hoursAgo: 130,
  },
  {
    key: 'k04',
    post: 'c1-p07',
    author: 'm01',
    onRating: 'A',
    replyTo: 'A',
    body: 'Peace in our time',
    hoursAgo: 20,
  },
  // c1-p05 (B's Phoebe Bridgers): post comments with a thread.
  {
    key: 'k05',
    post: 'c1-p05',
    author: 'm02',
    body: 'The bus is the right place for this song',
    hoursAgo: 100,
  },
  {
    key: 'k06',
    post: 'c1-p05',
    author: 'B',
    parent: 'k05',
    replyTo: 'm02',
    body: 'Right?? Public crying is underrated',
    hoursAgo: 98,
  },
  {
    key: 'k07',
    post: 'c1-p05',
    author: 'm05',
    parent: 'k05',
    replyTo: 'B',
    body: 'Punisher is even worse for that',
    hoursAgo: 30,
  },
  {
    key: 'k08',
    post: 'c1-p05',
    author: 'm03',
    body: 'Did anyone see her live last year?',
    hoursAgo: 25,
  },
  { key: 'k09', post: 'c1-p05', author: 'm06', deleted: true, hoursAgo: 24 },
  {
    key: 'k10',
    post: 'c1-p05',
    author: 'A',
    parent: 'k08',
    replyTo: 'm03',
    body: 'Yes! Tel Aviv, amazing show',
    hoursAgo: 12,
  },
  // c1-p02 (A's The National): replies to B's review.
  {
    key: 'k11',
    post: 'c1-p02',
    author: 'm01',
    onRating: 'B',
    replyTo: 'B',
    body: 'Which live version? The Brooklyn one?',
    hoursAgo: 28,
  },
  {
    key: 'k12',
    post: 'c1-p02',
    author: 'B',
    onRating: 'B',
    replyTo: 'm01',
    body: 'Yes, the Brooklyn one',
    hoursAgo: 27,
  },
  {
    key: 'k13',
    post: 'c1-p02',
    author: 'm02',
    onRating: 'B',
    replyTo: 'B',
    body: 'Link it please',
    hoursAgo: 4,
  },
  // c2-p01 (B's So What): post comments.
  {
    key: 'k14',
    post: 'c2-p01',
    author: 'm07',
    body: 'Kind of Blue is the only jazz album I own',
    hoursAgo: 1.8,
  },
  {
    key: 'k15',
    post: 'c2-p01',
    author: 'B',
    parent: 'k14',
    replyTo: 'm07',
    body: 'Then you own the right one',
    hoursAgo: 1.6,
  },
  {
    key: 'k16',
    post: 'c2-p01',
    author: 'm08',
    onRating: 'A',
    replyTo: 'A',
    body: 'Agreed, coffee and this',
    hoursAgo: 1.2,
  },
  // d15 (A to B, direct): a short exchange.
  {
    key: 'k17',
    post: 'd15',
    author: 'A',
    onRating: 'B',
    replyTo: 'B',
    body: 'Knew you would',
    hoursAgo: 7,
  },
  {
    key: 'k18',
    post: 'd15',
    author: 'B',
    onRating: 'B',
    replyTo: 'A',
    body: 'Send more like this',
    hoursAgo: 6,
  },
  // c3-p01 (Zohar Argov): Hebrew discussion.
  { key: 'k19', post: 'c3-p01', author: 'm07', body: 'המלך', hoursAgo: 1.8 },
  {
    key: 'k20',
    post: 'c3-p01',
    author: 'B',
    parent: 'k19',
    replyTo: 'm07',
    body: 'אין שני לו',
    hoursAgo: 1.5,
  },
  {
    key: 'k21',
    post: 'c3-p01',
    author: 'm09',
    parent: 'k19',
    replyTo: 'B',
    body: 'בדיוק',
    hoursAgo: 1.2,
  },
  // c1-p01 (Arctic Monkeys): plain comments, no threads.
  {
    key: 'k22',
    post: 'c1-p01',
    author: 'A',
    body: 'Saw them in 2014, still my best concert',
    hoursAgo: 1.5,
  },
  { key: 'k23', post: 'c1-p01', author: 'm06', body: 'AM is a perfect album', hoursAgo: 1 },
];

/** [user, post] */
export const BOOKMARKS: [Ref, string][] = [
  ['A', 'c1-p05'],
  ['A', 'c1-p12'],
  ['A', 'c2-p04'],
  ['A', 'c2-p07'],
  ['A', 'c3-p01'],
  ['A', 'd01'],
  ['A', 'd03'],
  ['A', 'd16'],
  ['B', 'c1-p07'],
  ['B', 'c1-p13'],
  ['B', 'c4-p03'],
  ['B', 'c3-p05'],
  ['B', 'd06'],
  ['B', 'd15'],
  ['m01', 'c1-p02'],
  ['m07', 'c2-p01'],
];

/** One edited post comment, to show "edited". */
export const EDITED_COMMENT_POST = 'c1-p12';
