import type { PreviewPoolItem, User, UserPreference, UserProfile, UserImage } from "@peima/database";
import {
  computePreferenceScore,
  computeStyleScore,
  type CandidateUserLike,
  type ViewerPreferenceLike,
} from "@peima/shared/matching/preference-score";
import { computeG1rProfileScalarScore } from "../post-pool-deep-screen/post-pool-dimension-g1r";

/**
 * Preview Pool → ShortlistContract v0（只读派生；不改 worker / MatchResult）。
 *
 * --- 冻结规则（v0）---
 *
 * 1) eligible set
 *    - `PreviewPoolItem.displayMode === "full"`
 *    - 且能在输入 maps 中找到该候选的 `UserProfile`（非 null）
 *
 * 2) 从 eligible 中选 2～3（固定）
 *    - eligibleCount >= 3：取前 3
 *    - eligibleCount === 2：取 2
 *    - eligibleCount <= 1：shortlist 原样取尽（0 或 1），不硬凑
 *
 * 3) 固定排序（eligible 内，全为降序，最后一键升序打破并列）
 *    - primary:   profileScalar（高优先）
 *    - secondary: preferenceScore
 *    - tertiary:  baseScore（来自 preview_pool_items）
 *    - quaternary: rankInPool（数值小优先）
 *    - tie:       candidateUserId 字典序升序
 *
 * 4) exclusionReport
 *    - 池内所有未进入 shortlist 的候选各一条记录；reasonCode 取自冻结枚举（见类型）。
 */

export const PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION =
  "preview_pool_shortlist_contract_v0" as const;

export type ShortlistExclusionReasonCodeV0 =
  | "NOT_ELIGIBLE_DISPLAY_MODE"
  | "MISSING_CANDIDATE_PROFILE"
  | "MISSING_CANDIDATE_USER"
  | "TRUNCATED_BY_RANK_RULE";

export type ShortlistStaticEvidenceV0 = {
  rankInPool: number;
  candidateType: string;
  displayMode: string;
  baseScore: number | null;
  preferenceScore: number;
  profileScalar: number;
  styleScore: number;
  styleWeightActive: boolean;
};

export type ShortlistExclusionRowV0 = {
  candidateUserId: string;
  reasonCode: ShortlistExclusionReasonCodeV0;
  /** 人类可读摘要（短句，稳定优先于花哨） */
  detail: string;
};

export type PreviewPoolShortlistContractV0 = {
  schemaVersion: typeof PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION;
  viewerUserId: string;
  poolId: string;
  shortlist: {
    size: number;
    candidateUserIds: string[];
  };
  staticEvidence: Record<string, ShortlistStaticEvidenceV0>;
  exclusionReport: ShortlistExclusionRowV0[];
};

function toViewerPreferenceLike(row: UserPreference | null): ViewerPreferenceLike {
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
    styleTags: row.styleTags ?? [],
  };
}

function toCandidateUserLike(user: User | undefined): CandidateUserLike | null {
  if (!user) return null;
  return {
    age: user.age,
    city: user.city,
    height: user.height,
    education: user.education,
    occupation: user.occupation,
    relationshipGoal: user.relationshipGoal,
  };
}

function compareEligibleV0(
  a: { candidateUserId: string; evidence: ShortlistStaticEvidenceV0 },
  b: { candidateUserId: string; evidence: ShortlistStaticEvidenceV0 },
): number {
  const ea = a.evidence;
  const eb = b.evidence;
  if (eb.profileScalar !== ea.profileScalar) return eb.profileScalar - ea.profileScalar;
  if (eb.preferenceScore !== ea.preferenceScore) return eb.preferenceScore - ea.preferenceScore;
  const ba = ea.baseScore ?? -1;
  const bb = eb.baseScore ?? -1;
  if (bb !== ba) return bb - ba;
  if (ea.rankInPool !== eb.rankInPool) return ea.rankInPool - eb.rankInPool;
  return a.candidateUserId.localeCompare(b.candidateUserId);
}

