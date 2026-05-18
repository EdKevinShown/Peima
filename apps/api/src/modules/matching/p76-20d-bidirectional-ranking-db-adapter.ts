/**
 * P7.6-r4b: read-only DB adapter for 20D bidirectional ranking shadow audit.
 */

import type { PrismaClient, UserPreference } from "@peima/database";
import {
  computePreferenceScore,
  type CandidateUserLike,
  type ViewerPreferenceLike,
} from "@peima/shared/matching/preference-score";
import { buildTwentyDBidirectionalRankingShadowV1 } from "./p76-20d-bidirectional-ranking-shadow";
import type {
  TwentyDBidirectionalRankingInputV1,
  TwentyDBidirectionalRankingShadowV1,
  TwentyDCandidateInputV1,
  TwentyDPoolSourceType,
} from "./p76-20d-bidirectional-ranking.types";
import type { P76R4bTwentyDBidirectionalRankingAuditCliArgs } from "../../dev-cli/p76-r4b-20d-bidirectional-ranking-audit-cli-args";
import {
  computeProfileScoreP76,
  hasMeaningfulP76Profile,
  P76_PROFILE_DIM_KEYS_FOR_SELECT,
  P76_SENSITIVE_PROFILE_JSON_KEYS,
  toP76UserProfileLike,
  type P76UserProfileLike,
} from "./p76-20d-bidirectional-ranking-profile-score";

export const P76_R4B_AUDIT_SCHEMA_VERSION =
  "p7.6-r4b-20d-bidirectional-ranking-audit-v1" as const;

const USER_DEMO_SELECT = {
  id: true,
  age: true,
  city: true,
  height: true,
  education: true,
  occupation: true,
  relationshipGoal: true,
} as const;

const PROFILE_SELECT = Object.fromEntries(
  P76_PROFILE_DIM_KEYS_FOR_SELECT.map((k) => [k, true]),
) as Record<string, true>;

export type P76TwentyDCandidateLoaded = {
  candidateUserId: string;
  candidateUser: CandidateUserLike;
  viewerUser: CandidateUserLike;
  viewerPrefForAtoB: ViewerPreferenceLike;
  candidatePrefForBtoA: ViewerPreferenceLike;
  viewerProfile: P76UserProfileLike | null;
  candidateProfile: P76UserProfileLike | null;
};

export type P76TwentyDLoadedContext = {
  viewerUserId: string;
  candidateUserIds: string[];
  sourcePoolType: TwentyDPoolSourceType;
  stage1SourceVersion: string;
  viewerProfilePresent: boolean;
  viewerPref: ViewerPreferenceLike;
  viewerProfile: P76UserProfileLike | null;
  viewerUser: CandidateUserLike;
  candidates: P76TwentyDCandidateLoaded[];
};

export type TwentyDBidirectionalRankingAuditReportV1 = {
  schemaVersion: typeof P76_R4B_AUDIT_SCHEMA_VERSION;
  generatedAt: string;
  viewerUserId: string;
  sourcePoolType: TwentyDPoolSourceType;
  candidateUserIds: string[];
  topN: number;
  dryRun: true;
  scannedCandidates: number;
  rankedCandidates: number;
  top2CandidateIds: string[];
  selectedBy20DOnlyCandidateId: string | null;
  fallbackReasonDistribution: Record<string, number>;
  shadow: TwentyDBidirectionalRankingShadowV1;
  applied: false;
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

function toCandidateUserLike(
  row: Pick<
    CandidateUserLike,
    "age" | "city" | "height" | "education" | "occupation" | "relationshipGoal"
  >,
): CandidateUserLike {
  return {
    age: row.age ?? null,
    city: row.city ?? "",
    height: row.height ?? null,
    education: row.education ?? "",
    occupation: row.occupation ?? "",
    relationshipGoal: row.relationshipGoal ?? "",
  };
}

function preferenceScoreOrNull(
  pref: ViewerPreferenceLike,
  candidate: CandidateUserLike,
): number | null {
  if (!pref) return null;
  return computePreferenceScore(pref, candidate);
}

function profileScoreOrNull(
  viewer: P76UserProfileLike | null,
  candidate: P76UserProfileLike | null,
): number | null {
  if (!hasMeaningfulP76Profile(viewer) || !hasMeaningfulP76Profile(candidate)) {
    return null;
  }
  return computeProfileScoreP76(viewer!, candidate!);
}

export function buildTwentyDCandidateInputV1(
  loaded: P76TwentyDCandidateLoaded,
): TwentyDCandidateInputV1 {
  const {
    candidateUserId,
    candidateUser,
    viewerPrefForAtoB,
    candidatePrefForBtoA,
    viewerProfile,
    candidateProfile,
    viewerUser,
  } = loaded;

  return {
    candidateUserId,
    profileScoreAtoB: profileScoreOrNull(viewerProfile, candidateProfile),
    preferenceScoreAtoB: preferenceScoreOrNull(
      viewerPrefForAtoB,
      candidateUser,
    ),
    profileScoreBtoA: profileScoreOrNull(candidateProfile, viewerProfile),
    preferenceScoreBtoA: preferenceScoreOrNull(
      candidatePrefForBtoA,
      viewerUser,
    ),
  };
}

export function buildTwentyDInputV1FromLoadedContext(
  context: P76TwentyDLoadedContext,
  generatedAt: string,
  topN: number,
): TwentyDBidirectionalRankingInputV1 {
  return {
    viewerUserId: context.viewerUserId,
    sourcePoolType: context.sourcePoolType,
    generatedAt,
    stage1: {
      sourceVersion: context.stage1SourceVersion,
      selectedCandidateIds: [...context.candidateUserIds],
    },
    viewerProfilePresent: context.viewerProfilePresent,
    candidates: context.candidates.map((c) => buildTwentyDCandidateInputV1(c)),
    topN,
    top2: 2,
  };
}

export function countTwentyDFallbackReasonDistribution(
  shadow: TwentyDBidirectionalRankingShadowV1,
): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const row of shadow.stage2TwentyD.rankedCandidates) {
    const reason = row.fallbackReason;
    if (!reason) continue;
    dist[reason] = (dist[reason] ?? 0) + 1;
  }
  return dist;
}

