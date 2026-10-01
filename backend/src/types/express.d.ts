import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`; present on every route mounted behind it. */
      user?: User;
    }
  }
}

export {};
