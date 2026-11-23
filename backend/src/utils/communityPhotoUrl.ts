/**
 * How a community's photo is addressed — docs/features/community-photo.md §3.
 * Built from `communities.photo_updated_at`, so `?v=` changes with every
 * upload and a cache never shows an old photo. Null: the generated cover.
 */
export function communityPhotoUrl(communityId: string, photoUpdatedAt: Date | null): string | null {
  return photoUpdatedAt
    ? `/api/communities/${communityId}/photo?v=${photoUpdatedAt.getTime()}`
    : null;
}
