import { useState } from 'react';

/** A neutral square while there is no cover, or the cover fails to load. */
export function CoverArt({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div
        aria-hidden="true"
        className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-line text-2xl text-muted"
      >
        ♪
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={80}
      height={80}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-20 shrink-0 rounded-xl object-cover"
    />
  );
}
