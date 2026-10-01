import { Router } from 'express';

import { getSession, logout, signInWithGoogle } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter: Router = Router();

authRouter.post('/google', signInWithGoogle);
authRouter.get('/me', requireAuth, getSession);
authRouter.post('/logout', logout);
