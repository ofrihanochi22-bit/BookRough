import { useState } from 'react';

import { avatarHue, initials } from './avatarParts';

interface AvatarProps {
  /** Stable id of the entity — picks the background colour, so it never changes. */
  id: string;
  name: string | null;
  pictureUrl?: string | null;
  size?: number;
}

/**
 * Generated avatars only — no uploads (CLAUDE.md §8). A Google picture is used
 * when present; if it is missing or fails to load, initials over a colour
 * derived from the id. A user who has not chosen a name yet gets a neutral
 * glyph rather than initials of nothing.
 */
export function Avatar({ id, name, pictureUrl, size = 64 }: AvatarProps) {
  const [pictureFailed, setPictureFailed] = useState(false);
  const label = name ?? 'Your avatar';

  if (pictureUrl && !pictureFailed) {
    return (
      <img
        src={pictureUrl}
        alt={label}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setPictureFailed(true)}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const hue = avatarHue(id);
  return (
    <div
      role="img"
      aria-label={label}
      className="flex items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        backgroundColor: `hsl(${hue} 55% 88%)`,
        color: `hsl(${hue} 50% 28%)`,
      }}
    >
      {name ? initials(name) : '♪'}
    </div>
  );
}
