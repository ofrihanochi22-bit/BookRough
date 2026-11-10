import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setDesign } from '../test/fixtures';
import { AppToaster } from './AppToaster';

const { Toaster } = vi.hoisted(() => ({ Toaster: vi.fn((_props: unknown) => null) }));
vi.mock('react-hot-toast', () => ({ Toaster }));

beforeEach(() => Toaster.mockClear());
afterEach(() => setDesign('current'));

describe('AppToaster (ui-redesign.md §5.0c)', () => {
  it('keeps the library look under Current, top-centre', () => {
    // Act
    render(<AppToaster />);

    // Assert
    expect(Toaster).toHaveBeenCalledWith(
      { position: 'top-center', toastOptions: undefined },
      undefined,
    );
  });

  it('is a note on tape paper with tape-ink text under Mixtape', () => {
    // Arrange
    setDesign('mixtape');

    // Act
    render(<AppToaster />);

    // Assert
    const props = Toaster.mock.calls.at(-1)![0] as {
      toastOptions: { style: Record<string, string> };
    };
    expect(props.toastOptions.style).toMatchObject({
      background: 'var(--tape)',
      color: 'var(--tape-ink)',
    });
  });
});
