import type { StreamingService } from '../stores/auth';

/** Display labels, in the order the onboarding picker lists them. */
export const STREAMING_SERVICES: ReadonlyArray<{ value: StreamingService; label: string }> = [
  { value: 'SPOTIFY', label: 'Spotify' },
  { value: 'APPLE_MUSIC', label: 'Apple Music' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'TIDAL', label: 'Tidal' },
  { value: 'DEEZER', label: 'Deezer' },
];

export function streamingServiceLabel(service: StreamingService): string {
  return STREAMING_SERVICES.find((option) => option.value === service)?.label ?? service;
}
