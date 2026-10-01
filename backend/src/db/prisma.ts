import { PrismaClient } from '@prisma/client';

/**
 * The one PrismaClient for the process. Prisma is the only thing that touches
 * the database (CLAUDE.md §4), and each client owns a connection pool, so a
 * second instance would only waste connections.
 */
export const prisma = new PrismaClient();
