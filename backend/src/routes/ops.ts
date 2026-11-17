import { Router } from 'express';

import { ciSnapshot } from '../controllers/ops.controller.js';
import { signInLimit } from '../middleware/rateLimits.js';
import { requireIngestToken } from '../middleware/requireIngestToken.js';

export const opsRouter: Router = Router();

// The CI ingest (docs/features/admin-overview.md §4.3). Not under /admin: the
// bearer token is the only key. The sign-in tier (per address) makes guessing
// the token slow; a real run posts once.
opsRouter.post('/snapshots', signInLimit, requireIngestToken(), ciSnapshot);
