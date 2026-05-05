/**
 * Auth router — mounted at /api/auth in routes/index.ts.
 *
 * Public routes:   POST /register, POST /login, POST /logout
 * Protected route: GET  /me  (requires a valid session cookie)
 */

import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  register,
  login,
  logout,
  googleLogin,
  forgotPassword,
  resetPassword,
  me,
} from "../controllers/auth.controller.js";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.post("/google", googleLogin);
authRouter.post("/forgot", forgotPassword);
authRouter.post("/reset", resetPassword);
authRouter.get("/me", requireAuth, me);

export { authRouter };
