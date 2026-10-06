import { avatarHue, initials } from './avatarParts';

interface CommunityCoverProps {
  /** Picks the colour. Null before the community exists: a neutral preview. */
  id: string | null;
  name: string;
  variant: 'thumb' | 'card' | 'banner';
}

const SIZES = {
  /** A row's leading square (invite-friends.md §5.4). */
  thumb: 'h-11 text-sm',
  card: 'h-20 text-2xl',
  banner: 'h-32 text-4xl',
} as const;

/**
 * The generated community cover (CLAUDE.md §8): initials over a colour derived
 * from the id, from the same generator as user avatars. Always decorative —
 * the name is printed next to it wherever it appears.
 */
export function CommunityCover({ id, name, variant }: CommunityCoverProps) {
  const letters = name.trim().length > 0 ? initials(name) : '♪';
  const hue = id ? avatarHue(id) : null;

  return (
    <div
      aria-hidden="true"
      data-testid="community-cover"
      className={`flex w-full items-center justify-center rounded-xl font-display font-medium ${SIZES[variant]} ${hue === null ? 'bg-line text-muted' : ''}`}
      style={
        hue === null
          ? undefined
          : { backgroundColor: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 50% 28%)` }
      }
    >
      {letters}
    </div>
  );
}
