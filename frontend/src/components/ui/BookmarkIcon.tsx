import { BOOKMARK_GLYPH } from './appIcons';

/** The bookmark shape shared by the tab bar and the save button; filled when saved. */
export function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {BOOKMARK_GLYPH}
    </svg>
  );
}
