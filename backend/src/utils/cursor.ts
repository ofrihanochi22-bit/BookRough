import { AppError } from './AppError.js';

/** One page of every keyset-paginated list: feed, Received, Sent, notifications. */
export const PAGE_SIZE = 20;

export interface Cursor {
  createdAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(post: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify([post.createdAt.toISOString(), post.id])).toString('base64url');
}

/** Opaque to clients; anything that does not decode cleanly is a 422. */
export function decodeCursor(raw: string): Cursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (Array.isArray(value) && value.length === 2) {
      const [createdAt, id] = value as unknown[];
      const date = typeof createdAt === 'string' ? new Date(createdAt) : null;
      if (date && !Number.isNaN(date.getTime()) && typeof id === 'string' && UUID.test(id)) {
        return { createdAt: date, id };
      }
    }
  } catch {
    // Falls through to the 422.
  }
  throw new AppError('The request query is invalid.', 422);
}

/** The keyset filter for rows ordered by createdAt, then id, both descending. */
export function beforeCursor(cursor: Cursor) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}
