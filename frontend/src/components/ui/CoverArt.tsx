import { useState } from 'react';

interface CoverArtProps {
  url: string | null;
  /**
   * 80px by default; 64px on profile rating rows (ui-redesign.md §5.6); 116px on the post card (ui-redesign.md §5.0);
   * `full` — the card's whole width, square, radius 16px — on Post Detail (§5.3).
   */
  size?: 64 | 80 | 116 | 'full';
}

const SIZE_CLASSES = {
  64: 'size-16 rounded-xl',
  80: 'size-20 rounded-xl',
  116: 'size-[116px] rounded-xl',
  full: 'aspect-square w-full rounded-2xl',
} as const;

/** A neutral square while there is no cover, or the cover fails to load. */
export function CoverArt({ url, size = 80 }: CoverArtProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  if (!url || failed) {
    return (
      <div
        aria-hidden="true"
        className={`flex ${sizeClass} shrink-0 items-center justify-center bg-line text-muted ${
          size === 'full' ? 'text-6xl' : 'text-2xl'
        }`}
      >
        ♪
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={size === 'full' ? undefined : size}
      height={size === 'full' ? undefined : size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 object-cover`}
    />
  );
}
