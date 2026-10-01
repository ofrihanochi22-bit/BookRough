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

/** Up to two letters, first of each word; works for any script. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? '');
  return letters.join('').toUpperCase();
}
