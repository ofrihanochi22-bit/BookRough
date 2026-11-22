import { describe, expect, it } from 'vitest';

/**
 * The guard behind D3 (docs/features/manual-test-fixes-1122.md §5.2): every
 * link that leaves BookRough goes through `ExternalLink`, which always opens a
 * new tab. A raw `<a>` anywhere else fails here, so a future link can't forget.
 * Internal navigation uses React Router's `<Link>`, which this doesn't match.
 * The sources are read through Vite's glob import, so no Node API is needed.
 */

const ALLOWED = './components/ExternalLink.tsx';

const SOURCES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** True when the source writes a raw anchor element. */
function hasRawAnchor(source: string): boolean {
  return /<a[\s>]/.test(source);
}

describe('external links', () => {
  it('are written only in ExternalLink.tsx', () => {
    // Arrange
    const files = Object.keys(SOURCES);

    // Act
    const offenders = files.filter((file) => file !== ALLOWED && hasRawAnchor(SOURCES[file]!));

    // Assert
    expect(files).toContain(ALLOWED);
    expect(files.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });

  it('the matcher catches a raw anchor', () => {
    // Act / Assert
    expect(hasRawAnchor('<a href={url}>Open</a>')).toBe(true);
    expect(hasRawAnchor('<a\n  href={url}\n>')).toBe(true);
  });

  it('the matcher ignores router links and other elements', () => {
    // Act / Assert
    expect(hasRawAnchor('<Link to="/home">Home</Link>')).toBe(false);
    expect(hasRawAnchor('<article className="card">')).toBe(false);
    expect(hasRawAnchor('<aside>')).toBe(false);
  });
});
