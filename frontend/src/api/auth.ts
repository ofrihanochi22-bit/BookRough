/**
 * Auth API resource module.
 *
 * All calls to /api/auth/* go through these typed wrappers so that:
 *   - The URL strings live in one place.
 *   - Response types are explicit (ApiSuccess<T> from api/types.ts).
 *   - Pages never import axios directly — they call these functions.
 */

import { api } from "./client";
import type { ApiSuccess } from "./types";
import type { User } from "../types/user";

export interface AuthUserResponse {
  user: User;
}

export interface GoogleAuthResponse {
  user: User;
  requiresOnboarding: boolean;
}

export async function register(payload: {
  email: string;
  username: string;
  displayName: string;
  password: string;
  preferredService?: string;
}): Promise<User> {
  const res = await api.post<ApiSuccess<AuthUserResponse>>("/auth/register", payload);
  return res.data.data.user;
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<User> {
  const res = await api.post<ApiSuccess<AuthUserResponse>>("/auth/login", payload);
  return res.data.data.user;
}

export async function googleLogin(idToken: string): Promise<GoogleAuthResponse> {
  const res = await api.post<ApiSuccess<GoogleAuthResponse>>("/auth/google", { idToken });
  return res.data.data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function me(): Promise<User> {
  const res = await api.get<ApiSuccess<AuthUserResponse>>("/auth/me");
  return res.data.data.user;
}

export async function forgot(email: string): Promise<void> {
  await api.post("/auth/forgot", { email });
}

export async function resetPassword(payload: {
  token: string;
  newPassword: string;
}): Promise<void> {
  await api.post("/auth/reset", payload);
}
