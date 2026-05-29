import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const DECISION_SHADOW_KEYS = [
  "same_as_baseline",
  "switch_to_top2_candidate",
  "no_shadow_decision",
  "blocked",
  "unexpected_exception",
] as const;

const BOUNDED_DECISION_KEYS = [
  "would_use_baseline",
  "would_switch_to_rrm",
  "fallback_baseline",
] as const;

type ObservationSummary = {
  sampleSize: number;
  coverage: {
    withScoreShadowV2: number;
    withScoreShadowV1Legacy: number;
    withRrmV2Top2Selector: number;
    withRrmDecisionShadow: number;
    withRrmBoundedDecision: number;
    withResolvedProjectionUnavailableInDbNote: true;
  };
  decisionShadow: Record<(typeof DECISION_SHADOW_KEYS)[number], number>;
  boundedDecision: {
    would_use_baseline: number;
    would_switch_to_rrm: number;
    fallback_baseline: number;
    fallbackReasonDistribution: Record<string, number>;
  };
  inputPresence: {
    scoreShadowV2True: number;
    rrmV2Top2SelectorTrue: number;
    selectedTop2True: number;
    scoreShadowV1LegacyPresentTrue: number;
  };
  quality: {
    malformedCount: number;
    parseErrorCount: number;
    unexpectedExceptionCount: number;
  };
  notes: string[];
  limit: number;
  generatedAt: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function toBool(v: unknown): boolean {
  return v === true;
}

function bump(map: Record<string, number>, key: unknown): void {
  const k = typeof key === "string" && key.trim().length > 0 ? key.trim() : "unknown";
  map[k] = (map[k] ?? 0) + 1;
}

export function parseObservationLimit(raw: string | undefined): number {
  if (!raw || raw.trim().length === 0) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, parsed);
}

function createSummary(limit: number, sampleSize: number): ObservationSummary {
  return {
    sampleSize,
    coverage: {
      withScoreShadowV2: 0,
      withScoreShadowV1Legacy: 0,
      withRrmV2Top2Selector: 0,
      withRrmDecisionShadow: 0,
      withRrmBoundedDecision: 0,
      withResolvedProjectionUnavailableInDbNote: true,
    },
    decisionShadow: Object.fromEntries(
      DECISION_SHADOW_KEYS.map((k) => [k, 0]),
    ) as ObservationSummary["decisionShadow"],
    boundedDecision: {
      would_use_baseline: 0,
      would_switch_to_rrm: 0,
      fallback_baseline: 0,
      fallbackReasonDistribution: {},
    },
    inputPresence: {
      scoreShadowV2True: 0,
      rrmV2Top2SelectorTrue: 0,
      selectedTop2True: 0,
      scoreShadowV1LegacyPresentTrue: 0,
    },
    quality: {
      malformedCount: 0,
      parseErrorCount: 0,
      unexpectedExceptionCount: 0,
    },
    notes: [
      "resolved projection is API runtime projection and is not directly persisted in DB",
      "handoff mismatch / owner warning are mostly runtime UI signals and may not be directly aggregatable from DB",
    ],
    limit,
    generatedAt: new Date().toISOString(),
  };
}

