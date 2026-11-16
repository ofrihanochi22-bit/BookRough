import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KEYS_HINT, REOPEN_HINT, SWIPE_HINT } from '../lib/tutorialCopy';
import { useAuthStore, type StreamingService } from '../stores/auth';
import { makeSession, makeUser, resetAuthStore } from '../test/fixtures';
import { Walkthrough } from './Walkthrough';

const { markTutorialSeen, toast } = vi.hoisted(() => ({
  markTutorialSeen: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('../api/users', () => ({ markTutorialSeen }));
vi.mock('react-hot-toast', () => ({ default: toast }));

const SLIDE_TITLES = [
  'Songs that travel',
  'Join or start a community',
  'Share a song',
  'Save it for later',
  'Rate what you heard',
  'Friends and the bell',
];
const LAST = SLIDE_TITLES.length - 1;

/** jsdom has no matchMedia: answer `(pointer: coarse)` as a touch screen would, or not. */
function pointerIs(touch: boolean) {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: touch }) as unknown as typeof window.matchMedia;
}

function signIn(
  service: StreamingService | null = 'SPOTIFY',
  profilePictureUrl: string | null = null,
) {
  useAuthStore.getState().setSession(
    makeSession({
      user: makeUser({ preferredService: service, profilePictureUrl, displayName: 'Ofri Hanochi' }),
      tutorial: { walkthrough: true, saveTip: true, listTip: true },
    }),
  );
}

/** jsdom has no PointerEvent: a MouseEvent of the pointer type, given a pointerType, reaches React. */
function pointer(target: HTMLElement, type: string, pointerType: string, clientX = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(target, event);
}

const heading = () => screen.getByRole('heading', { level: 2 });
const picture = () => screen.getByRole('img');
const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }));

function renderWalkthrough(mode: 'first' | 'replay' = 'first') {
  const onClose = vi.fn();
  const view = render(<Walkthrough mode={mode} onClose={onClose} />);
  return { onClose, ...view };
}

async function toLastSlide() {
  for (let slide = 0; slide < LAST; slide += 1) {
    await next();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  markTutorialSeen.mockResolvedValue({});
  pointerIs(false);
  signIn();
});

afterEach(() => {
  // Unmount first: resetting the store under a mounted guide is an update outside act().
  cleanup();
  resetAuthStore();
});

