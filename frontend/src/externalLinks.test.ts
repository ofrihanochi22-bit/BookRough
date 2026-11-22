import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guard behind D3 (docs/features/manual-test-fixes-1122.md §5.2): every
 * link that leaves BookRough goes through `ExternalLink`, which always opens a
 * new tab. A raw `<a>` anywhere else fails here, so a future link can't forget.
 * Internal navigation uses React Router's `<Link>`, which this doesn't match.
 */

const SRC = __dirname;
const ALLOWED = 'components/ExternalLink.tsx';

/** True when the source writes a raw anchor element. */
function hasRawAnchor(source: string): boolean {
  return /<a[\s>]/.test(source);
}

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => relative(SRC, join(SRC, file)).replaceAll('\\', '/'));
}

describe('external links', () => {
  it('are written only in ExternalLink.tsx', () => {
    // Arrange
    const files = sourceFiles();

    // Act
    const offenders = files.filter(
      (file) => file !== ALLOWED && hasRawAnchor(readFileSync(join(SRC, file), 'utf8')),
    );

    // Assert
    expect(files).toContain(ALLOWED);
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
