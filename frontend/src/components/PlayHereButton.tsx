import type { PublicPost } from '../api/posts';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { isPlayableEmbed, playerName } from '../lib/embeds';
import { displayTitle } from '../lib/postLinks';
import { usePlayer } from '../stores/player';
import { CHIP } from './ui/chip';

/**
 * "Play here" beside a link-only post's main button (docs/features/in-app-player.md
 * §5.4): opens the docked player, or swaps it to this post. Nothing is shown
 * for a post without a playable embed.
 */
export function PlayHereButton({ post }: { post: PublicPost }) {
  const online = useOnlineStatus();
  const playing = usePlayer((state) => state.current?.postId === post.id);
  const play = usePlayer((state) => state.play);
  const { embed } = post;

  if (!isPlayableEmbed(embed)) {
    return null;
  }
  const title = displayTitle(post) || playerName(embed.platform);

  return (
    <button
      type="button"
      className={CHIP}
      disabled={playing || !online}
      aria-label={playing ? `Playing ${title}` : `Play ${title} here`}
      onClick={() => play({ postId: post.id, platform: embed.platform, url: embed.url, title })}
    >
      {playing ? 'Playing' : online ? 'Play here' : 'Offline'}
    </button>
  );
}
