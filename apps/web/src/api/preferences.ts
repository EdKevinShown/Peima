import { authHeaders, baseUrl, handleJson } from "./auth";
import { preferenceIntOrNull } from "../utils/preferenceIntOrNull.js";

export type UserPreferenceRecord = {
  id: string;
  userId: string;
  minAge: number | null;
  maxAge: number | null;
  preferredCities: string[];
  minHeight: number | null;
  maxHeight: number | null;
  educationPreferences: string[];
  occupationPreferences: string[];
  relationshipGoalPreferences: string[];
  styleTags: string[];
  createdAt: string;
  updatedAt: string;
};

export type UpsertPreferencePayload = {
  minAge?: number | null;
  maxAge?: number | null;
  preferredCities?: string[];
  minHeight?: number | null;
  maxHeight?: number | null;
  educationPreferences?: string[];
  occupationPreferences?: string[];
  relationshipGoalPreferences?: string[];
  styleTags?: string[];
};

export async function getUserPreferences(userId: string) {
  const res = await fetch(
    `${baseUrl}/preferences/${encodeURIComponent(userId)}`,
    { headers: authHeaders() },
  );
  return handleJson<UserPreferenceRecord>(res);
}

/** 无记录时返回 null，其它错误仍抛异常。 */
export async function getUserPreferencesOptional(
  userId: string,
): Promise<UserPreferenceRecord | null> {
  const res = await fetch(
    `${baseUrl}/preferences/${encodeURIComponent(userId)}`,
    { headers: authHeaders() },
  );
  if (res.status === 404) {
    return null;
  }
  return handleJson<UserPreferenceRecord>(res);
}

export async function upsertUserPreferences(
  userId: string,
  body: UpsertPreferencePayload,
) {
  const normalized: UpsertPreferencePayload = {
    minAge: preferenceIntOrNull(body.minAge),
    maxAge: preferenceIntOrNull(body.maxAge),
    minHeight: preferenceIntOrNull(body.minHeight),
    maxHeight: preferenceIntOrNull(body.maxHeight),
    preferredCities: body.preferredCities ?? [],
    educationPreferences: body.educationPreferences ?? [],
    occupationPreferences: body.occupationPreferences ?? [],
    relationshipGoalPreferences:
      body.relationshipGoalPreferences ?? [],
    ...(body.styleTags !== undefined ? { styleTags: body.styleTags } : {}),
  };
  const res = await fetch(
    `${baseUrl}/preferences/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(normalized),
    },
  );
  return handleJson<UserPreferenceRecord>(res);
}
