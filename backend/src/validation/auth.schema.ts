/**
 * Zod validation schemas for authentication endpoints.
 *
 * Shared between controller (runtime validation) and tests (to build valid
 * payloads without duplicating magic strings).
 */

import { z } from "zod";

const usernameRule = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, digits, and underscores");

const passwordRule = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one digit");

const preferredServiceRule = z.enum(["SPOTIFY", "APPLE_MUSIC", "YOUTUBE", "TIDAL", "DEEZER"]);

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  username: usernameRule,
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(50, "Display name must be at most 50 characters"),
  password: passwordRule,
  preferredService: preferredServiceRule.default("SPOTIFY"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
});

export const forgotSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: passwordRule,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type ForgotInput = z.infer<typeof forgotSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
