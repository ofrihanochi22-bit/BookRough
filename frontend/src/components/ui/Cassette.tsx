interface ReelsProps {
  /** Spinning reels say "working"; still reels are a picture (ui-redesign.md §3.7). */
  spinning?: boolean;
  className?: string;
}

/**
 * The Mixtape cassette with its two reels — docs/features/ui-redesign.md §3.7.
 * The one signature motion: the reels spin during a conversion and replace the
 * generic spinner; `prefers-reduced-motion` stills them (index.css). Always
 * decorative: the words beside it carry the meaning.
 */
export function ReelCassette({ spinning = false, className = 'w-24' }: ReelsProps) {
  const spin = spinning ? 'mixtape-reel-spin' : '';
  return (
    <svg
      aria-hidden="true"
      data-testid="reel-cassette"
      data-spinning={spinning || undefined}
      viewBox="0 0 120 76"
      className={className}
    >
      <rect
        x="2"
        y="2"
        width="116"
        height="72"
        rx="10"
        className="fill-tape stroke-tape-ink"
        strokeWidth="2.5"
      />
      <rect x="18" y="14" width="84" height="32" rx="16" className="fill-tape-ink" />
      {[40, 80].map((cx) => (
        <g key={cx} className={spin}>
          <circle cx={cx} cy="30" r="11" className="fill-tape" />
          <circle cx={cx} cy="30" r="4" className="fill-sticker" />
          {[0, 120, 240].map((angle) => (
            <rect
              key={angle}
              x={cx - 1.25}
              y="20"
              width="2.5"
              height="5"
              rx="1"
              className="fill-tape-ink"
              transform={`rotate(${angle} ${cx} 30)`}
            />
          ))}
        </g>
      ))}
      <path d="M30 74l6-14h48l6 14" className="fill-none stroke-tape-ink" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * The logo's mark (ui-redesign.md §3.8): a front-on cassette in fixed orange,
 * with a `tape` label window, two dark reels with sticker-yellow hubs and a
 * darker tape guide. Never follows the admin accent; the same in both schemes.
 */
export function CassetteMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" data-testid="cassette-mark" viewBox="0 0 104 66" className={className}>
      <rect x="0" y="0" width="104" height="66" rx="9" fill="#FF5A36" />
      <rect x="10" y="9" width="84" height="34" rx="6" fill="#FBF8F2" />
      {[33, 71].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="26" r="11" fill="#1B1A2E" />
          <circle cx={cx} cy="26" r="4.5" fill="#FFC93C" />
        </g>
      ))}
      <path d="M24 66l6-14h44l6 14z" fill="#C23A17" />
    </svg>
  );
}
