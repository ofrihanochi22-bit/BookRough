import type { ReactNode } from 'react';

import { avatarHue } from './avatarParts';

interface CommunityCoverProps {
  /** Picks the colour. Null before the community exists: a neutral preview. */
  id: string | null;
  name: string;
  variant: 'thumb' | 'card' | 'banner';
  /**
   * The label carries real text instead of being decorative (ui-redesign.md
   * §5.1, §5.2) — the name as the screen's `h1` (the feed's banner) or as text
   * (Home's card, whose link it names), plus a `detail` line under it.
   */
  label?: 'h1' | 'text';
  detail?: ReactNode;
}

/** The stripe band's two tones: the community's own hue, or neutral greys before it exists. */
function stripeColors(hue: number | null): [string, string] {
  return hue === null
    ? ['hsl(240 6% 70%)', 'hsl(240 6% 55%)']
    : [`hsl(${hue} 72% 58%)`, `hsl(${hue} 60% 40%)`];
}

/** The two-tone stripe band across the top of a cassette label or a profile's tape card. */
export function StripeBand({ hue, className }: { hue: number | null; className: string }) {
  const [light, dark] = stripeColors(hue);
  return (
    <div aria-hidden="true" data-testid="cover-stripe" className={`flex flex-col ${className}`}>
      <span className="flex-1" style={{ backgroundColor: light }} />
      <span className="flex-1" style={{ backgroundColor: dark }} />
    </div>
  );
}

/** The dark window with two reels — still: covers are pictures, not loaders. */
function ReelWindow({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 24" className={className}>
      <rect width="64" height="24" rx="12" className="fill-tape-ink" />
      {[18, 46].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="12" r="7.5" className="fill-tape" />
          <circle cx={cx} cy="12" r="2.75" className="fill-sticker" />
        </g>
      ))}
    </svg>
  );
}

/**
 * The generated community cover (CLAUDE.md §8) is a cassette (ui-redesign.md
 * §3.5): a `tape` label with a stripe band in the community's deterministic
 * hue — from the same generator as user avatars — the name in the heading face
 * (two lines, then an ellipsis) and two reels. In light mode the label gets a
 * 2px `tape-ink` outline. Decorative — the screen prints the name — unless the
 * caller passes `label`, which makes the cassette's own label the name's text.
 */
export function CommunityCover({ id, name, variant, label, detail }: CommunityCoverProps) {
  const hue = id ? avatarHue(id) : null;
  const frame =
    'overflow-hidden rounded-xl bg-tape text-tape-ink ring-2 ring-tape-ink ring-inset dark:ring-0';

  if (variant === 'thumb') {
    return (
      <div
        aria-hidden="true"
        data-testid="community-cover"
        className={`flex h-11 w-full flex-col ${frame} rounded-lg`}
      >
        <StripeBand hue={hue} className="h-3" />
        <div className="flex flex-1 items-center justify-center">
          <ReelWindow className="w-9" />
        </div>
      </div>
    );
  }

  const banner = variant === 'banner';
  const Name = label === 'h1' ? 'h1' : 'p';
  return (
    <div
      aria-hidden={label ? undefined : true}
      data-testid="community-cover"
      className={`flex w-full flex-col ${frame}`}
    >
      <StripeBand hue={hue} className={banner ? 'h-5' : 'h-3'} />
      <div className={`flex items-center gap-4 ${banner ? 'px-5 py-4' : 'px-4 py-3'}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Two lines, then an ellipsis; the full name stays in the text (§7). */}
          <Name
            className={`line-clamp-2 break-words font-display font-bold tracking-[-0.01em] ${
              banner ? 'text-2xl' : 'text-lg'
            }`}
          >
            {name.trim() || '♪'}
          </Name>
          {detail && (
            <p className="text-sm">
              {/* Read as "Com2, 2 members", never "Com22 members". */}
              <span className="sr-only">, </span>
              {detail}
            </p>
          )}
        </div>
        <ReelWindow className={banner ? 'w-24 shrink-0' : 'w-16 shrink-0'} />
      </div>
    </div>
  );
}