export function aggregateRrmObservationSummary(
  rows: Array<{ matchInsights: unknown }>,
  limit: number,
): ObservationSummary {
  const summary = createSummary(limit, rows.length);

  for (const row of rows) {
    try {
      const insights = row.matchInsights;
      if (!isRecord(insights)) {
        summary.quality.malformedCount++;
        continue;
      }

      if (insights.scoreShadowV2 != null) summary.coverage.withScoreShadowV2++;
      if (insights.scoreShadow != null) summary.coverage.withScoreShadowV1Legacy++;
      if (insights.rrmV2Top2Selector != null) summary.coverage.withRrmV2Top2Selector++;

      const dsRaw = insights.rrmDecisionShadow;
      if (dsRaw != null) {
        summary.coverage.withRrmDecisionShadow++;
        if (!isRecord(dsRaw)) {
          summary.quality.parseErrorCount++;
        } else {
          const guardrails = isRecord(dsRaw.guardrails) ? dsRaw.guardrails : null;
          const blockReasons = Array.isArray(guardrails?.blockReasons)
            ? guardrails.blockReasons.filter((x): x is string => typeof x === "string")
            : [];
          const isBlocked = toBool(guardrails?.blocked);
          const shadow = isRecord(dsRaw.shadow) ? dsRaw.shadow : null;
          const decision =
            shadow && typeof shadow.decision === "string" ? shadow.decision.trim() : "";

          if (decision === "same_as_baseline") summary.decisionShadow.same_as_baseline++;
          else if (decision === "switch_to_top2_candidate")
            summary.decisionShadow.switch_to_top2_candidate++;
          else if (decision === "no_shadow_decision") summary.decisionShadow.no_shadow_decision++;
          else if (isBlocked) summary.decisionShadow.blocked++;
          else if (blockReasons.includes("unexpected_exception"))
            summary.decisionShadow.unexpected_exception++;
          else summary.quality.parseErrorCount++;

          if (isRecord(dsRaw.inputPresence)) {
            if (toBool(dsRaw.inputPresence.scoreShadowV2)) summary.inputPresence.scoreShadowV2True++;
            if (toBool(dsRaw.inputPresence.rrmV2Top2Selector))
              summary.inputPresence.rrmV2Top2SelectorTrue++;
            if (toBool(dsRaw.inputPresence.selectedTop2)) summary.inputPresence.selectedTop2True++;
            if (toBool(dsRaw.inputPresence.scoreShadowV1LegacyPresent))
              summary.inputPresence.scoreShadowV1LegacyPresentTrue++;
          }
        }
      }

      const bdRaw = insights.rrmBoundedDecision;
      if (bdRaw != null) {
        summary.coverage.withRrmBoundedDecision++;
        if (!isRecord(bdRaw)) {
          summary.quality.parseErrorCount++;
        } else {
          const decision = typeof bdRaw.decision === "string" ? bdRaw.decision.trim() : "";
          if (decision === "would_use_baseline") summary.boundedDecision.would_use_baseline++;
          else if (decision === "would_switch_to_rrm")
            summary.boundedDecision.would_switch_to_rrm++;
          else if (decision === "fallback_baseline") summary.boundedDecision.fallback_baseline++;
          else summary.quality.parseErrorCount++;

          const fallbackReason =
            typeof bdRaw.fallbackReason === "string" && bdRaw.fallbackReason.trim().length > 0
              ? bdRaw.fallbackReason.trim()
              : null;
          if (fallbackReason) bump(summary.boundedDecision.fallbackReasonDistribution, fallbackReason);

          if (isRecord(bdRaw.inputPresence)) {
            if (toBool(bdRaw.inputPresence.scoreShadowV2)) summary.inputPresence.scoreShadowV2True++;
            if (toBool(bdRaw.inputPresence.rrmV2Top2Selector))
              summary.inputPresence.rrmV2Top2SelectorTrue++;
            if (toBool(bdRaw.inputPresence.selectedTop2)) summary.inputPresence.selectedTop2True++;
            if (toBool(bdRaw.inputPresence.scoreShadowV1LegacyPresent))
              summary.inputPresence.scoreShadowV1LegacyPresentTrue++;
          }
        }
      }
    } catch {
      summary.quality.unexpectedExceptionCount++;
    }
  }

  return summary;
}

@Injectable()
export class RrmObservationSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(limitRaw: string | undefined): Promise<ObservationSummary> {
    const limit = parseObservationLimit(limitRaw);
    const rows = await this.prisma.matchResult.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        matchInsights: true,
      },
    });
    return aggregateRrmObservationSummary(rows, limit);
  }
}
