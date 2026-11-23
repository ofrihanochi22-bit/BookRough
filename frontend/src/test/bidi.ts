/**
 * Test helpers for user text that keeps its own direction
 * (docs/features/manual-test-fixes-1122.md §5.1). Names inside English
 * sentences are wrapped in `<bdi>` or in the isolate marks U+2068 … U+2069, so
 * a sentence can span several text nodes and carry invisible characters. These
 * helpers let a test assert on the words a person reads.
 */

const ISOLATES = /[\u2068\u2069]/g;

/** The text without isolate marks. */
export function plain(text: string | null | undefined): string {
  return (text ?? '').replace(ISOLATES, '');
}

function matches(text: string, expected: string | RegExp): boolean {
  return typeof expected === 'string' ? text === expected : expected.test(text);
}

/**
 * A `getByText` matcher for a sentence that may be split by `<bdi>` or carry
 * isolate marks: the innermost element whose whole text, without marks, is
 * `expected`.
 */
export function readsAs(expected: string | RegExp) {
  return (_content: string, element: Element | null): boolean => {
    if (!element || !matches(plain(element.textContent).trim(), expected)) return false;
    return !Array.from(element.children).some((child) =>
      matches(plain(child.textContent).trim(), expected),
    );
  };
}

/** An accessible-name matcher (`{ name: named(...) }`) that ignores isolate marks. */
export function named(expected: string | RegExp) {
  return (name: string): boolean =>
    typeof expected === 'string' ? plain(name) === expected : expected.test(plain(name));
}
