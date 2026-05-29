import type { PreviewPoolItem, User, UserPreference, UserProfile } from "@peima/database";
import { passesPreferenceHardGate, type PreferenceGatePref } from "@peima/shared/matching/preference-hard-gate";
import { G1R_PROFILE_KEYS } from "../questionnaire/questionnaire.scorer";
import { computeG1rProfileScalarScore } from "../post-pool-deep-screen/post-pool-dimension-g1r";
import { RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION } from "./ai-pairwise-decision.schema";
import type { AxisScoresSummary } from "./ai-pairwise-decision.types";
import { createHash } from "node:crypto";

/** G1-R key → stable shortlist tag stem (no PII). */
const AXIS_TO_TAG_STEM: Partial<Record<(typeof G1R_PROFILE_KEYS)[number], string>> = {
  communicationStyle: "communication_style",
  emotionalExpression: "emotional_expression",
  conflictHandling: "conflict_handling",
  lifePace: "pace",
  marriageExpectation: "marriage_expectation",
  securityNeed: "security_need",
};

export type GatePrefLike = PreferenceGatePref | null;

export function toPreferenceGatePref(row: UserPreference | null): GatePrefLike {
  if (!row) return null;
  return {
    minAge: row.minAge,
    maxAge: row.maxAge,
    preferredCities: row.preferredCities ?? [],
    minHeight: row.minHeight,
    maxHeight: row.maxHeight,
    educationPreferences: row.educationPreferences ?? [],
    occupationPreferences: row.occupationPreferences ?? [],
    relationshipGoalPreferences: row.relationshipGoalPreferences ?? [],
  };
}

export function toPreferenceGateCandidate(user: User): {
  age: number | null;
  city: string;
  height: number | null;
  education: string;
  occupation: string;
  relationshipGoal: string;
} {
  return {
    age: user.age,
    city: user.city,
    height: user.height,
    education: user.education,
    occupation: user.occupation,
    relationshipGoal: user.relationshipGoal,
  };
}

/**
 * Per-axis similarity in [0, 1] for axes where both viewer and candidate have numeric G1-R fields.
 */
export function buildG1rAxisScoresSummary(viewer: UserProfile | null, candidate: UserProfile | null): AxisScoresSummary {
  if (!viewer || !candidate) return {};
  const out: AxisScoresSummary = {};
  for (const key of G1R_PROFILE_KEYS) {
    const a = viewer[key as keyof UserProfile];
    const b = candidate[key as keyof UserProfile];
    if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)) {
      const sim = 1 - Math.abs(a - b);
      out[key] = Math.round(Math.max(0, Math.min(1, sim)) * 1000) / 1000;
    }
  }
  return out;
}

/** Map scalar [0,1] to [0,100] integer; applies tiny penalties for extreme divergence on a few axes (MVP). */
export function staticCompatibilityScoreFromG1r(
  viewer: UserProfile | null,
  candidate: UserProfile | null,
): number {
  const base = computeG1rProfileScalarScore(viewer, candidate);
  let penalty = 0;
  const heavy: (typeof G1R_PROFILE_KEYS)[number][] = [
    "marriageExpectation",
    "childrenIntent",
    "riskPreference",
  ];
  if (viewer && candidate) {
    for (const key of heavy) {
      const a = viewer[key as keyof UserProfile];
      const b = candidate[key as keyof UserProfile];
      if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)) {
        if (Math.abs(a - b) > 0.55) penalty += 2;
      }
    }
  }
  const raw = Math.round(base * 100) - penalty;
  return Math.max(0, Math.min(100, raw));
}

function stemForAxis(key: string): string | undefined {
  const k = key as (typeof G1R_PROFILE_KEYS)[number];
  return AXIS_TO_TAG_STEM[k];
}

/**
 * Derive short static tags from axis similarity map (no LLM).
 */
