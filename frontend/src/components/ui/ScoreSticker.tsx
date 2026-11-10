/**
 * One rating's score on a small rotated `sticker` disc (ui-redesign.md §5.3,
 * §5.6). Read as "N/10"; the caller sets size, rotation and position.
 */
export function ScoreSticker({ score, className }: { score: number; className: string }) {
  return (
    <span
      role="img"
      aria-label={`${score}/10`}
      data-testid="score-sticker"
      className={`flex shrink-0 items-center justify-center rounded-full bg-sticker font-display font-extrabold text-sticker-ink ${className}`}
    >
      {score}
    </span>
  );
}
