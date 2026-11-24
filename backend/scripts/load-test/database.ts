/**
 * The load-test database: seeded senders and recipients, and the check that
 * every saved post is really there (docs/features/load-test.md §3, §4.3).
 */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

import { displayNameKey } from '../../src/services/displayName.js';
import { assertLoadTestDatabase, GOOGLE_SUB_PREFIX } from './config.js';
import type { DbCheck } from './types.js';

export interface Pair {
  senderId: string;
  recipientId: string;
  /** The `Cookie` header for the sender's session. */
  cookie: string;
}

/** Long enough for a full run, short enough to be useless afterwards. */
const SESSION_TTL = '3h';

export class LoadTestDatabase {
  private readonly prisma: PrismaClient;

  constructor(url: string) {
    assertLoadTestDatabase(url);
    this.prisma = new PrismaClient({ datasources: { db: { url } } });
  }

  /**
   * `count` senders, each an accepted friend of their own recipient, both
   * onboarded. The session is signed the way src/utils/jwt.ts signs one.
   */
  async seed(count: number, jwtSecret: string): Promise<Pair[]> {
    const pairs = Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return {
        n,
        senderId: randomUUID(),
        recipientId: randomUUID(),
      };
    });

    const user = (id: string, role: 'sender' | 'recipient', n: string) => {
      const displayName = `Load ${role} ${n}`;
      return {
        id,
        googleSub: `${GOOGLE_SUB_PREFIX}${role}-${n}`,
        displayName,
        displayNameKey: displayNameKey(displayName),
        preferredService: 'SPOTIFY' as const,
      };
    };

    await this.prisma.user.createMany({
      data: pairs.flatMap((p) => [
        user(p.senderId, 'sender', p.n),
        user(p.recipientId, 'recipient', p.n),
      ]),
    });
    await this.prisma.friend.createMany({
      data: pairs.map((p) => ({
        requesterId: p.senderId,
        addresseeId: p.recipientId,
        status: 'ACCEPTED' as const,
      })),
    });

    return pairs.map((p) => ({
      senderId: p.senderId,
      recipientId: p.recipientId,
      cookie: `token=${jwt.sign({}, jwtSecret, {
        algorithm: 'HS256',
        subject: p.senderId,
        expiresIn: SESSION_TTL,
      })}`,
    }));
  }

  /** Compares the database with the 201s: none missing, none extra. */
  async check(expected: number, savedIds: readonly string[]): Promise<DbCheck> {
    const found = await this.prisma.post.count();
    const present = await this.prisma.post.count({ where: { id: { in: [...savedIds] } } });
    return { expected, found, missing: savedIds.length - present };
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
