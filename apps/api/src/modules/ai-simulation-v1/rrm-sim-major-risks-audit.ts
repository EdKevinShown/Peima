/**
 * M1.3-M6 — read-only majorRisks / staticLift audit helpers (no production evaluator changes).
 * Topic mapping is for offline reporting only; not used in extractDPre or ranking.
 */
import { createHash } from "node:crypto";
import { buildMatchReviewStaticSummary } from "../match-review-ai/match-review-static-summary";
import { buildAiSimulationStaticContext } from "./ai-simulation-v1-static-context";
import {
  loadQuestionnaireProfileViewForAudit,
  type QuestionnaireProfileLoaderPrisma,
} from "../questionnaire/questionnaire-profile-view.util";
import { extractDPre } from "./rrm-sim-extractor";
import type { AiSimulationLlmPayloadV2 } from "./ai-simulation-v1.types";
import { evaluateRrmSimFromSimulationV2 } from "./rrm-sim.evaluator";
import { computeDPreMajorRiskDedupProxyFromTxAdmin } from "./rrm-sim-calibration-whatif";

/** Offline-only labels (M1.3-M6); first regex match wins. */
export type MajorRiskTopicLabel =
  | "emotion_expression"
  | "control_need"
  | "longterm_marriage"
  | "conflict_style"
  | "safety_pressure"
  | "pace_mismatch"
  | "jealousy_trust"
  | "family_values"
  | "money_career"
  | "unknown";

const TOPIC_RULES: Array<{ label: MajorRiskTopicLabel; re: RegExp }> = [
  { label: "safety_pressure", re: /安全|压力|胁迫|边界|尊重|拒绝/g },
  { label: "control_need", re: /控制/g },
  { label: "longterm_marriage", re: /婚姻|生育|婚育|长期|预期/g },
  /** Before generic conflict/主导 (axis blurbs often name 生活节奏 + 主导倾向). */
  { label: "pace_mismatch", re: /节奏/g },
  { label: "conflict_style", re: /冲突|分歧|处理|沟通|主导/g },
  { label: "emotion_expression", re: /情绪|表达|情感/g },
  { label: "jealousy_trust", re: /嫉妒|忠诚|信任/g },
  { label: "family_values", re: /家庭|价值观/g },
  { label: "money_career", re: /金钱|事业|职业/g },
];

/** Same character class family as extractDPre STATIC_RISK_D_BOOST_RE (for count-only audit). */
const STATIC_RISK_KEYWORD_RE =
  /婚姻|生育|节奏|冲突|风险|目标|对齐|差异|控制|压力|安全|价值观|婚育|长期|现实/gi;

export function classifyMajorRiskLineToTopic(line: string): MajorRiskTopicLabel {
  const t = line.trim();
  if (!t) return "unknown";
  for (const { label, re } of TOPIC_RULES) {
    if (re.test(t)) return label;
  }
  return "unknown";
}

export function hashMajorRisksFingerprint(lines: string[]): string {
  const joined = lines.map((s) => s.trim()).join("\u0001");
  return createHash("sha256").update(joined, "utf8").digest("hex").slice(0, 16);
}

export function countStaticRiskKeywordMatches(lines: string[]): number {
  const blob = lines.join("\n");
  const m = blob.match(STATIC_RISK_KEYWORD_RE);
  return m ? m.length : 0;
}

export function relationshipGoalHintRiskHit(hint: unknown): boolean {
  return typeof hint === "string" && /差异偏大|冲突|偏高/.test(hint);
}

export function analyzeMajorRiskTopics(lines: string[]): {
  majorRisksCount: number;
  uniqueRiskTopicCount: number;
  duplicateTopicCount: number;
  duplicateRatio: number;
  topicLabelsPerLine: MajorRiskTopicLabel[];
  uniqueTopicLabelsSorted: MajorRiskTopicLabel[];
} {
  const topicLabelsPerLine = lines.map((l) => classifyMajorRiskLineToTopic(l));
  const majorRisksCount = lines.length;
  const topicSet = new Set(topicLabelsPerLine);
  const uniqueRiskTopicCount = topicSet.size;
  const duplicateTopicCount = Math.max(0, majorRisksCount - uniqueRiskTopicCount);
  const duplicateRatio = majorRisksCount > 0 ? duplicateTopicCount / majorRisksCount : 0;
  const uniqueTopicLabelsSorted = [...topicSet].sort() as MajorRiskTopicLabel[];
  return {
    majorRisksCount,
    uniqueRiskTopicCount,
    duplicateTopicCount,
    duplicateRatio,
    topicLabelsPerLine,
    uniqueTopicLabelsSorted,
  };
}