export function deriveStrengthAndRiskTags(axisSummary: AxisScoresSummary): {
  majorStrengths: string[];
  majorRisks: string[];
} {
  const entries = Object.entries(axisSummary).filter(([, v]) => typeof v === "number" && Number.isFinite(v));
  entries.sort((a, b) => b[1] - a[1]);
  const strengths: string[] = [];
  for (const [k, sim] of entries) {
    const stem = stemForAxis(k);
    if (!stem) continue;
    if (sim >= 0.78) strengths.push(`${stem}_close`);
    if (strengths.length >= 3) break;
  }
  entries.sort((a, b) => a[1] - b[1]);
  const risks: string[] = [];
  for (const [k, sim] of entries) {
    const stem = stemForAxis(k);
    if (!stem) continue;
    if (sim <= 0.42) risks.push(`${stem}_gap`);
    if (risks.length >= 3) break;
  }
  return {
    majorStrengths: strengths.length ? strengths : ["profile_alignment_neutral"],
    majorRisks: risks.length ? risks : ["no_major_axis_gap_flagged"],
  };
}

export type EligiblePoolRow = {
  item: PreviewPoolItem;
  candidateUserId: string;
  user: User;
  profile: UserProfile;
  staticCompatibilityScore: number;
  axisScoresSummary: AxisScoresSummary;
};

/**
 * Dedupe pool items by candidateUserId (keep lowest rankInPool).
 */
export function dedupePoolItemsByCandidate(items: PreviewPoolItem[]): PreviewPoolItem[] {
  const best = new Map<string, PreviewPoolItem>();
  for (const it of items) {
    const prev = best.get(it.candidateUserId);
    if (!prev || it.rankInPool < prev.rankInPool) {
      best.set(it.candidateUserId, it);
    }
  }
  return [...best.values()].sort((a, b) => a.rankInPool - b.rankInPool);
}

export function buildEligibleRowsForTop2(params: {
  viewerUserId: string;
  viewerProfile: UserProfile | null;
  gatePref: GatePrefLike;
  items: PreviewPoolItem[];
  candidateUserById: Map<string, User>;
  candidateProfileById: Map<string, UserProfile>;
}): EligiblePoolRow[] {
  const rows: EligiblePoolRow[] = [];
  const deduped = dedupePoolItemsByCandidate(params.items);
  for (const item of deduped) {
    const cid = item.candidateUserId;
    if (cid === params.viewerUserId) continue;
    if (item.displayMode !== "full") continue;
    const user = params.candidateUserById.get(cid);
    const profile = params.candidateProfileById.get(cid);
    if (!user || !profile) continue;
    if (!passesPreferenceHardGate(params.gatePref, toPreferenceGateCandidate(user))) continue;

    const axisScoresSummary = buildG1rAxisScoresSummary(params.viewerProfile, profile);
    const staticCompatibilityScore = staticCompatibilityScoreFromG1r(params.viewerProfile, profile);

    rows.push({
      item,
      candidateUserId: cid,
      user,
      profile,
      staticCompatibilityScore,
      axisScoresSummary,
    });
  }
  return rows;
}

export function compareEligibleForTop2(a: EligiblePoolRow, b: EligiblePoolRow): number {
  if (b.staticCompatibilityScore !== a.staticCompatibilityScore) {
    return b.staticCompatibilityScore - a.staticCompatibilityScore;
  }
  if (a.item.rankInPool !== b.item.rankInPool) {
    return a.item.rankInPool - b.item.rankInPool;
  }
  return a.candidateUserId.localeCompare(b.candidateUserId);
}

export function computeRelationshipShortlistFingerprint(params: {
  viewerUserId: string;
  poolId: string;
  orderedCandidateIds: readonly [string, string];
  staticCompatibilityScores: readonly [number, number];
}): string {
  const line = [
    params.viewerUserId,
    params.poolId,
    RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION,
    params.orderedCandidateIds[0],
    params.orderedCandidateIds[1],
    String(Math.round(params.staticCompatibilityScores[0])),
    String(Math.round(params.staticCompatibilityScores[1])),
  ].join("|");
  return createHash("sha256").update(line, "utf8").digest("hex");
}

export function buildReasonSummaryTop2(): string {
  return `M3.8-M1 static Top2: ordered by g1r_scalar_0_100 with light divergence penalty on marriageExpectation/childrenIntent/riskPreference; tie-break=rankInPool_asc_then_candidateUserId; source=${RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION}`;
}
