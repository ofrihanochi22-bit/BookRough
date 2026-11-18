import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from '../test/db.js';
import { signSessionToken } from '../utils/jwt.js';

/*
 * The data-only migration that shows the illustrated guide once to everyone —
 * docs/features/onboarding-tutorial.md §3.1. The suite's `migrate reset` has
 * already applied it to an empty database; here its SQL runs again over
 * seeded users, as it ran over production's.
 */
const RESET_SQL = readFileSync(
  fileURLToPath(
    new URL(
      '../../prisma/migrations/20261116120000_reset_walkthrough_for_guide/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const app = createApp();
const SEEN = new Date('2026-11-12T09:00:00.000Z');

async function seedUser(googleSub: string, onboarded: boolean) {
  return prisma.user.create({
    data: {
      googleSub,
      ...(onboarded
        ? { displayName: googleSub, displayNameKey: googleSub, preferredService: 'SPOTIFY' }
        : {}),
      walkthroughSeenAt: SEEN,
      saveTipSeenAt: SEEN,
      listTipSeenAt: SEEN,
    },
  });
}

function sessionOf(userId: string) {
  return request(app)
    .get('/api/auth/me')
    .set('Cookie', `token=${signSessionToken(userId)}`);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('reset_walkthrough_for_guide', () => {
  it('clears the walkthrough for a user who closed the old cards, and keeps both tips', async () => {
    // Arrange
    const user = await seedUser('dana', true);

    // Act
    await prisma.$executeRawUnsafe(RESET_SQL);

    // Assert
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.walkthroughSeenAt).toBeNull();
    expect(after.saveTipSeenAt).toEqual(SEEN);
    expect(after.listTipSeenAt).toEqual(SEEN);
    const response = await sessionOf(user.id);
    expect(response.body.data.tutorial).toEqual({
      walkthrough: true,
      saveTip: false,
      listTip: false,
    });
  });

  it('still shows nothing to a user who has not finished onboarding', async () => {
    // Arrange
    const user = await seedUser('newcomer', false);

    // Act
    await prisma.$executeRawUnsafe(RESET_SQL);

    // Assert
    const response = await sessionOf(user.id);
    expect(response.body.data.needsOnboarding).toBe(true);
    expect(response.body.data.tutorial).toEqual({
      walkthrough: false,
      saveTip: false,
      listTip: false,
    });
  });
});
