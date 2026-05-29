import { authHeaders, baseUrl, handleJson } from "./auth";

export type FriendListItem = {
  friendUserId: string;
  nickname: string;
  source: string;
  matchResultId: string | null;
  createdAt: string;
};

export async function listMyFriends(): Promise<FriendListItem[]> {
  const res = await fetch(`${baseUrl}/friends/me`, {
    headers: authHeaders(),
  });
  return handleJson<FriendListItem[]>(res);
}
