import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COPIED, SAFARI_DID_NOT_OPEN, SAFARI_WAIT_MS, browser } from '../lib/openInSafari';
import { OpenInBrowserSheet } from './OpenInBrowserSheet';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: toastError } }));

const LINK = 'https://bandcamp.com/album/x';

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

function renderSheet(href = LINK) {
  const onClose = vi.fn();
  const onChosen = vi.fn();
  render(<OpenInBrowserSheet href={href} onClose={onClose} onChosen={onChosen} />);
  return { onClose, onChosen };
}

describe('OpenInBrowserSheet (open-in-safari.md §5.3)', () => {
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    open = vi.spyOn(browser, 'open').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    open.mockRestore();
  });

  it('asks before opening, with Safari, Copy link and Cancel', () => {
    // Act
    renderSheet();

    // Assert
    const sheet = screen.getByRole('dialog', { name: 'Open in browser?' });
    expect(sheet).toHaveTextContent('so the music keeps playing while you use BookRough');
    expect(screen.getByRole('button', { name: 'Open in Safari' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('Open in Safari hands the link to Safari and closes', () => {
    // Arrange
    vi.useFakeTimers();
    const { onClose } = renderSheet();

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Open in Safari' }));

    // Assert
    expect(open).toHaveBeenCalledWith(`x-safari-${LINK}`);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('says nothing when the app leaves the screen', () => {
    // Arrange
    vi.useFakeTimers();
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Open in Safari' }));

    // Act
    window.dispatchEvent(new Event('blur'));
    act(() => vi.advanceTimersByTime(SAFARI_WAIT_MS));

    // Assert
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says Safari didn't open when the app is still on screen after the wait", () => {
    // Arrange
    vi.useFakeTimers();
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Open in Safari' }));

    // Act
    act(() => vi.advanceTimersByTime(SAFARI_WAIT_MS));

    // Assert
    expect(toastError).toHaveBeenCalledWith(SAFARI_DID_NOT_OPEN);
  });

  it('Copy link copies the original address, toasts and closes', async () => {
    // Arrange
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { onClose, onChosen } = renderSheet();
    stubClipboard(writeText);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    // Assert
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(onChosen).toHaveBeenCalledOnce();
    expect(toastSuccess).toHaveBeenCalledWith(COPIED);
    expect(onClose).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  it('shows the link to copy by hand when the clipboard is refused', async () => {
    // Arrange
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const { onClose } = renderSheet();
    stubClipboard(writeText);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    // Assert
    const field = await screen.findByRole('textbox', {
      name: 'Copy this link and paste it in Safari.',
    });
    expect(field).toHaveValue(LINK);
    expect(field).toHaveAttribute('readonly');
    await vi.waitFor(() => expect(field).toHaveFocus());
    expect(onClose).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('Cancel closes and opens nothing', async () => {
    // Arrange
    const { onClose, onChosen } = renderSheet();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(onClose).toHaveBeenCalledOnce();
    expect(onChosen).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('offers only Copy link and Cancel for a link Safari cannot be handed', () => {
    // Act
    renderSheet('mailto:someone@example.com');

    // Assert
    expect(screen.queryByRole('button', { name: 'Open in Safari' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