export type MajorRiskAuditRow = {
  jobId: string;
  viewerUserId: string;
  candidateUserId: string;
  D_admin: number;
  D_tx: number | null;
  staticLift: number | null;
  majorRisksCount: number;
  topicLabelsPerLine: MajorRiskTopicLabel[];
  uniqueTopicLabelsSorted: MajorRiskTopicLabel[];
  uniqueRiskTopicCount: number;
  duplicateTopicCount: number;
  duplicateRatio: number;
  relationshipGoalHintRiskHit: boolean;
  riskKeywordMatchCount: number;
  dPreAtClampCap: boolean;
  dPreMajorRiskDedupProxy: number | null;
  majorRisksFingerprintSha16: string;
  R_pre: number | null;
  respectCandidate: boolean;
  suggestedAction: string | null;
};

function isFullPayload(tl: unknown): tl is AiSimulationLlmPayloadV2 {
  return Boolean(tl && typeof tl === "object" && (tl as { schemaVersion?: unknown }).schemaVersion === 2);
}

/**
 * Rebuild staticContext like production enrichResultsWithRrmSim (read-only DB).
 */
export async function auditMajorRisksForJobItem(
  prisma: QuestionnaireProfileLoaderPrisma,
  jobId: string,
  viewerUserId: string,
  candidateUserId: string,
  transcriptLite: unknown,
): Promise<MajorRiskAuditRow | { skipped: true; reason: string }> {
  if (!isFullPayload(transcriptLite)) {
    return { skipped: true, reason: "transcript_not_v2" };
  }
  let viewerView;
  let candidateView;
  try {
    viewerView = await loadQuestionnaireProfileViewForAudit(prisma, viewerUserId);
    candidateView = await loadQuestionnaireProfileViewForAudit(prisma, candidateUserId);
  } catch {
    return { skipped: true, reason: "profile_load_failed" };
  }
  const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(viewerView, candidateView);
  const staticCtx = buildAiSimulationStaticContext({
    reviewStaticScore,
    staticSummary,
    viewer: viewerView,
    candidate: candidateView,
  });
  const majorLines = Array.isArray(staticCtx.majorRisks)
    ? (staticCtx.majorRisks as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const topicAnalysis = analyzeMajorRiskTopics(majorLines);
  const D_admin = extractDPre(transcriptLite, staticCtx);
  const D_tx = extractDPre(transcriptLite, null);
  const staticLift = D_tx != null ? Math.max(0, D_admin - D_tx) : null;
  const rr = evaluateRrmSimFromSimulationV2(transcriptLite, staticCtx);
  const R_pre = rr?.scores?.R_pre != null && Number.isFinite(rr.scores.R_pre) ? rr.scores.R_pre : null;
  const respectCandidate = R_pre != null && R_pre >= 0.7;
  const dPreProxy =
    D_tx != null ? computeDPreMajorRiskDedupProxyFromTxAdmin(D_tx, D_admin) : null;
  return {
    jobId,
    viewerUserId,
    candidateUserId,
    D_admin,
    D_tx,
    staticLift,
    majorRisksCount: topicAnalysis.majorRisksCount,
    topicLabelsPerLine: topicAnalysis.topicLabelsPerLine,
    uniqueTopicLabelsSorted: topicAnalysis.uniqueTopicLabelsSorted,
    uniqueRiskTopicCount: topicAnalysis.uniqueRiskTopicCount,
    duplicateTopicCount: topicAnalysis.duplicateTopicCount,
    duplicateRatio: topicAnalysis.duplicateRatio,
    relationshipGoalHintRiskHit: relationshipGoalHintRiskHit(staticCtx.relationshipGoalHint),
    riskKeywordMatchCount: countStaticRiskKeywordMatches(majorLines),
    dPreAtClampCap: D_admin >= 0.999,
    dPreMajorRiskDedupProxy: dPreProxy,
    majorRisksFingerprintSha16: hashMajorRisksFingerprint(majorLines),
    R_pre,
    respectCandidate,
    suggestedAction: rr?.suggestedAction != null ? String(rr.suggestedAction) : null,
  };
}
