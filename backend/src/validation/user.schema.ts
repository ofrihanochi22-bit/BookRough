import { z } from "zod";

export const onboardingSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, digits, and underscores"),
  preferredService: z.enum(["SPOTIFY", "APPLE_MUSIC", "YOUTUBE", "TIDAL", "DEEZER"]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
