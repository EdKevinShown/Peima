/**
 * P7.6-r5b: read-only DB adapter for RRM Top2 Final Selector shadow audit.
 */

import type { PrismaClient } from "@peima/database";
import { buildRrmTop2FinalSelectorShadowV1 } from "./p76-rrm-top2-final-selector-shadow";
import type {
  RrmPoolSourceType,
  RrmTop2CandidateInputV1,
  RrmTop2FinalSelectorInputV1,
  RrmTop2FinalSelectorShadowV1,
} from "./p76-rrm-top2-final-selector.types";
import type { P76R5bRrmTop2FinalSelectorAuditCliArgs } from "../../dev-cli/p76-r5b-rrm-top2-final-selector-audit-cli-args";
import {
  buildP76RrmRiskAndRepairFlags,
  computeRhythmCompatibilityP76,
  hasMeaningfulP76RrmProfile,
  P76_RRM_RHYTHM_DIM_KEYS_FOR_SELECT,
  P76_SENSITIVE_RRM_PROFILE_JSON_KEYS,
  toP76RrmRhythmProfileLike,
  type P76RrmRhythmProfileLike,
} from "./p76-rrm-top2-rhythm-profile";

export const P76_R5B_AUDIT_SCHEMA_VERSION =
  "p7.6-r5b-rrm-top2-final-selector-audit-v1" as const;

const PROFILE_SELECT = Object.fromEntries(
  P76_RRM_RHYTHM_DIM_KEYS_FOR_SELECT.map((k) => [k, true]),
) as Record<string, true>;

export type P76RrmTop2CandidateLoaded = {
  candidateUserId: string;
  candidateProfile: P76RrmRhythmProfileLike | null;
};

export type P76RrmTop2LoadedContext = {
  viewerUserId: string;
  top2CandidateIds: [string, string];
  selectedBy20DOnlyCandidateId: string;
  sourcePoolType: RrmPoolSourceType;
  stage2SourceVersion: string;
  viewerRrmProfilePresent: boolean;
  viewerProfile: P76RrmRhythmProfileLike | null;
  candidates: P76RrmTop2CandidateLoaded[];
};

export type RrmTop2FinalSelectorAuditReportV1 = {
  schemaVersion: typeof P76_R5B_AUDIT_SCHEMA_VERSION;
  generatedAt: string;
  viewerUserId: string;
  sourcePoolType: RrmPoolSourceType;
  top2CandidateIds: [string, string];
  selectedBy20DOnlyCandidateId: string;
  dryRun: true;
  evaluatedCandidates: number;
  selectedByRrmCandidateId: string | null;
  wouldChange20DWinner: boolean;
  fallbackReasonDistribution: Record<string, number>;
  shadow: RrmTop2FinalSelectorShadowV1;
  applied: false;
};

export function buildRrmTop2CandidateInputV1(
  viewerProfile: P76RrmRhythmProfileLike,
  candidate: P76RrmTop2CandidateLoaded,
): RrmTop2CandidateInputV1 {
  const candProfile = candidate.candidateProfile;
  const flags =
    viewerProfile && candProfile
      ? buildP76RrmRiskAndRepairFlags(viewerProfile, candProfile)
      : {
          rhythmRiskFlags: [] as string[],
          pressureRiskFlags: [] as string[],
          boundaryRiskFlags: [] as string[],
          repairPotentialSignals: [] as string[],
        };

  return {
    candidateUserId: candidate.candidateUserId,
    rhythmScoreAtoB:
      viewerProfile && candProfile
        ? computeRhythmCompatibilityP76(viewerProfile, candProfile)
        : null,
    rhythmScoreBtoA:
      viewerProfile && candProfile
        ? computeRhythmCompatibilityP76(candProfile, viewerProfile)
        : null,
    rhythmRiskFlags: flags.rhythmRiskFlags,
    pressureRiskFlags: flags.pressureRiskFlags,
    boundaryRiskFlags: flags.boundaryRiskFlags,
    repairPotentialSignals: flags.repairPotentialSignals,
  };
}

export function buildRrmTop2InputV1FromLoadedContext(
  context: P76RrmTop2LoadedContext,
  generatedAt: string,
): RrmTop2FinalSelectorInputV1 {
  const viewerProfile = context.viewerProfile;

  return {
    viewerUserId: context.viewerUserId,
    sourcePoolType: context.sourcePoolType,
    generatedAt,
    stage1: {
      sourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
      selectedCandidateIds: [],
    },
    stage2TwentyD: {
      sourceVersion: context.stage2SourceVersion,
      top2CandidateIds: [...context.top2CandidateIds],
      selectedBy20DOnlyCandidateId: context.selectedBy20DOnlyCandidateId,
    },
    viewerRrmProfilePresent: context.viewerRrmProfilePresent,
    candidates: context.viewerProfile
      ? context.candidates.map((c) =>
          buildRrmTop2CandidateInputV1(context.viewerProfile!, c),
        )
      : context.candidates.map((c) => ({
          candidateUserId: c.candidateUserId,
          rhythmScoreAtoB: null,
          rhythmScoreBtoA: null,
        })),
  };
}

