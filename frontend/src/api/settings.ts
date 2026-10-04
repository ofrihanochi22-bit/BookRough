import type { AccentColor } from '../lib/appSettings';
import { api, type SuccessBody } from './client';

/** GET /api/settings — the announcement is present only for a signed-in caller. */
export interface PublicSettings {
  accentColor: string;
  welcomeTagline: string;
  announcement?: { text: string } | null;
}

export interface Announcement {
  enabled: boolean;
  text: string;
}

export interface AdminSettingsValues {
  announcement: Announcement;
  accentColor: AccentColor;
  welcomeTagline: string;
}

export type SettingName = keyof AdminSettingsValues;

export interface SettingChange {
  id: string;
  key: SettingName;
  oldValue: unknown;
  newValue: unknown;
  changedAt: string;
  changedBy: { id: string; displayName: string | null } | null;
}

export interface AdminSettings {
  settings: AdminSettingsValues;
  changes: SettingChange[];
}

export type SettingsUpdate = Partial<AdminSettingsValues>;

/** Never toasts: a failure quietly leaves the defaults in place (§5.4). */
export async function fetchPublicSettings(): Promise<PublicSettings> {
  const response = await api.get<SuccessBody<PublicSettings>>('/settings', {
    skipErrorToast: true,
  });
  return response.data.data;
}

/** The Settings tab shows its own error state (and NotFound on 403), so no toast. */
export async function fetchAdminSettings(): Promise<AdminSettings> {
  const response = await api.get<SuccessBody<AdminSettings>>('/admin/settings', {
    skipErrorToast: true,
  });
  return response.data.data;
}

/** The form shows its own errors, so no toast. */
export async function updateAdminSettings(update: SettingsUpdate): Promise<AdminSettings> {
  const response = await api.patch<SuccessBody<AdminSettings>>('/admin/settings', update, {
    skipErrorToast: true,
  });
  return response.data.data;
}
