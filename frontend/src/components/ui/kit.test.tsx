import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { CommunityCover } from './CommunityCover';
import { EmptyState } from './EmptyState';
import { fieldClass } from './field';
import { LoadError } from './LoadError';
import { Sheet } from './Sheet';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { Wordmark } from './Wordmark';

/**
 * The UI kit — docs/features/ui-redesign.md §5.0c. One file for the look of
 * the small kit pieces; their behaviour is covered by the screens that use them.
 */

describe('Button', () => {
  it('styles each meaning: primary accent, secondary outline, rating sticker, destructive danger', () => {
    // Act
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="rating">Rating</Button>
        <Button variant="destructive">Destructive</Button>
      </>,
    );

    // Assert
    expect(screen.getByRole('button', { name: 'Primary' }).className).toContain('bg-accent');
    expect(screen.getByRole('button', { name: 'Secondary' }).className).toContain('border-line');
    expect(screen.getByRole('button', { name: 'Rating' }).className).toContain('bg-sticker');
    expect(screen.getByRole('button', { name: 'Destructive' }).className).toContain(
      'bg-danger-soft',
    );
  });

  it('an offline button is disabled, dashed and muted, whatever its meaning', async () => {
    // Arrange
    const onClick = vi.fn();
    render(
      <Button offline onClick={onClick}>
        Post
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Post' });

    // Act
    await userEvent.click(button);

    // Assert
    expect(button).toBeDisabled();
    expect(button.className).toContain('border-dashed');
    expect(button.className).toContain('text-muted');
    expect(button.className).not.toContain('bg-accent');
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Text field look', () => {
  it('has a 1.5px line border, and a danger border on error', () => {
    // Act & Assert
    expect(fieldClass(false)).toContain('border-[1.5px]');
    expect(fieldClass(false)).toContain('border-line');
    expect(fieldClass(true)).toContain('border-danger');
    expect(fieldClass(true)).not.toContain('border-line');
  });
});

describe('Loading, error and empty states', () => {
  it('the spinner is the cassette with spinning reels, still announcing its label', () => {
    // Act
    render(<Spinner label="Opening BookRough…" />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Opening BookRough…');
    expect(screen.getByTestId('reel-cassette')).toHaveAttribute('data-spinning', 'true');
  });

  it('a skeleton is a static block, with no pulse', () => {
    // Act
    const { container } = render(<Skeleton className="h-11" />);

    // Assert
    const block = container.firstElementChild!;
    expect(block.className).toContain('bg-skeleton');
    expect(block.className).not.toContain('animate-pulse');
  });

  it('a load error is a quiet row with its message and Try again', async () => {
    // Arrange
    const onRetry = vi.fn();
    render(<LoadError message="Couldn't load your friends." onRetry={onRetry} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your friends.");
    expect(screen.getByRole('alert').className).toContain('bg-surface');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('an empty state has a still cassette, the heading, one line and the action', () => {
    // Act
    render(
      <EmptyState title="No friends yet" action={<a href="/search">Search</a>}>
        Find people to follow.
      </EmptyState>,
    );

    // Assert
    expect(screen.getByText('No friends yet')).toBeInTheDocument();
    expect(screen.getByText('Find people to follow.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByTestId('reel-cassette')).not.toHaveAttribute('data-spinning');
  });
});

describe('Sheet', () => {
  it('has a grab handle and, in steps, a Back arrow that returns one step', async () => {
    // Arrange
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <Sheet title="Choose a community" onClose={onClose} onBack={onBack}>
        <p>Rows</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Choose a community' });

    // Act
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));

    // Assert
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.className).toContain('rounded-t-[22px]');
    expect(dialog.querySelector('.bg-line.rounded-full')).not.toBeNull();
  });

  it('has no Back arrow without onBack', () => {
    // Act
    render(
      <Sheet title="Post options" onClose={vi.fn()}>
        <p>Rows</p>
      </Sheet>,
    );

    // Assert
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('CommunityCover (ui-redesign.md §3.5)', () => {
  const ID = '0b7f6c2e-9d4a-4c1e-8a35-5f2d9e1b7c40';
  /** hsl(240 6% 70%) as jsdom serialises it. */
  const NEUTRAL = 'rgb(174, 174, 183)';

  it('is a decorative cassette: the name on a tape label under a stripe band in its hue', () => {
    // Act
    render(<CommunityCover id={ID} name="Friday Jazz" variant="banner" />);

    // Assert
    const cover = screen.getByTestId('community-cover');
    expect(cover).toHaveAttribute('aria-hidden', 'true');
    expect(cover.className).toContain('bg-tape');
    expect(cover).toHaveTextContent('Friday Jazz');
    // Coloured, not the neutral greys of a community that does not exist yet.
    expect(within(cover).getByTestId('cover-stripe').innerHTML).toContain('background-color');
    expect(within(cover).getByTestId('cover-stripe').innerHTML).not.toContain(NEUTRAL);
  });

  it('keeps the same hue for the same id', () => {
    // Act
    render(
      <>
        <CommunityCover id={ID} name="A" variant="card" />
        <CommunityCover id={ID} name="B" variant="thumb" />
      </>,
    );

    // Assert
    const [first, second] = screen.getAllByTestId('cover-stripe');
    expect(first!.innerHTML).toBe(second!.innerHTML);
  });

  it('is a blank, neutral cassette before the community exists', () => {
    // Act
    render(<CommunityCover id={null} name="" variant="banner" />);

    // Assert
    const cover = screen.getByTestId('community-cover');
    expect(cover).toHaveTextContent('♪');
    expect(within(cover).getByTestId('cover-stripe').innerHTML).toContain(NEUTRAL);
  });

  it('a thumb is a mini cassette with no name', () => {
    // Act
    render(<CommunityCover id={ID} name="Friday Jazz" variant="thumb" />);

    // Assert
    expect(screen.getByTestId('community-cover')).not.toHaveTextContent('Friday Jazz');
  });
});

describe('Wordmark (ui-redesign.md §3.8)', () => {
  it('hero: the mark above the word, which is the page heading, read once', () => {
    // Act
    render(<Wordmark variant="hero" />);

    // Assert
    expect(screen.getByRole('heading', { level: 1, name: 'BookRough' })).toBeInTheDocument();
    expect(screen.getByTestId('cassette-mark')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByText('BookRough')).toHaveLength(1);
  });

  it('compact: one row, not a heading and not a link', () => {
    // Act
    render(<Wordmark variant="compact" />);

    // Assert
    expect(screen.getByText('BookRough')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('cassette-mark')).toHaveAttribute('aria-hidden', 'true');
  });

  it('the mark keeps its fixed orange and yellow, never the accent', () => {
    // Act
    render(<Wordmark variant="compact" />);

    // Assert
    const mark = screen.getByTestId('cassette-mark');
    expect(mark.innerHTML).toContain('#FF5A36');
    expect(mark.innerHTML).toContain('#FFC93C');
    expect(mark.innerHTML).toContain('#C23A17');
    expect(mark.innerHTML).not.toContain('accent');
  });
});
