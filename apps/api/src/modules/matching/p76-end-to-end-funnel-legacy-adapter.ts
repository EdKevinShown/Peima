/**
 * P7.6-r6b: read-only legacy comparison context for end-to-end funnel audit.
 */

import type { PrismaClient } from "@peima/database";
import type { PrismaService } from "../../common/prisma/prisma.service";
import { resolveMatchResultDisplay } from "./matching-result-display";
import type { P76LegacyComparisonInputV1 } from "./p76-end-to-end-funnel-shadow.types";
import type { P76R6EndToEndFunnelShadowAuditCliArgs } from "../../dev-cli/p76-r6-end-to-end-funnel-shadow-audit-cli-args";

const ONBOARDING_POOL_STATUS_ACTIVE = "active";

const MATCH_RESULT_SELECT = {
  id: true,
  userId: true,
  candidateUserId: true,
  finalScore: true,
  matchInsights: true,
} as const;

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function normalizeId(id: unknown): string | null {
  const v = String(id ?? "").trim();
  return v.length > 0 ? v : null;
}

export type P76LegacyComparisonLoadResultV1 = {
  legacy: P76LegacyComparisonInputV1;
  loadNotes: string[];
};

export function extractM6RrmTop2FromMatchInsights(matchInsights: unknown): {
  m6RrmTop2CandidateIds: string[];
  m6RrmSelectedCandidateId: string | null;
  hasRrmDecisionShadow: boolean;
} {
  if (!isRecord(matchInsights)) {
    return {
      m6RrmTop2CandidateIds: [],
      m6RrmSelectedCandidateId: null,
      hasRrmDecisionShadow: false,
    };
  }

  const hasRrmDecisionShadow = matchInsights.rrmDecisionShadow != null;

  const sel = matchInsights.rrmV2Top2Selector;
  if (!isRecord(sel)) {
    return {
      m6RrmTop2CandidateIds: [],
      m6RrmSelectedCandidateId: null,
      hasRrmDecisionShadow,
    };
  }

  const ids: string[] = [];
  const top2 = sel.selectedTop2;
  if (Array.isArray(top2)) {
    for (const item of top2) {
      if (!isRecord(item)) continue;
      const id = normalizeId(item.candidateUserId);
      if (id) ids.push(id);
    }
  }

  const top1 = normalizeId(sel.top1CandidateUserId);
  const selected = top1 ?? ids[0] ?? null;

  return {
    m6RrmTop2CandidateIds: ids,
    m6RrmSelectedCandidateId: selected,
    hasRrmDecisionShadow,
  };
}

async function loadLegacyPreviewPoolCandidateIds(
  prisma: PrismaClient,
  viewerUserId: string,
): Promise<string[]> {
  const pool = await prisma.onboardingPhotoPreviewPool.findFirst({
    where: { userId: viewerUserId, status: ONBOARDING_POOL_STATUS_ACTIVE },
    orderBy: { createdAt: "desc" },
    select: {
      items: {
        orderBy: { rankInPool: "asc" },
        select: { candidateUserId: true },
      },
    },
  });

  if (!pool?.items?.length) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of pool.items) {
    const id = normalizeId(item.candidateUserId);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export async function loadP76LegacyComparisonContext(
  prisma: PrismaClient,
  args: Pick<
    P76R6EndToEndFunnelShadowAuditCliArgs,
    "viewerUserId" | "matchResultId" | "compareLegacy" | "compareM6"
  >,
): Promise<P76LegacyComparisonLoadResultV1> {
  const loadNotes: string[] = [];
  const legacy: P76LegacyComparisonInputV1 = {};

  if (!args.compareLegacy) {
    loadNotes.push("compare_legacy_disabled");
    return { legacy, loadNotes };
  }

  let matchRow: {
    id: string;
    userId: string;
    candidateUserId: string;
    finalScore: number | null;
    matchInsights: unknown;
  } | null = null;

  if (args.matchResultId) {
    matchRow = await prisma.matchResult.findUnique({
      where: { id: args.matchResultId },
      select: MATCH_RESULT_SELECT,
    });
    if (!matchRow) {
      loadNotes.push("match_result_not_found");
    } else if (matchRow.userId !== args.viewerUserId) {
      loadNotes.push("match_result_viewer_mismatch");
      matchRow = null;
    }
  } else {
    matchRow = await prisma.matchResult.findFirst({
      where: { userId: args.viewerUserId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: MATCH_RESULT_SELECT,
    });
    if (!matchRow) {
      loadNotes.push("match_result_not_found");
    }
  }

  if (matchRow) {
    legacy.matchResultId = matchRow.id;
    legacy.matchResultCandidateUserId = matchRow.candidateUserId;
    legacy.matchResultFinalScore =
      matchRow.finalScore != null && Number.isFinite(matchRow.finalScore)
        ? matchRow.finalScore
        : null;
    legacy.workerWinnerCandidateUserId = matchRow.candidateUserId;

    try {
      const display = await resolveMatchResultDisplay(
        prisma as unknown as PrismaService,
        matchRow as never,
      );
      legacy.displayCandidateUserId = display.displayCandidateUserId;
      legacy.displaySourceType = display.displaySourceType;
    } catch {
      loadNotes.push("display_resolve_failed");
      legacy.displayCandidateUserId = matchRow.candidateUserId;
      legacy.displaySourceType = "match_result_original";
    }

    if (args.compareM6) {
      const m6 = extractM6RrmTop2FromMatchInsights(matchRow.matchInsights);
      legacy.m6RrmTop2CandidateIds = m6.m6RrmTop2CandidateIds;
      legacy.m6RrmSelectedCandidateId = m6.m6RrmSelectedCandidateId;
      if (m6.hasRrmDecisionShadow) {
        loadNotes.push("rrm_decision_shadow_present");
      }
      if (m6.m6RrmTop2CandidateIds.length === 0) {
        loadNotes.push("m6_top2_missing");
      }
    } else {
      loadNotes.push("compare_m6_disabled");
    }
  }

  try {
    legacy.legacyPreviewPoolCandidateIds = await loadLegacyPreviewPoolCandidateIds(
      prisma,
      args.viewerUserId,
    );
    if (legacy.legacyPreviewPoolCandidateIds.length === 0) {
      loadNotes.push("legacy_preview_pool_empty");
    }
  } catch {
    loadNotes.push("legacy_preview_pool_load_failed");
    legacy.legacyPreviewPoolCandidateIds = [];
  }

  return { legacy, loadNotes };
}

const SENSITIVE_JSON_KEYS = new Set([
  "apiKey",
  "base64",
  "prompt",
  "imageUrl",
  "detectionScoreJson",
  "rawBody",
  "vendorRaw",
  "matchInsights",
  "dimensionBranchChatHints",
  "effectiveProfileChatOverlayV1",
  "rawProfile",
]);

export function assertP76EndToEndFunnelAuditPrivacySafe(
  value: unknown,
  path = "root",
): void {
  if (value == null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertP76EndToEndFunnelAuditPrivacySafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_JSON_KEYS.has(key)) {
      throw new Error(`sensitive field at ${path}.${key}`);
    }
    assertP76EndToEndFunnelAuditPrivacySafe(child, `${path}.${key}`);
  }
}