export function buildTwentyDBidirectionalRankingAuditReportV1(input: {
  cli: P76R4bTwentyDBidirectionalRankingAuditCliArgs;
  generatedAt: string;
  shadow: TwentyDBidirectionalRankingShadowV1;
}): TwentyDBidirectionalRankingAuditReportV1 {
  const { shadow, cli, generatedAt } = input;
  const ranked = shadow.stage2TwentyD.rankedCandidates;

  return {
    schemaVersion: P76_R4B_AUDIT_SCHEMA_VERSION,
    generatedAt,
    viewerUserId: cli.viewerUserId,
    sourcePoolType: cli.sourcePoolType,
    candidateUserIds: [...cli.candidateUserIds],
    topN: cli.topN,
    dryRun: true,
    scannedCandidates: cli.candidateUserIds.length,
    rankedCandidates: ranked.length,
    top2CandidateIds: [...shadow.stage2TwentyD.top2CandidateIds],
    selectedBy20DOnlyCandidateId:
      shadow.stage2TwentyD.selectedBy20DOnlyCandidateId,
    fallbackReasonDistribution: countTwentyDFallbackReasonDistribution(shadow),
    shadow,
    applied: false,
  };
}

const SENSITIVE_JSON_KEYS = new Set([
  "apiKey",
  "base64",
  "prompt",
  "imageUrl",
  "detectionScoreJson",
  "rawBody",
  "vendorRaw",
  ...P76_SENSITIVE_PROFILE_JSON_KEYS,
]);

export function assertP76TwentyDAuditReportPrivacySafe(
  value: unknown,
  path = "root",
): void {
  if (value == null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertP76TwentyDAuditReportPrivacySafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_JSON_KEYS.has(key)) {
      throw new Error(`sensitive field at ${path}.${key}`);
    }
    assertP76TwentyDAuditReportPrivacySafe(child, `${path}.${key}`);
  }
}

export async function loadP76TwentyDContext(
  prisma: PrismaClient,
  args: {
    viewerUserId: string;
    candidateUserIds: string[];
    sourcePoolType: TwentyDPoolSourceType;
    stage1SourceVersion: string;
  },
): Promise<P76TwentyDLoadedContext> {
  const viewerRow = await prisma.user.findUnique({
    where: { id: args.viewerUserId },
    select: {
      ...USER_DEMO_SELECT,
      preference: true,
      relationProfile: { select: PROFILE_SELECT },
    },
  });

  const viewerProfile = toP76UserProfileLike(
    viewerRow?.relationProfile ?? null,
  );
  const viewerProfilePresent = hasMeaningfulP76Profile(viewerProfile);
  const viewerPref = toViewerPreferenceLike(viewerRow?.preference ?? null);
  const viewerUser = viewerRow
    ? toCandidateUserLike(viewerRow)
    : {
        age: null,
        city: "",
        height: null,
        education: "",
        occupation: "",
        relationshipGoal: "",
      };

  const candidateRows =
    args.candidateUserIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: args.candidateUserIds } },
          select: {
            ...USER_DEMO_SELECT,
            preference: true,
            relationProfile: { select: PROFILE_SELECT },
          },
        });

  const byId = new Map(candidateRows.map((r) => [r.id, r]));

  const candidates: P76TwentyDCandidateLoaded[] = args.candidateUserIds.map(
    (candidateUserId) => {
      const row = byId.get(candidateUserId);
      const candidateProfile = toP76UserProfileLike(
        row?.relationProfile ?? null,
      );
      return {
        candidateUserId,
        candidateUser: row
          ? toCandidateUserLike(row)
          : {
              age: null,
              city: "",
              height: null,
              education: "",
              occupation: "",
              relationshipGoal: "",
            },
        viewerPrefForAtoB: viewerPref,
        candidatePrefForBtoA: toViewerPreferenceLike(row?.preference ?? null),
        viewerProfile,
        candidateProfile,
        viewerUser,
      };
    },
  );

  return {
    viewerUserId: args.viewerUserId,
    candidateUserIds: [...args.candidateUserIds],
    sourcePoolType: args.sourcePoolType,
    stage1SourceVersion: args.stage1SourceVersion,
    viewerProfilePresent,
    viewerPref,
    viewerProfile,
    viewerUser,
    candidates,
  };
}

export async function runTwentyDBidirectionalRankingAuditFromDb(
  prisma: PrismaClient,
  cli: P76R4bTwentyDBidirectionalRankingAuditCliArgs,
): Promise<TwentyDBidirectionalRankingAuditReportV1> {
  const generatedAt = new Date().toISOString();
  const context = await loadP76TwentyDContext(prisma, {
    viewerUserId: cli.viewerUserId,
    candidateUserIds: cli.candidateUserIds,
    sourcePoolType: cli.sourcePoolType,
    stage1SourceVersion: cli.stage1SourceVersion,
  });

  const poolInput = buildTwentyDInputV1FromLoadedContext(
    context,
    generatedAt,
    cli.topN,
  );
  const shadow = buildTwentyDBidirectionalRankingShadowV1(poolInput);

  return buildTwentyDBidirectionalRankingAuditReportV1({
    cli,
    generatedAt,
    shadow,
  });
}
