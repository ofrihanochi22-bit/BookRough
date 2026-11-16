import type { ReactNode } from 'react';

import type { PublicUser } from '../../stores/auth';
import type { GuidePicture } from '../../lib/tutorialCopy';
import { Avatar } from '../ui/Avatar';
import { CommunityCover } from '../ui/CommunityCover';

/**
 * The guide's pictures — docs/features/onboarding-tutorial.md §5.1. Each is a
 * whole phone screen in miniature, drawn with the Mixtape tokens (no image
 * files), with the control to use ringed in the accent colour. Purely visual:
 * the caller gives the picture its accessible name, so all of this is hidden.
 */

/** The accent ring around the control to use; it pulses only when motion is welcome. */
function Ring({ children, round = false }: { children: ReactNode; round?: boolean }) {
  return (
    <span
      data-ring=""
      className={`inline-flex outline-2 outline-offset-2 outline-accent motion-safe:animate-[guide-ring_1.8s_ease-out_infinite] ${
        round ? 'rounded-full' : 'rounded-md'
      }`}
    >
      {children}
    </span>
  );
}

/** A line of placeholder text. */
function Bar({ className = 'w-16' }: { className?: string }) {
  return <span className={`block h-1.5 rounded-full bg-line ${className}`} />;
}

function Glyph({ children, className = 'size-3.5' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const HOME = <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />;
const FRIENDS = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15.6c1.6.7 2.8 2.2 3.5 4.4" />
  </>
);
const BOOKMARK = <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />;
const PROFILE = (
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </>
);
const BELL = <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />;
const STAR = <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />;

type Tab = 'home' | 'friends' | 'list';

/** The bottom bar: Home · Friends · Share · My List · Profile, as in BottomNav. */
function TabBar({ active, ring }: { active: Tab; ring?: 'share' | 'friends' }) {
  const tone = (tab: Tab) => (tab === active ? 'text-accent' : 'text-muted');
  const friends = (
    <span className={`flex ${tone('friends')}`}>
      <Glyph>{FRIENDS}</Glyph>
    </span>
  );
  const share = (
    <span className="flex size-6 items-center justify-center rounded-full bg-accent text-on-accent">
      <Glyph className="size-3">
        <path d="M12 5v14M5 12h14" />
      </Glyph>
    </span>
  );
  return (
    <div className="mt-auto flex items-center justify-around rounded-b-[14px] bg-surface px-1 py-1.5 shadow-[0_-1px_0_var(--line)]">
      <span className={`flex ${tone('home')}`}>
        <Glyph>{HOME}</Glyph>
      </span>
      {ring === 'friends' ? <Ring>{friends}</Ring> : friends}
      {ring === 'share' ? <Ring round>{share}</Ring> : share}
      <span className={`flex ${tone('list')}`}>
        <Glyph>{BOOKMARK}</Glyph>
      </span>
      <span className="flex text-muted">
        <Glyph>{PROFILE}</Glyph>
      </span>
    </div>
  );
}

/** The phone: a frame on canvas, the screen's content, then the tab bar. */
function Phone({ children, tabBar }: { children: ReactNode; tabBar: ReactNode }) {
  return (
    <div className="flex aspect-[9/16] h-full max-h-80 flex-col rounded-[18px] border-2 border-ink bg-canvas">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2.5 pt-3 pb-2">
        {children}
      </div>
      {tabBar}
    </div>
  );
}

/** Home's header: the screen title as a bar, and the bell. */
function HomeHeader({ bell }: { bell?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <Bar className="h-2 w-20 bg-ink" />
      <span className="flex text-muted">{bell ?? <Glyph>{BELL}</Glyph>}</span>
    </div>
  );
}

function CommunityRow({ id }: { id: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface p-1.5">
      <span className="w-10 shrink-0">
        <CommunityCover id={id} name="" variant="thumb" />
      </span>
      <span className="flex flex-col gap-1">
        <Bar className="w-14 bg-ink/40" />
        <Bar className="w-9" />
      </span>
    </div>
  );
}

/** A post card: who shared it, a cover and the song as bars, then `footer`. */
function PostCard({ hue, footer }: { hue: string; footer?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-surface p-1.5">
      <div className="flex items-center gap-1.5">
        <Avatar id={hue} name="Friend" size={16} decorative />
        <Bar className="w-10" />
      </div>
      <div className="flex items-center gap-2">
        <span className="size-8 shrink-0 rounded-md bg-accent-soft" />
        <span className="flex flex-1 flex-col gap-1">
          <Bar className="w-14 bg-ink/40" />
          <Bar className="w-10" />
        </span>
      </div>
      {footer}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-line bg-surface px-1.5 py-0.5 text-[9px] leading-none font-semibold whitespace-nowrap text-ink">
      {children}
    </span>
  );
}

interface PictureProps {
  picture: GuidePicture;
  user: PublicUser | null;
  yours: string;
  theirs: string;
}

/** One slide's picture (§5.1, "Slides"). */
export function GuidePictureView({ picture, user, yours, theirs }: PictureProps) {
  const me = user ? (
    <Avatar
      id={user.id}
      name={user.displayName}
      pictureUrl={user.profilePictureUrl}
      size={16}
      decorative
    />
  ) : null;

  switch (picture) {
    case 'songs':
      return (
        <Phone tabBar={<TabBar active="home" />}>
          <Bar className="h-2 w-16 bg-ink" />
          <PostCard
            hue="guide-friend"
            footer={
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <Chip>{theirs}</Chip>
                <Ring>
                  <Chip>{yours}</Chip>
                </Ring>
                {me}
              </div>
            }
          />
          <PostCard hue="guide-friend-2" />
        </Phone>
      );
    case 'communities':
      return (
        <Phone tabBar={<TabBar active="home" />}>
          <HomeHeader />
          <CommunityRow id="guide-community-a" />
          <CommunityRow id="guide-community-b" />
          <Ring>
            <span className="flex w-full min-w-0 items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-line px-2 py-1.5 text-[9px] font-semibold whitespace-nowrap text-ink">
              + Create community
            </span>
          </Ring>
        </Phone>
      );
    case 'share':
      return (
        <Phone tabBar={<TabBar active="home" ring="share" />}>
          <HomeHeader />
          <CommunityRow id="guide-community-a" />
          <CommunityRow id="guide-community-b" />
        </Phone>
      );
    case 'save':
      return (
        <Phone tabBar={<TabBar active="home" />}>
          <Bar className="h-2 w-16 bg-ink" />
          <PostCard
            hue="guide-friend"
            footer={
              <div className="flex justify-end">
                <Ring>
                  <span className="flex text-ink">
                    <Glyph>{BOOKMARK}</Glyph>
                  </span>
                </Ring>
              </div>
            }
          />
          <PostCard
            hue="guide-friend-2"
            footer={
              <div className="flex justify-end text-muted">
                <Glyph>{BOOKMARK}</Glyph>
              </div>
            }
          />
        </Phone>
      );
    case 'rate':
      return (
        <Phone tabBar={<TabBar active="list" />}>
          <Bar className="h-2 w-12 bg-ink" />
          <PostCard
            hue="guide-friend"
            footer={
              <div className="flex flex-col items-start gap-1.5">
                <Ring>
                  <span className="rounded-full bg-accent px-2 py-1 text-[9px] leading-none font-semibold whitespace-nowrap text-on-accent">
                    Rate &amp; Review
                  </span>
                </Ring>
                <span className="flex gap-px text-accent">
                  {Array.from({ length: 10 }, (_, star) => (
                    <Glyph key={star} className="size-2.5">
                      {STAR}
                    </Glyph>
                  ))}
                </span>
              </div>
            }
          />
        </Phone>
      );
    case 'friends':
      return (
        <Phone tabBar={<TabBar active="home" ring="friends" />}>
          <HomeHeader
            bell={
              <Ring>
                <span className="flex text-ink">
                  <Glyph>{BELL}</Glyph>
                </span>
              </Ring>
            }
          />
          {/* A notification for you: your avatar, a line, the unread dot. */}
          <div className="flex items-center gap-2 rounded-lg bg-surface p-1.5">
            {me}
            <span className="flex flex-1 flex-col gap-1">
              <Bar className="w-14 bg-ink/40" />
              <Bar className="w-9" />
            </span>
            <span className="size-1.5 rounded-full bg-accent" />
          </div>
          <CommunityRow id="guide-community-a" />
        </Phone>
      );
  }
}
