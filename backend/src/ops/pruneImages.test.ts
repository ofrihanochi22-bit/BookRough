import { describe, expect, it } from 'vitest';

import { planPrune, type RegistryImage } from './pruneImages.js';

/* docs/features/production-hardening.md §3.8: every guard of the registry prune. */
const SHA = 'f78a80f0123456789abcdef0123456789abcdef0';
const OPTIONS = { keep: 4, currentSha: SHA, maxDeletes: 10 };

function image(day: number, tags: string[] = [`commit${day}`]): RegistryImage {
  return {
    id: `image_${day}`,
    createdAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    tags,
  };
}

const ids = (images: RegistryImage[]) => images.map((entry) => entry.id);

describe('planPrune', () => {
  it('keeps the 4 newest of 7 tagged images and removes the 3 oldest', () => {
    // Arrange — deliberately out of order
    const images = [3, 7, 1, 5, 2, 6, 4].map((day) => image(day));

    // Act
    const plan = planPrune(images, OPTIONS);

    // Assert
    expect(ids(plan.keep)).toEqual(['image_7', 'image_6', 'image_5', 'image_4']);
    expect(ids(plan.remove)).toEqual(['image_3', 'image_2', 'image_1']);
  });

  it.each([0, 1, 4])('deletes nothing when there are %i tagged images', (count) => {
    // Arrange
    const images = Array.from({ length: count }, (_, index) => image(index + 1));

    // Act & Assert
    expect(planPrune(images, OPTIONS).remove).toEqual([]);
  });

  it('never plans an untagged entry, which can belong to a kept image', () => {
    // Arrange
    const images = [...[1, 2, 3, 4, 5].map((day) => image(day)), image(0, []), image(6, [])];

    // Act
    const plan = planPrune(images, OPTIONS);

    // Assert
    expect(plan.untagged).toBe(2);
    expect(ids(plan.remove)).toEqual(['image_1']);
  });

  it.each([SHA, SHA.slice(0, 7)])(
    "keeps the current commit's image even when it is old (tag %s)",
    (tag) => {
      // Arrange
      const images = [image(1, [tag]), ...[2, 3, 4, 5, 6].map((day) => image(day))];

      // Act
      const plan = planPrune(images, OPTIONS);

      // Assert
      expect(ids(plan.remove)).toEqual(['image_2']);
      expect(ids(plan.keep)).toContain('image_1');
    },
  );

  it('does not treat a short tag that merely starts the SHA as the commit', () => {
    // Arrange — "f78" is too short to name a commit
    const images = [image(1, ['f78']), ...[2, 3, 4, 5].map((day) => image(day))];

    // Act & Assert
    expect(ids(planPrune(images, OPTIONS).remove)).toEqual(['image_1']);
  });

  it('throws, deleting nothing, on an unreadable createdAt', () => {
    // Arrange
    const images = [
      ...[1, 2, 3, 4, 5].map((day) => image(day)),
      { ...image(6), createdAt: 'soon' },
    ];

    // Act & Assert
    expect(() => planPrune(images, OPTIONS)).toThrowError(/unreadable createdAt; deleting nothing/);
  });

  it('refuses to delete more than the per-run limit', () => {
    // Arrange — 15 tagged images would mean 11 deletions
    const images = Array.from({ length: 15 }, (_, index) => image(index + 1));

    // Act & Assert
    expect(() => planPrune(images, OPTIONS)).toThrowError(/Refusing to delete 11 images/);
  });
});