export function countRrmFallbackReasonDistribution(
  shadow: RrmTop2FinalSelectorShadowV1,
): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const row of shadow.stage3Rrm.rankedCandidates) {
    const reason = row.fallbackReason;
    if (!reason) continue;
    dist[reason] = (dist[reason] ?? 0) + 1;
  }
  return dist;
}

const SENSITIVE_JSON_KEYS = new Set([
  "apiKey",
  "base64",
  "prompt",
  "imageUrl",
  "detectionScoreJson",
  "rawBody",
  "vendorRaw",
  ...P76_SENSITIVE_RRM_PROFILE_JSON_KEYS,
]);

export function assertP76RrmTop2AuditReportPrivacySafe(
  value: unknown,
  path = "root",
): void {
  if (value == null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertP76RrmTop2AuditReportPrivacySafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_JSON_KEYS.has(key)) {
      throw new Error(`sensitive field at ${path}.${key}`);
    }
    assertP76RrmTop2AuditReportPrivacySafe(child, `${path}.${key}`);
  }
}

export async function loadP76RrmTop2Context(
  prisma: PrismaClient,
  args: {
    viewerUserId: string;
    top2CandidateIds: [string, string];
    selectedBy20DOnlyCandidateId: string;
    sourcePoolType: RrmPoolSourceType;
    stage2SourceVersion: string;
  },
): Promise<P76RrmTop2LoadedContext> {
  const viewerRow = await prisma.user.findUnique({
    where: { id: args.viewerUserId },
    select: {
      id: true,
      relationProfile: { select: PROFILE_SELECT },
    },
  });

  const viewerProfile = toP76RrmRhythmProfileLike(
    viewerRow?.relationProfile ?? null,
  );
  const viewerRrmProfilePresent = hasMeaningfulP76RrmProfile(viewerProfile);

  const candidateRows = await prisma.user.findMany({
    where: { id: { in: [...args.top2CandidateIds] } },
    select: {
      id: true,
      relationProfile: { select: PROFILE_SELECT },
    },
  });

  const byId = new Map(candidateRows.map((r) => [r.id, r]));

  const candidates: P76RrmTop2CandidateLoaded[] = args.top2CandidateIds.map(
    (candidateUserId) => {
      const row = byId.get(candidateUserId);
      return {
        candidateUserId,
        candidateProfile: toP76RrmRhythmProfileLike(
          row?.relationProfile ?? null,
        ),
      };
    },
  );

  return {
    viewerUserId: args.viewerUserId,
    top2CandidateIds: args.top2CandidateIds,
    selectedBy20DOnlyCandidateId: args.selectedBy20DOnlyCandidateId,
    sourcePoolType: args.sourcePoolType,
    stage2SourceVersion: args.stage2SourceVersion,
    viewerRrmProfilePresent,
    viewerProfile,
    candidates,
  };
}

export async function runRrmTop2FinalSelectorAuditFromDb(
  prisma: PrismaClient,
  cli: P76R5bRrmTop2FinalSelectorAuditCliArgs,
): Promise<RrmTop2FinalSelectorAuditReportV1> {
  const generatedAt = new Date().toISOString();
  const context = await loadP76RrmTop2Context(prisma, {
    viewerUserId: cli.viewerUserId,
    top2CandidateIds: cli.top2CandidateIds,
    selectedBy20DOnlyCandidateId: cli.selectedBy20DOnlyCandidateId,
    sourcePoolType: cli.sourcePoolType,
    stage2SourceVersion: cli.stage2SourceVersion,
  });

  const poolInput: RrmTop2FinalSelectorInputV1 = {
    viewerUserId: context.viewerUserId,
    sourcePoolType: context.sourcePoolType,
    generatedAt,
    stage1: {
      sourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
      selectedCandidateIds: [],
    },
    stage2TwentyD: {
      sourceVersion: context.stage2SourceVersion,
      top2CandidateIds: [...context.top2CandidateIds],
      selectedBy20DOnlyCandidateId: context.selectedBy20DOnlyCandidateId,
    },
    viewerRrmProfilePresent: context.viewerRrmProfilePresent,
    candidates: context.viewerProfile
      ? context.candidates.map((c) => buildRrmTop2CandidateInputV1(context.viewerProfile!, c))
      : context.candidates.map((c) => ({
          candidateUserId: c.candidateUserId,
          rhythmScoreAtoB: null,
          rhythmScoreBtoA: null,
        })),
  };

  const shadow = buildRrmTop2FinalSelectorShadowV1(poolInput);

  return {
    schemaVersion: P76_R5B_AUDIT_SCHEMA_VERSION,
    generatedAt,
    viewerUserId: cli.viewerUserId,
    sourcePoolType: cli.sourcePoolType,
    top2CandidateIds: cli.top2CandidateIds,
    selectedBy20DOnlyCandidateId: cli.selectedBy20DOnlyCandidateId,
    dryRun: true,
    evaluatedCandidates: shadow.stage3Rrm.evaluatedCandidateIds.length,
    selectedByRrmCandidateId: shadow.stage3Rrm.selectedByRrmCandidateId,
    wouldChange20DWinner: shadow.stage3Rrm.wouldChange20DWinner,
    fallbackReasonDistribution: countRrmFallbackReasonDistribution(shadow),
    shadow,
    applied: false,
  };
}
