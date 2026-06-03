import type { Prisma } from "@peima/database";
import type { MatchResultCreateClient } from "./old-photo-matching-writer-shutdown-env.js";

const RESULT_STATUS_READY = "ready";

function isTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return defaultValue;
}

export function isReciprocalMatchResultWriteEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isTruthy(env.PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED, true);
}

type ReciprocalPrisma = MatchResultCreateClient & {
  matchResult: {
    findFirst: (args: {
      where: { userId: string };
      orderBy: { createdAt: "desc" };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

export type ReciprocalMatchWriteInput = {
  viewerUserId: string;
  candidateUserId: string;
  batchId: string;
  finalScore: number;
  reasonSummary: string;
  matchInsights: Prisma.InputJsonValue;
};

export type ReciprocalMatchWriteResult =
  | { written: true; reason: "reciprocal_match_result_created" }
  | { written: false; reason: string };

function mergeReciprocalInsights(
  matchInsights: Prisma.InputJsonValue,
  viewerUserId: string,
): Prisma.InputJsonValue {
  const base =
    matchInsights != null &&
    typeof matchInsights === "object" &&
    !Array.isArray(matchInsights)
      ? { ...(matchInsights as Record<string, unknown>) }
      : {};
  return {
    ...base,
    reciprocalMatch: {
      schemaVersion: 1,
      sourceViewerUserId: viewerUserId,
      mirroredAt: new Date().toISOString(),
    },
  };
}

/**
 * When viewer V is matched to candidate C, ensure C can see a ready MatchResult (C → V)
 * unless C already has their own outbound result from a prior batch.
 */
export async function writeReciprocalMatchResultIfAbsent(
  prisma: ReciprocalPrisma,
  input: ReciprocalMatchWriteInput,
): Promise<ReciprocalMatchWriteResult> {
  if (!isReciprocalMatchResultWriteEnabled()) {
    return { written: false, reason: "reciprocal_match_result_disabled" };
  }

  if (input.viewerUserId === input.candidateUserId) {
    return { written: false, reason: "reciprocal_self_match_skipped" };
  }

  const existingOutbound = await prisma.matchResult.findFirst({
    where: { userId: input.candidateUserId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existingOutbound) {
    return { written: false, reason: "candidate_outbound_result_exists" };
  }

  await prisma.matchResult.create({
    data: {
      userId: input.candidateUserId,
      candidateUserId: input.viewerUserId,
      batchId: input.batchId,
      finalScore: input.finalScore,
      reasonSummary: input.reasonSummary,
      matchInsights: mergeReciprocalInsights(
        input.matchInsights,
        input.viewerUserId,
      ),
      status: RESULT_STATUS_READY,
    },
  });

  return { written: true, reason: "reciprocal_match_result_created" };
}