export function buildPreviewPoolShortlistContractV0(params: {
  viewerUserId: string;
  poolId: string;
  items: PreviewPoolItem[];
  viewerPreference: UserPreference | null;
  viewerProfile: UserProfile | null;
  candidateUserById: Map<string, User>;
  candidateProfileById: Map<string, UserProfile>;
  candidateFirstImageById: Map<string, UserImage | null>;
}): PreviewPoolShortlistContractV0 {
  const viewerPrefLike = toViewerPreferenceLike(params.viewerPreference);

  const staticEvidence: Record<string, ShortlistStaticEvidenceV0> = {};
  const exclusionReport: ShortlistExclusionRowV0[] = [];

  type EligibleRow = { candidateUserId: string; evidence: ShortlistStaticEvidenceV0 };
  const eligible: EligibleRow[] = [];

  for (const item of params.items) {
    const cid = item.candidateUserId;
    const user = params.candidateUserById.get(cid);
    const candUser = toCandidateUserLike(user);
    const candProf = params.candidateProfileById.get(cid) ?? null;
    const img = params.candidateFirstImageById.get(cid) ?? null;

    const preferenceScore = candUser
      ? computePreferenceScore(viewerPrefLike, candUser)
      : 0;
    const { score: styleScore, styleWeightActive } = computeStyleScore(viewerPrefLike, {
      styleTags: img?.styleTags ?? [],
    });
    const profileScalar = computeG1rProfileScalarScore(params.viewerProfile, candProf);

    const evidence: ShortlistStaticEvidenceV0 = {
      rankInPool: item.rankInPool,
      candidateType: item.candidateType,
      displayMode: item.displayMode,
      baseScore: item.baseScore,
      preferenceScore,
      profileScalar,
      styleScore,
      styleWeightActive,
    };
    staticEvidence[cid] = evidence;

    if (item.displayMode !== "full") {
      exclusionReport.push({
        candidateUserId: cid,
        reasonCode: "NOT_ELIGIBLE_DISPLAY_MODE",
        detail: `displayMode=${item.displayMode}（v0 仅 full 可入 shortlist）`,
      });
      continue;
    }
    if (!candUser) {
      exclusionReport.push({
        candidateUserId: cid,
        reasonCode: "MISSING_CANDIDATE_USER",
        detail: "候选 User 行缺失，无法计算 preferenceScore",
      });
      continue;
    }
    if (!candProf) {
      exclusionReport.push({
        candidateUserId: cid,
        reasonCode: "MISSING_CANDIDATE_PROFILE",
        detail: "候选 questionnaire profile 缺失（user_profiles）",
      });
      continue;
    }

    eligible.push({ candidateUserId: cid, evidence });
  }

  eligible.sort(compareEligibleV0);

  let take = 0;
  if (eligible.length >= 3) take = 3;
  else if (eligible.length === 2) take = 2;
  else take = eligible.length;

  const shortlistIds = eligible.slice(0, take).map((e) => e.candidateUserId);
  const shortlistSet = new Set(shortlistIds);

  for (const row of eligible.slice(take)) {
    exclusionReport.push({
      candidateUserId: row.candidateUserId,
      reasonCode: "TRUNCATED_BY_RANK_RULE",
      detail:
        "满足 v0 eligible，但未进入 shortlist：按 profileScalar→preferenceScore→baseScore→rankInPool→id 排序截断",
    });
  }

  exclusionReport.sort((a, b) => a.candidateUserId.localeCompare(b.candidateUserId));

  return {
    schemaVersion: PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION,
    viewerUserId: params.viewerUserId,
    poolId: params.poolId,
    shortlist: { size: shortlistIds.length, candidateUserIds: shortlistIds },
    staticEvidence,
    exclusionReport,
  };
}
