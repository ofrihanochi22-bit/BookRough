import type { StreamingService } from '../stores/auth';
import { api, type SuccessBody } from './client';
import type { Friendship } from './friends';
import type { MemberUser } from './membership';
import type { PostKind } from './posts';

/** Mirrors the backend's search result (docs/features/find-people.md §4). */
export interface SearchResults {
  users: MemberUser[];
  /** More than 20 matched; only the first 20 are sent. */
  hasMore: boolean;
}

/** Mirrors the backend's ProfileUser. */
export interface ProfileUser {
  id: string;
  displayName: string;
  profilePictureUrl: string | null;
  preferredService: StreamingService;
}

/** Mirrors the backend's ProfileRating: a pointer to Post Detail. */
export interface ProfileRating {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  community: { id: string; name: string };
  post: {
    id: string;
    sourceService: StreamingService;
    kind: PostKind | null;
    title: string | null;
    artist: string | null;
    coverArtUrl: string | null;
    conversionPending: boolean;
  };
}

export interface ProfileRatingsPage {
  items: ProfileRating[];
  nextCursor: string | null;
}

/** Search shows an inline retry on failure, so no toast. */
export async function searchUsers(q: string): Promise<SearchResults> {
  const response = await api.get<SuccessBody<SearchResults>>('/users/search', {
    params: { q },
    skipErrorToast: true,
  });
  return response.data.data;
}

/** A profile, with the viewer's friendship (friend-requests.md §4). */
export interface ProfileData {
  user: ProfileUser;
  friendship: Friendship;
}

export async function getProfile(userId: string): Promise<ProfileData> {
  const response = await api.get<SuccessBody<ProfileData>>(`/users/${encodeURIComponent(userId)}`, {
    skipErrorToast: true,
  });
  return response.data.data;
}

export async function listProfileRatings(
  userId: string,
  before?: string,
): Promise<ProfileRatingsPage> {
  const response = await api.get<SuccessBody<ProfileRatingsPage>>(
    `/users/${encodeURIComponent(userId)}/ratings`,
    { params: before ? { before } : undefined, skipErrorToast: true },
  );
  return response.data.data;
}
