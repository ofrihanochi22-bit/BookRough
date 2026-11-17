import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdatePrompt } from './UpdatePrompt';

interface RegisterOptions {
  onRegisteredSW: (url: string, registration: ServiceWorkerRegistration) => void;
  onNeedRefresh: () => void;
}

const { useRegisterSW, updateServiceWorker } = vi.hoisted(() => ({
  useRegisterSW: vi.fn(),
  updateServiceWorker: vi.fn(),
}));
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW }));

const MESSAGE = /A new version of BookRough is ready/;

function renderPrompt(needRefresh: boolean) {
  useRegisterSW.mockReturnValue({ needRefresh: [needRefresh], updateServiceWorker });
  const view = render(<UpdatePrompt />);
  const options = useRegisterSW.mock.calls[0]?.[0] as RegisterOptions;
  return { ...view, options };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('UpdatePrompt', () => {
  it('shows nothing when no new version is waiting', () => {
    // Act
    renderPrompt(false);

    // Assert
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('offers Reload, which activates the waiting version', async () => {
    // Arrange
    renderPrompt(true);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    // Assert
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('✕ hides it, and a newer version offers it again', async () => {
    // Arrange
    const { options } = renderPrompt(true);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss update' }));

    // Assert
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();

    // Act
    act(() => options.onNeedRefresh());

    // Assert
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
  });

  it('looks for a new version when the app returns to the foreground, not when it leaves', () => {
    // Arrange
    const update = vi.fn().mockResolvedValue(undefined);
    const { options } = renderPrompt(false);
    act(() => options.onRegisteredSW('/sw.js', { update } as unknown as ServiceWorkerRegistration));

    // Act
    setVisibility('hidden');

    // Assert
    expect(update).not.toHaveBeenCalled();

    // Act
    setVisibility('visible');

    // Assert
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('ignores a failed check, as when offline', async () => {
    // Arrange
    const update = vi.fn().mockRejectedValue(new Error('offline'));
    const { options } = renderPrompt(false);
    act(() => options.onRegisteredSW('/sw.js', { update } as unknown as ServiceWorkerRegistration));

    // Act
    setVisibility('visible');

    // Assert
    await expect(update.mock.results[0]?.value).rejects.toThrow('offline');
  });

  it('stops listening once unmounted', () => {
    // Arrange
    const update = vi.fn().mockResolvedValue(undefined);
    const { options, unmount } = renderPrompt(false);
    act(() => options.onRegisteredSW('/sw.js', { update } as unknown as ServiceWorkerRegistration));

    // Act
    unmount();
    setVisibility('visible');

    // Assert
    expect(update).not.toHaveBeenCalled();
  });
});
