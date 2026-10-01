import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('is a non-submitting button that fires onClick', async () => {
    // Arrange
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('cannot be pressed again while busy', async () => {
    // Arrange
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Saving…
      </Button>,
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Saving…' }));

    // Assert
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true');
  });
});
