import type { MatchResult } from "@peima/database";
import type { PrismaService } from "../../common/prisma/prisma.service";
import {
  parseFinalizeMetaV1Loose,
  resolveMatchResultDisplay,
} from "../matching/matching-result-display";
import type { TestingMatchDebugSummary } from "./testing-observability.types";

const RRM_SIM_KEY = "rrmSimReadonlySummary";
const SCORE_SHADOW_V2_KEY = "scoreShadowV2";
const RRM_DECISION_SHADOW_KEY = "rrmDecisionShadow";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function insightsHasKey(insights: unknown, key: string): boolean {
  if (!isRecord(insights)) return false;
  return insights[key] != null;
}

export async function buildTestingMatchDebugSummary(
  prisma: PrismaService,
  row: MatchResult,
): Promise<TestingMatchDebugSummary> {
  const display = await resolveMatchResultDisplay(prisma, row);
  const insights = row.matchInsights;
  const meta = parseFinalizeMetaV1Loose(
    isRecord(insights) ? insights.finalMatchDecisionMeta : null,
  );

  const guardrailFlags: string[] = [];
  if (meta?.wouldChangeStaticResult) {
    guardrailFlags.push("would_change_static_result");
  }
  if (meta?.fallbackReason) {
    guardrailFlags.push(`fallback:${meta.fallbackReason}`);
  }
  if (display.displaySourceType === "static_fallback") {
    guardrailFlags.push("display_static_fallback");
  }

  const pairwiseMeta = await prisma.pairwisePoolFinalizeMeta.findFirst({
    where: { viewerUserId: row.userId },
    select: { id: true },
  });

  return {
    matchResultId: row.id,
    viewerUserId: row.userId,
    candidateUserId: row.candidateUserId,
    displayCandidateUserId: display.displayCandidateUserId,
    displaySourceType: display.displaySourceType,
    finalScore: row.finalScore,
    finalMatchDecisionMetaPresent: meta != null || display.finalMatchDecisionMeta != null,
    matchInsightsPresent: insights != null,
    scoreShadowV2Present: insightsHasKey(insights, SCORE_SHADOW_V2_KEY),
    rrmDecisionShadowPresent: insightsHasKey(insights, RRM_DECISION_SHADOW_KEY),
    pairwiseAvailable: pairwiseMeta != null,
    fallbackUsed:
      meta?.fallbackReason != null && meta.fallbackReason !== ""
        ? true
        : display.displaySourceType === "static_fallback"
          ? true
          : null,
    guardrailFlags,
    sourceVersion:
      display.finalMatchDecisionMeta?.sourceType ??
      (isRecord(insights) &&
      isRecord(insights[RRM_SIM_KEY]) &&
      typeof insights[RRM_SIM_KEY].sourceVersion === "string"
        ? (insights[RRM_SIM_KEY].sourceVersion as string)
        : null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
