import type { MatchResult } from "@peima/database";
import type { PrismaService } from "../../common/prisma/prisma.service";

const READY_STATUS = "ready";

export type MatchResultAccessKind = "outbound" | "inbound";

export type ResolvedMatchResultAccess = {
  /** Stored DB row (viewer of the batch that produced the match). */
  row: MatchResult;
  /** User requesting GET /matching/result or chat. */
  viewerUserId: string;
  kind: MatchResultAccessKind;
};

type MatchResultReader = Pick<PrismaService, "matchResult">;

/**
 * Latest match visible to `viewerUserId`:
 * 1) own outbound row (`userId` = viewer)
 * 2) else latest inbound row where viewer was selected as `candidateUserId`
 */
export async function resolveLatestMatchResultAccess(
  prisma: MatchResultReader,
  viewerUserId: string,
): Promise<ResolvedMatchResultAccess | null> {
  const outbound = await prisma.matchResult.findFirst({
    where: { userId: viewerUserId },
    orderBy: { createdAt: "desc" },
  });
  if (outbound) {
    return { row: outbound, viewerUserId, kind: "outbound" };
  }

  const inbound = await prisma.matchResult.findFirst({
    where: {
      candidateUserId: viewerUserId,
      status: READY_STATUS,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!inbound) {
    return null;
  }

  return { row: inbound, viewerUserId, kind: "inbound" };
}

/** Viewer-safe projection: inbound rows swap userId/candidateUserId for display APIs. */
export function projectMatchResultForViewer(
  access: ResolvedMatchResultAccess,
): MatchResult {
  const { row, viewerUserId, kind } = access;
  if (kind === "outbound") {
    return row;
  }
  if (row.candidateUserId !== viewerUserId) {
    throw new Error("inbound match row candidate mismatch");
  }
  return {
    ...row,
    userId: viewerUserId,
    candidateUserId: row.userId,
  };
}
