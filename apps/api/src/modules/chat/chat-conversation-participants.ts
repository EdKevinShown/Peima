/** Shared helpers: one chat thread per user pair (not two viewer/candidate silos). */

export type ConversationParticipantRow = {
  id: string;
  viewerUserId: string;
  candidateUserId: string;
  updatedAt?: Date;
  _count?: { messages: number };
};

export function peerUserIdForParticipant(
  conversation: { viewerUserId: string; candidateUserId: string },
  participantUserId: string,
): string {
  if (conversation.viewerUserId === participantUserId) {
    return conversation.candidateUserId;
  }
  if (conversation.candidateUserId === participantUserId) {
    return conversation.viewerUserId;
  }
  return conversation.candidateUserId;
}

/** Prefer the thread with more messages; tie-break by latest activity. */
export function pickCanonicalConversation<T extends ConversationParticipantRow>(
  rows: T[],
): T | null {
  if (rows.length === 0) {
    return null;
  }
  const sorted = [...rows].sort((a, b) => {
    const mc = (b._count?.messages ?? 0) - (a._count?.messages ?? 0);
    if (mc !== 0) {
      return mc;
    }
    const au = a.updatedAt?.getTime() ?? 0;
    const bu = b.updatedAt?.getTime() ?? 0;
    return bu - au;
  });
  return sorted[0] ?? null;
}

export function activeConversationPairWhere(
  userId: string,
  peerUserId: string,
): {
  status: string;
  OR: Array<
    | { viewerUserId: string; candidateUserId: string }
    | { viewerUserId: string; candidateUserId: string }
  >;
} {
  return {
    status: "active",
    OR: [
      { viewerUserId: userId, candidateUserId: peerUserId },
      { viewerUserId: peerUserId, candidateUserId: userId },
    ],
  };
}
