import { api } from "./client";
import type { ApiSuccess } from "./types";
import type { User } from "../types/user";

export async function completeOnboarding(payload: {
  username: string;
  preferredService: string;
}): Promise<User> {
  const res = await api.patch<ApiSuccess<{ user: User }>>("/users/me/onboarding", payload);
  return res.data.data.user;
}
