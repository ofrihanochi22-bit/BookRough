/**
 * The deterministic parts of a generated avatar (CLAUDE.md §8).
 *
 * The hues are fixed data, not theme tokens: an avatar must look the same for
 * everyone, in either colour scheme.
 */
const HUES = [262, 14, 168, 330, 200, 38, 120, 290];

/** Same id, same colour — always. */
export function avatarHue(id: string): number {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return HUES[hash % HUES.length] ?? HUES[0]!;
}

/** A letter, digit or emoji — what an initial may be. Punctuation never is. */
const INITIAL = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

/**
 * Up to two initials, the first letter, digit or emoji of each word; works for
 * any script. Leading punctuation is skipped ("(Friday) Jazz" → "FJ") and a
 * word with no such character ("&") contributes nothing.
 */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((word) => Array.from(word).find((char) => INITIAL.test(char)))
    .filter((letter): letter is string => letter !== undefined);
  return letters.slice(0, 2).join('').toUpperCase();
}
