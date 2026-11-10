import { useState } from 'react';

interface CoverArtProps {
  url: string | null;
  /** 80px by default; 116px on the Mixtape post card (ui-redesign.md §5.0). */
  size?: 80 | 116;
}

const SIZE_CLASSES = { 80: 'size-20', 116: 'size-[116px]' } as const;

/** A neutral square while there is no cover, or the cover fails to load. */
export function CoverArt({ url, size = 80 }: CoverArtProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  if (!url || failed) {
    return (
      <div
        aria-hidden="true"
        className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-xl bg-line text-2xl text-muted`}
      >
        ♪
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 rounded-xl object-cover`}
    />
  );
}
