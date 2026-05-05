/**
 * Root API router — mounts every feature router under /api.
 *
 * This is the single hub imported by app.ts. Adding a new feature only
 * requires adding one line here, not touching app.ts every time.
 *
 * Current mounts:
 *   GET  /api/health          → healthRouter
 *
 * Future mounts (added as phases complete):
 *   POST /api/auth/*          → authRouter       (Phase 1)
 *   *    /api/users/*         → usersRouter      (Phase 1)
 *   *    /api/communities/*   → communitiesRouter (Phase 2)
 *   *    /api/posts/*         → postsRouter      (Phase 3)
 *   *    /api/friends/*       → friendsRouter    (Phase 5)
 */

import { Router } from "express";
import { healthRouter } from "./health.js";
import { authRouter } from "./auth.js";
import { usersRouter } from "./users.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
