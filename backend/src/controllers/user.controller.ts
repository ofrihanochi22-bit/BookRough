import type { Request, Response, NextFunction } from "express";
import { onboardingSchema } from "../validation/user.schema.js";
import { completeOnboarding } from "../services/user.service.js";
import { ok } from "../utils/response.js";

/** PATCH /api/users/me/onboarding — requires requireAuth */
export async function patchOnboarding(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const input = onboardingSchema.parse(req.body);
    const user = await completeOnboarding(userId, input);
    ok(res, { user });
  } catch (err) {
    next(err);
  }
}
