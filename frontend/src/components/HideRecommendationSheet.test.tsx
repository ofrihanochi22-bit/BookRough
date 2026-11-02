import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpError, makePost, networkError } from '../test/fixtures';
import { HideRecommendationSheet } from './HideRecommendationSheet';

const { hideRecommendation, toastSuccess } = vi.hoisted(() => ({
  hideRecommendation: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('../api/recommendations', () => ({ hideRecommendation }));
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: vi.fn() } }));

const POST = makePost({ id: 'post-1' });

function renderSheet() {
  const onClose = vi.fn();
  const onHidden = vi.fn();
  render(<HideRecommendationSheet post={POST} onClose={onClose} onHidden={onHidden} />);
  return { onClose, onHidden };
}

const confirm = () => screen.getByRole('button', { name: 'Hide' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('HideRecommendationSheet', () => {
  it('says the sender is not told, hides on confirm and toasts', async () => {
    // Arrange
    const user = userEvent.setup();
    hideRecommendation.mockResolvedValue(undefined);
    const { onHidden } = renderSheet();

    // Act
    expect(screen.getByText("Hide this from Received? Dana won't be told.")).toBeInTheDocument();
    await user.click(confirm());

    // Assert
    expect(hideRecommendation).toHaveBeenCalledWith('post-1');
    expect(onHidden).toHaveBeenCalledWith('post-1');
    expect(toastSuccess).toHaveBeenCalledWith('Hidden from Received');
  });

  it('Cancel closes without a request', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    // Act
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(onClose).toHaveBeenCalled();
    expect(hideRecommendation).not.toHaveBeenCalled();
  });

  it('a post already deleted simply leaves the list', async () => {
    // Arrange
    const user = userEvent.setup();
    hideRecommendation.mockRejectedValue(httpError(404, 'Post not found.'));
    const { onHidden } = renderSheet();

    // Act
    await user.click(confirm());

    // Assert
    expect(onHidden).toHaveBeenCalledWith('post-1');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('shows a failure inline and stays open', async () => {
    // Arrange
    const user = userEvent.setup();
    hideRecommendation.mockRejectedValue(networkError());
    const { onHidden } = renderSheet();

    // Act
    await user.click(confirm());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't hide this.");
    expect(onHidden).not.toHaveBeenCalled();
  });
});
