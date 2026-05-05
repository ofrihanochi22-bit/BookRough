/**
 * Module augmentation that adds `user` to Express's Request interface.
 *
 * This is the single source for `req.user` typing.  The requireAuth
 * middleware populates it; controllers and services can rely on it being
 * present whenever they're called via a protected route.
 */

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export {};
