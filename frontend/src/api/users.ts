import type { Session, StreamingService, TutorialItem, TutorialState } from '../stores/auth';
import { api, type SuccessBody } from './client';

export type Availability =
  { available: true; reason: null } | { available: false; reason: 'taken' | 'reserved' };

export interface ProfileUpdate {
  displayName?: string;
  preferredService?: StreamingService;
  useGooglePicture?: boolean;
}

/** The live check behind the name field; its errors are shown inline. */
export async function checkDisplayName(name: string, signal?: AbortSignal): Promise<Availability> {
  const response = await api.get<SuccessBody<Availability>>('/users/display-name-availability', {
    params: { name },
    signal,
    skipErrorToast: true,
  });
  return response.data.data;
}

/** Saves the profile and returns the refreshed session. */
export async function updateProfile(update: ProfileUpdate): Promise<Session> {
  const response = await api.patch<SuccessBody<Session>>('/users/me', update, {
    skipErrorToast: true,
  });
  return response.data.data;
}

/** Uploads a prepared image as the raw body; returns the refreshed session (avatar-upload.md §4). */
export async function uploadAvatar(image: Blob): Promise<Session> {
  const response = await api.put<SuccessBody<Session>>('/users/me/avatar', image, {
    headers: { 'Content-Type': image.type },
    skipErrorToast: true,
  });
  return response.data.data;
}

/** Re-chooses the Google photo with a fresh Google credential; returns the refreshed session. */
export async function chooseGooglePhoto(credential: string): Promise<Session> {
  const response = await api.post<SuccessBody<Session>>(
    '/users/me/google-picture',
    { credential },
    { skipErrorToast: true },
  );
  return response.data.data;
}

/**
 * Records that a tutorial item was seen (onboarding-tutorial.md §4). Quiet: the
 * caller ignores a failure, and the item simply shows again next session.
 */
export async function markTutorialSeen(item: TutorialItem): Promise<TutorialState> {
  const response = await api.patch<SuccessBody<{ tutorial: TutorialState }>>(
    '/users/me/tutorial',
    { seen: item },
    { skipErrorToast: true },
  );
  return response.data.data.tutorial;
}
