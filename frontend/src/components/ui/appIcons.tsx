/**
 * The shapes inside the app's line icons (24×24 viewBox), shared by the real
 * controls and the guide's drawn screens (onboarding-tutorial.md §5.1), so a
 * redrawn icon changes in both places.
 */

export const HOME_GLYPH = <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />;

export const FRIENDS_GLYPH = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15.6c1.6.7 2.8 2.2 3.5 4.4" />
  </>
);

export const PROFILE_GLYPH = (
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </>
);

export const SHARE_GLYPH = <path d="M12 5v14M5 12h14" />;

export const BOOKMARK_GLYPH = <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />;

export const BELL_GLYPH = (
  <>
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </>
);
