import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppToaster } from './AppToaster';

const { Toaster } = vi.hoisted(() => ({ Toaster: vi.fn((_props: unknown) => null) }));
vi.mock('react-hot-toast', () => ({ Toaster }));

beforeEach(() => Toaster.mockClear());

describe('AppToaster (ui-redesign.md §5.0c)', () => {
  it('is a note on tape paper with tape-ink text, top-centre', () => {
    // Act
    render(<AppToaster />);

    // Assert
    const props = Toaster.mock.calls.at(-1)![0] as {
      position: string;
      toastOptions: { style: Record<string, string> };
    };
    expect(props.position).toBe('top-center');
    expect(props.toastOptions.style).toMatchObject({
      background: 'var(--tape)',
      color: 'var(--tape-ink)',
    });
  });
});
