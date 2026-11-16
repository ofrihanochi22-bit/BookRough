/**
 * Every cache key and key prefix, in one place, so the keys screens read and the
 * keys writes invalidate cannot drift apart (docs/features/client-cache.md §3.1).
 * `persist` says whether a key is kept on the device between visits.
 */
export const cacheKeys = {
  communities: 'communities',
  community: (id: string) => `community:${id}`,
  feed: (communityId: string) => `feed:${communityId}`,
  myList: 'myList',
  notifications: 'notifications',
  recsReceived: 'recs:received',
  recsSent: 'recs:sent',
  friends: 'friends',
  friendList: 'friendList',
  post: (id: string) => `post:${id}`,
  postRatings: (id: string) => `postRatings:${id}`,
  comments: (postId: string) => `comments:${postId}`,
  profile: (userId: string) => `profile:${userId}`,
  profileRatings: (userId: string) => `profileRatings:${userId}`,
} as const;

/** Prefixes that cover every key of one kind, for writes that cannot name an id. */
export const cachePrefixes = {
  feed: 'feed',
  community: 'community',
  recs: 'recs',
  post: 'post',
  postRatings: 'postRatings',
  comments: 'comments',
  profile: 'profile',
  profileRatings: 'profileRatings',
} as const;

/**
 * Everything that shows a user's name or picture. A change to the user's own
 * profile, or an admin removing a photo, makes all of it stale (§3.4).
 */
export const AVATAR_KEYS = [
  cachePrefixes.profile,
  cachePrefixes.profileRatings,
  cacheKeys.friends,
  cacheKeys.friendList,
  cachePrefixes.feed,
  cachePrefixes.post,
  cachePrefixes.postRatings,
  cachePrefixes.comments,
  cachePrefixes.recs,
] as const;
