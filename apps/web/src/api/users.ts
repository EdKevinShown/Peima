import { authHeaders, baseUrl, handleJson } from "./auth";

export type UserProfile = {
  id: string;
  phone: string;
  nickname: string;
  gender: string;
  age: number | null;
  city: string;
  height: number | null;
  education: string;
  occupation: string;
  relationshipGoal: string;
  bio: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateUserPayload = Partial<{
  nickname: string;
  gender: string;
  age: number;
  city: string;
  height: number;
  education: string;
  occupation: string;
  relationshipGoal: string;
  bio: string;
}>;

export async function getUser(userId: string) {
  const res = await fetch(`${baseUrl}/users/${encodeURIComponent(userId)}`, {
    headers: authHeaders(),
  });
  return handleJson<UserProfile>(res);
}

export async function updateUser(userId: string, body: UpdateUserPayload) {
  const res = await fetch(`${baseUrl}/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  return handleJson<UserProfile>(res);
}
