import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WALKTHROUGH_CARDS } from '../lib/tutorialCopy';
import { useAuthStore } from '../stores/auth';
import { makeSession, resetAuthStore } from '../test/fixtures';
import { Walkthrough } from './Walkthrough';

const { markTutorialSeen } = vi.hoisted(() => ({ markTutorialSeen: vi.fn() }));
vi.mock('../api/users', () => ({ markTutorialSeen }));

/** jsdom has no PointerEvent: a MouseEvent of the pointer type, given a pointerType, reaches React. */
function pointer(target: HTMLElement, type: string, pointerType: string, clientX = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(target, event);
}

const heading = () => screen.getByRole('heading', { level: 2 });

function renderWalkthrough(mode: 'first' | 'replay' = 'first') {
  const onClose = vi.fn();
  const view = render(<Walkthrough mode={mode} onClose={onClose} />);
  return { onClose, ...view };
}

async function toLastCard() {
  for (let card = 1; card < WALKTHROUGH_CARDS.length; card += 1) {
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  markTutorialSeen.mockResolvedValue({});
  useAuthStore
    .getState()
    .setSession(makeSession({ tutorial: { walkthrough: true, saveTip: true, listTip: true } }));
});

afterEach(() => {
  resetAuthStore();
});

describe('Walkthrough (onboarding-tutorial.md §5.1)', () => {
  it('opens on card 1 as a modal dialog, with focus on the heading', () => {
    // Act
    renderWalkthrough();

    // Assert
    expect(screen.getByRole('dialog', { name: 'How BookRough works' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(heading()).toHaveTextContent('Welcome to BookRough');
    expect(heading()).toHaveFocus();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('moves through all five cards with Next and Back, ending in Get started', async () => {
    // Arrange
    renderWalkthrough();

    // Act
    await toLastCard();

    // Assert
    expect(heading()).toHaveTextContent('Friends and notifications');
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(heading()).toHaveTextContent('Save, listen, rate');
  });

  it('moves with the arrow keys and stops at both ends', async () => {
    // Arrange
    renderWalkthrough();

    // Act & Assert
    await userEvent.keyboard('{ArrowLeft}');
    expect(heading()).toHaveTextContent('Welcome to BookRough');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(heading()).toHaveTextContent('Links that travel');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(heading()).toHaveTextContent('Friends and notifications');
  });

  it('turns cards with a touch swipe, but not with a mouse drag', () => {
    // Arrange
    renderWalkthrough();
    const dialog = screen.getByRole('dialog');

    // Act: a mouse drag is text selection
    pointer(dialog, 'pointerdown', 'mouse', 300);
    pointer(dialog, 'pointerup', 'mouse', 100);

    // Assert
    expect(heading()).toHaveTextContent('Welcome to BookRough');

    // Act: a touch swipe left, then right
    pointer(dialog, 'pointerdown', 'touch', 300);
    pointer(dialog, 'pointerup', 'touch', 100);
    expect(heading()).toHaveTextContent('Share a song');
    pointer(dialog, 'pointerdown', 'touch', 100);
    pointer(dialog, 'pointerup', 'touch', 300);

    // Assert
    expect(heading()).toHaveTextContent('Welcome to BookRough');
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
    expect(heading()).toHaveTextContent('Welcome to BookRough');
  });

  it.each([
    ['Skip', () => userEvent.click(screen.getByRole('button', { name: 'Skip' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
    [
      'Get started',
      async () => {
        await toLastCard();
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

  it('records nothing in replay mode', async () => {
    // Arrange
    const { onClose } = renderWalkthrough('replay');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(markTutorialSeen).not.toHaveBeenCalled();
    expect(useAuthStore.getState().tutorial.walkthrough).toBe(true);
  });

  it('keeps Tab inside the dialog and locks the page scroll until it closes', async () => {
    // Arrange
    const { unmount } = renderWalkthrough('replay');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
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