describe('Walkthrough (onboarding-tutorial.md §5.1)', () => {
  it('opens on slide 1 as a modal dialog with a picture, focus on the heading', () => {
    // Act
    renderWalkthrough();

    // Assert
    expect(screen.getByRole('dialog', { name: 'How BookRough works' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(heading()).toHaveTextContent('Songs that travel');
    expect(heading()).toHaveFocus();
    expect(picture()).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('moves through all six slides, ending in Get started and the reopen hint', async () => {
    // Arrange
    renderWalkthrough();
    expect(screen.queryByText(REOPEN_HINT)).not.toBeInTheDocument();

    // Act & Assert: each slide in order, with its step count and its heading focused
    for (const [position, title] of SLIDE_TITLES.entries()) {
      expect(heading()).toHaveTextContent(title);
      expect(heading()).toHaveFocus();
      expect(screen.getByText(`Step ${position + 1} of 6`)).toBeInTheDocument();
      if (position < LAST) {
        await next();
      }
    }
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
    expect(screen.getByText(REOPEN_HINT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(heading()).toHaveTextContent('Rate what you heard');
  });

  it('gives each slide a picture with its own label and a ringed control', async () => {
    // Arrange
    renderWalkthrough();
    const labels = new Set<string>();

    // Act & Assert
    for (let slide = 0; slide <= LAST; slide += 1) {
      const label = picture().getAttribute('aria-label') ?? '';
      expect(label).toMatch(/marked\.$/);
      labels.add(label);
      const rings = picture().querySelectorAll('[data-ring]');
      expect(rings).toHaveLength(slide === LAST ? 2 : 1);
      // The ring pulses only when motion is welcome (§5.1).
      rings.forEach((ring) => expect(ring.className).toContain('motion-safe:animate-'));
      if (slide < LAST) {
        await next();
      }
    }
    expect(labels.size).toBe(SLIDE_TITLES.length);
  });

  it("draws its pictures: no image file is loaded, only the user's own avatar", async () => {
    // Arrange
    signIn('SPOTIFY', '/api/users/u1/avatar?v=1');
    renderWalkthrough();
    let avatars = 0;

    // Act & Assert
    for (let slide = 0; slide <= LAST; slide += 1) {
      for (const image of picture().querySelectorAll('img')) {
        expect(image.getAttribute('src')).toContain('/api/users/u1/avatar');
        avatars += 1;
      }
      if (slide < LAST) {
        await next();
      }
    }
    // Slides 1 and 6 show "you".
    expect(avatars).toBe(2);
  });

  it.each<[StreamingService | null, string, string]>([
    ['APPLE_MUSIC', 'Apple Music', 'Spotify'],
    ['TIDAL', 'Tidal', 'Spotify'],
    ['SPOTIFY', 'Spotify', 'Apple Music'],
    [null, 'Apple Music', 'Spotify'],
  ])('slide 1 for a %s listener: yours is %s, the friend is on %s', (service, yours, theirs) => {
    // Arrange
    signIn(service);

    // Act
    renderWalkthrough();

    // Assert
    expect(
      screen.getByText(
        `A friend shares a song from ${theirs}. You get it on ${yours}, the service in your profile. Converting a link takes a few seconds.`,
      ),
    ).toBeInTheDocument();
    expect(picture()).toHaveAttribute(
      'aria-label',
      `A post from a friend, with a button to open it on ${yours} marked.`,
    );
    expect(picture().querySelector('[data-ring]')).toHaveTextContent(yours);
  });

  it("shows the user's own initials when they have no photo", () => {
    // Act
    renderWalkthrough();

    // Assert
    expect(picture()).toHaveTextContent('OH');
  });

  it('says Tap and shows the swipe hint on a touch screen', async () => {
    // Arrange
    pointerIs(true);

    // Act
    renderWalkthrough();

    // Assert
    expect(screen.getByText(SWIPE_HINT)).toBeInTheDocument();
    expect(screen.queryByText(KEYS_HINT)).not.toBeInTheDocument();
    await next();
    expect(screen.getByText(/Tap Create community on Home to start one\./)).toBeInTheDocument();
    expect(screen.queryByText(SWIPE_HINT)).not.toBeInTheDocument();
  });

  it('says Click and shows the arrow-keys hint with a mouse', async () => {
    // Act
    renderWalkthrough();

    // Assert
    expect(screen.getByText(KEYS_HINT)).toBeInTheDocument();
    expect(screen.queryByText(SWIPE_HINT)).not.toBeInTheDocument();
    await next();
    expect(screen.getByText(/Click Create community on Home to start one\./)).toBeInTheDocument();
  });

  it('reads a missing matchMedia as a mouse', () => {
    // Arrange
    // @ts-expect-error: some embedded engines have no matchMedia
    window.matchMedia = undefined;

    // Act
    renderWalkthrough();

    // Assert
    expect(screen.getByText(KEYS_HINT)).toBeInTheDocument();
  });

  it('moves with the arrow keys and stops at both ends', async () => {
    // Arrange
    renderWalkthrough();

    // Act & Assert
    await userEvent.keyboard('{ArrowLeft}');
    expect(heading()).toHaveTextContent('Songs that travel');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(heading()).toHaveTextContent('Share a song');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(heading()).toHaveTextContent('Friends and the bell');
    await userEvent.keyboard('{ArrowLeft}');
    expect(heading()).toHaveTextContent('Rate what you heard');
  });

  it('hears the arrow keys with focus outside the dialog, but not with a modifier', () => {
    // Arrange
    renderWalkthrough();
    heading().blur();

    // Act: Alt+Arrow is the browser's back/forward, Ctrl or Meta a text move
    fireEvent.keyDown(document, { key: 'ArrowRight', altKey: true });
    fireEvent.keyDown(document, { key: 'ArrowRight', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'ArrowRight', metaKey: true });

    // Assert
    expect(heading()).toHaveTextContent('Songs that travel');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(heading()).toHaveTextContent('Join or start a community');
  });

  it('turns slides with a touch swipe, but not with a mouse drag', () => {
    // Arrange
    renderWalkthrough();
    const dialog = screen.getByRole('dialog');

    // Act: a mouse drag is text selection
    pointer(dialog, 'pointerdown', 'mouse', 300);
    pointer(dialog, 'pointerup', 'mouse', 100);

    // Assert
    expect(heading()).toHaveTextContent('Songs that travel');

    // Act: a touch swipe left, then right
    pointer(dialog, 'pointerdown', 'touch', 300);
    pointer(dialog, 'pointerup', 'touch', 100);
    expect(heading()).toHaveTextContent('Join or start a community');
    pointer(dialog, 'pointerdown', 'touch', 100);
    pointer(dialog, 'pointerup', 'touch', 300);

    // Assert
    expect(heading()).toHaveTextContent('Songs that travel');
  });

  it('ignores a short or cancelled touch movement', () => {
    // Arrange
    renderWalkthrough();
    const dialog = screen.getByRole('dialog');

    // Act
    pointer(dialog, 'pointerdown', 'touch', 200);
    pointer(dialog, 'pointerup', 'touch', 180);
    pointer(dialog, 'pointerdown', 'touch', 300);
    pointer(dialog, 'pointercancel', 'touch');
    pointer(dialog, 'pointerup', 'touch', 0);

    // Assert
    expect(heading()).toHaveTextContent('Songs that travel');
  });

  it.each([
    ['Skip', () => userEvent.click(screen.getByRole('button', { name: 'Skip' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
    [
      'Get started',
      async () => {
        await toLastSlide();
        await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
      },
    ],
  ])('%s closes it, marks it seen and tells the server once', async (_label, act) => {
    // Arrange
    const { onClose } = renderWalkthrough();

    // Act
    await act();

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().tutorial.walkthrough).toBe(false);
    expect(markTutorialSeen).toHaveBeenCalledTimes(1);
    expect(markTutorialSeen).toHaveBeenCalledWith('walkthrough');
  });

  it.each([
    ['Skip', () => userEvent.click(screen.getByRole('button', { name: 'Skip' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
  ])('%s before the last slide says where to reopen the guide', async (_label, act) => {
    // Arrange
    renderWalkthrough();
    await next();

    // Act
    await act();

    // Assert
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(REOPEN_HINT);
  });

  it.each([
    [
      'Get started',
      async () => {
        await toLastSlide();
        await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
      },
    ],
    [
      'Skip on the last slide',
      async () => {
        await toLastSlide();
        await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
      },
    ],
  ])('%s shows no reopen toast: the hint is already on screen', async (_label, act) => {
    // Arrange
    renderWalkthrough();

    // Act
    await act();

    // Assert
    expect(toast).not.toHaveBeenCalled();
  });

  it('still closes when the server cannot be told, with no error shown', async () => {
    // Arrange
    markTutorialSeen.mockRejectedValue(new Error('offline'));
    const { onClose } = renderWalkthrough();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(useAuthStore.getState().tutorial.walkthrough).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('records nothing and shows no toast in replay mode', async () => {
    // Arrange
    const { onClose } = renderWalkthrough('replay');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(markTutorialSeen).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(useAuthStore.getState().tutorial.walkthrough).toBe(true);
  });

  it('keeps Tab inside the dialog and locks the page scroll until it closes', async () => {
    // Arrange
    const { unmount } = renderWalkthrough('replay');
    await next();
    expect(document.body.style.overflow).toBe('hidden');

    // Act & Assert: forward from the last button wraps to Skip
    screen.getByRole('button', { name: 'Next' }).focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveFocus();
    // and backward from Skip wraps to the last button
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();

    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
