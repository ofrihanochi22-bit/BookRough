/**
 * Shared user types — kept in sync with the backend's Prisma User model.
 *
 * `passwordHash` is intentionally omitted: the backend strips it before sending.
 * Never assume a User object has a password field on the frontend.
 */

export type PreferredService =
  | "SPOTIFY"
  | "APPLE_MUSIC"
  | "YOUTUBE"
  | "TIDAL"
  | "DEEZER";

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  profilePictureUrl: string | null;
  preferredService: PreferredService;
  /** False until a Google-login user completes the onboarding form. */
  profileComplete: boolean;
  createdAt: string; // ISO 8601
}

/** Options for the streaming service selector. */
export const STREAMING_SERVICES: { value: PreferredService; label: string }[] =
  [
    { value: "SPOTIFY", label: "Spotify" },
    { value: "APPLE_MUSIC", label: "Apple Music" },
    { value: "YOUTUBE", label: "YouTube Music" },
    { value: "TIDAL", label: "Tidal" },
    { value: "DEEZER", label: "Deezer" },
  ];
