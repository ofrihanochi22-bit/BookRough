/**
 * Users router — mounted at /api/users in routes/index.ts.
 *
 * PATCH /me/onboarding — completes a Google-signup user's profile
 */

import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { patchOnboarding } from "../controllers/user.controller.js";

const usersRouter = Router();

usersRouter.patch("/me/onboarding", requireAuth, patchOnboarding);

export { usersRouter };
