/**
 * P7.6-r8b — allowlist apply sidecar writer (never touches MatchResult / worker / display).
 */

import type { Prisma } from "@peima/database";
import {
  isViewerOnP76Allowlist,
  type P76AllowlistApplyEnv,
} from "./p76-allowlist-apply-env";
import {
  P76_ALLOWLIST_APPLY_META_SCHEMA_VERSION,
  P76_ALLOWLIST_APPLY_SOURCE_PIPELINE,
  P76_ALLOWLIST_APPLY_WRITER_SOURCE_VERSION,
  type P76AllowlistApplyBlockedReason,
  type P76AllowlistApplyInputV1,
  type P76AllowlistApplyMetaV1,
  type P76AllowlistApplyResultV1,
  type P76AllowlistSignoffStatus,
} from "./p76-allowlist-apply-meta.types";

export class P76AllowlistApplyWriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76AllowlistApplyWriterError";
  }
}

const PRIVACY_DENY_KEYS = [
  "imageUrl",
  "image_url",
  "detectionScoreJson",
  "detection_score_json",
  "effectiveProfileChatOverlayV1",
  "dimensionBranchChatHints",
  "apiKey",
  "api_key",
  "base64",
  "prompt",
  "vendorRawResponse",
  "vendor_raw_response",
] as const;

export type P76AllowlistApplyWriterPrisma = {
  p76AllowlistApplyMeta: {
    upsert: (args: {
      where: {
        viewerUserId_sourceVersion: {
          viewerUserId: string;
          sourceVersion: string;
        };
      };
      create: Prisma.P76AllowlistApplyMetaCreateInput;
      update: Prisma.P76AllowlistApplyMetaUpdateInput;
    }) => Promise<{ id: string }>;
    update: (args: {
      where: {
        viewerUserId_sourceVersion: {
          viewerUserId: string;
          sourceVersion: string;
        };
      };
      data: Prisma.P76AllowlistApplyMetaUpdateInput;
    }) => Promise<{ id: string }>;
    findUnique: (args: {
      where: {
        viewerUserId_sourceVersion: {
          viewerUserId: string;
          sourceVersion: string;
        };
      };
    }) => Promise<{ rolledBack: boolean } | null>;
  };
  matchResult?: {
    update: (...args: unknown[]) => Promise<unknown>;
  };
};

function norm(s: string): string {
  return s.trim();
}

function signoffOk(
  status: P76AllowlistSignoffStatus,
  required: boolean,
): boolean {
  if (!required) return true;
  return status === "approved";
}

export function assertP76AllowlistApplyForbiddenFlagsFalse(
  input: Pick<
    P76AllowlistApplyInputV1,
    | "appliedToMatchResult"
    | "appliedToFinalScore"
    | "appliedToWorkerRanking"
    | "appliedToPool"
    | "appliedToDisplay"
  >,
): void {
  if (input.appliedToMatchResult === true) {
    throw new P76AllowlistApplyWriterError(
      "appliedToMatchResult=true is forbidden (P0)",
    );
  }
  if (input.appliedToFinalScore === true) {
    throw new P76AllowlistApplyWriterError(
      "appliedToFinalScore=true is forbidden (P0)",
    );
  }
  if (input.appliedToWorkerRanking === true) {
    throw new P76AllowlistApplyWriterError(
      "appliedToWorkerRanking=true is forbidden (P0)",
    );
  }
  if (input.appliedToPool === true) {
    throw new P76AllowlistApplyWriterError("appliedToPool=true is forbidden");
  }
  if (input.appliedToDisplay === true) {
    throw new P76AllowlistApplyWriterError("appliedToDisplay=true is forbidden");
  }
}

export function buildP76AllowlistApplyMetaV1(
  input: P76AllowlistApplyInputV1,
  opts: {
    allowlistMatched: boolean;
    effectiveDryRun: boolean;
    applied: boolean;
    rolledBack?: boolean;
  },
): P76AllowlistApplyMetaV1 {
  assertP76AllowlistApplyForbiddenFlagsFalse(input);

  return {
    schemaVersion: P76_ALLOWLIST_APPLY_META_SCHEMA_VERSION,
    sourceVersion: norm(input.sourceVersion),
    viewerUserId: norm(input.viewerUserId),
    selectedCandidateId: norm(input.selectedCandidateId),
    sourcePipeline: P76_ALLOWLIST_APPLY_SOURCE_PIPELINE,
    stage1SelectedCandidateIds: [...input.stage1SelectedCandidateIds],
    stage2Top2CandidateIds: [...input.stage2Top2CandidateIds],
    selectedBy20DOnlyCandidateId:
      input.selectedBy20DOnlyCandidateId?.trim() || null,
    selectedByRrmCandidateId: input.selectedByRrmCandidateId?.trim() || null,
    finalShadowSelectedCandidateId: norm(input.finalShadowSelectedCandidateId),
    allowlistMatched: opts.allowlistMatched,
    pmSignoffStatus: input.pmSignoffStatus ?? "pending",
    opsSignoffStatus: input.opsSignoffStatus ?? "pending",
    applied: opts.applied,
    appliedToPool: false,
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToDisplay: false,
    appliedToWorkerRanking: false,
    dryRun: opts.effectiveDryRun,
    rolledBack: opts.rolledBack ?? false,
    auditNotes: input.auditNotes ?? {},
  };
}

export function evaluateP76AllowlistApplyEligibility(
  input: P76AllowlistApplyInputV1,
  env: P76AllowlistApplyEnv,
  opts?: { existingRolledBack?: boolean },
): {
  blockedReasons: P76AllowlistApplyBlockedReason[];
  allowlistMatched: boolean;
  effectiveDryRun: boolean;
} {
  assertP76AllowlistApplyForbiddenFlagsFalse(input);

  const blockedReasons: P76AllowlistApplyBlockedReason[] = [];
  const effectiveDryRun = env.dryRun || input.cliDryRun;
  const allowlistMatched = isViewerOnP76Allowlist(input.viewerUserId, env);

  if (!env.enabled) {
    blockedReasons.push("apply_disabled");
  }
  if (!allowlistMatched) {
    blockedReasons.push("viewer_not_allowlisted");
  }
  if (opts?.existingRolledBack) {
    blockedReasons.push("rolled_back");
  }

  const pmStatus = input.pmSignoffStatus ?? "pending";
  const opsStatus = input.opsSignoffStatus ?? "pending";

  if (env.requirePmSignoff && !signoffOk(pmStatus, true)) {
    blockedReasons.push(
      pmStatus === "rejected" ? "pm_signoff_rejected" : "pm_signoff_required",
    );
  }
  if (env.requireOpsSignoff && !signoffOk(opsStatus, true)) {
    blockedReasons.push(
      opsStatus === "rejected" ? "ops_signoff_rejected" : "ops_signoff_required",
    );
  }

  if (!norm(input.selectedCandidateId)) {
    blockedReasons.push("selected_candidate_missing");
  }
  if (
    norm(input.finalShadowSelectedCandidateId) !== norm(input.selectedCandidateId)
  ) {
    blockedReasons.push("final_shadow_mismatch");
  }

  return { blockedReasons, allowlistMatched, effectiveDryRun };
}

function metaToRowData(
  meta: P76AllowlistApplyMetaV1,
  input: P76AllowlistApplyInputV1,
  appliedAt: Date | null,
): Prisma.P76AllowlistApplyMetaCreateInput {
  return {
    viewer: { connect: { id: meta.viewerUserId } },
    selectedCandidateId: meta.selectedCandidateId,
    sourcePipeline: meta.sourcePipeline,
    schemaVersion: meta.schemaVersion,
    sourceVersion: meta.sourceVersion,
    routeCArtifactPath: input.routeCArtifactPath?.trim() || null,
    stage1SelectedCandidateIds: meta.stage1SelectedCandidateIds,
    stage2Top2CandidateIds: meta.stage2Top2CandidateIds,
    selectedBy20DOnlyCandidateId: meta.selectedBy20DOnlyCandidateId,
    selectedByRrmCandidateId: meta.selectedByRrmCandidateId,
    finalShadowSelectedCandidateId: meta.finalShadowSelectedCandidateId,
    allowlistMatched: meta.allowlistMatched,
    pmSignoffStatus: meta.pmSignoffStatus,
    opsSignoffStatus: meta.opsSignoffStatus,
    applied: meta.applied,
    appliedToPool: false,
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToDisplay: false,
    appliedToWorkerRanking: false,
    dryRun: meta.dryRun,
    appliedAt,
    appliedBy: input.appliedBy?.trim() || null,
    rolledBack: meta.rolledBack,
    auditNotes: meta.auditNotes as Prisma.InputJsonValue,
  };
}

export async function writeP76AllowlistApplyMeta(
  prisma: P76AllowlistApplyWriterPrisma,
  input: P76AllowlistApplyInputV1,
  env: P76AllowlistApplyEnv,
  clock: { now: () => Date } = { now: () => new Date() },
): Promise<P76AllowlistApplyResultV1> {
  const existing = await prisma.p76AllowlistApplyMeta.findUnique({
    where: {
      viewerUserId_sourceVersion: {
        viewerUserId: norm(input.viewerUserId),
        sourceVersion: norm(input.sourceVersion),
      },
    },
  });

  const { blockedReasons, allowlistMatched, effectiveDryRun } =
    evaluateP76AllowlistApplyEligibility(input, env, {
      existingRolledBack: existing?.rolledBack === true,
    });

  const blocked = blockedReasons.length > 0;
  const wouldApply = !blocked && env.enabled && allowlistMatched;
  const canWriteSidecar = wouldApply && !effectiveDryRun;

  const metaPreview = buildP76AllowlistApplyMetaV1(input, {
    allowlistMatched,
    effectiveDryRun,
    applied: canWriteSidecar,
    rolledBack: existing?.rolledBack ?? false,
  });

  let wroteSidecar = false;
  let sidecarRowId: string | null = null;

  if (canWriteSidecar) {
    const now = clock.now();
    const row = await prisma.p76AllowlistApplyMeta.upsert({
      where: {
        viewerUserId_sourceVersion: {
          viewerUserId: metaPreview.viewerUserId,
          sourceVersion: metaPreview.sourceVersion,
        },
      },
      create: metaToRowData(metaPreview, input, now),
      update: metaToRowData(metaPreview, input, now),
    });
    wroteSidecar = true;
    sidecarRowId = row.id;
  }

  return {
    schemaVersion: P76_ALLOWLIST_APPLY_WRITER_SOURCE_VERSION,
    generatedAt: clock.now().toISOString(),
    viewerUserId: metaPreview.viewerUserId,
    sourceVersion: metaPreview.sourceVersion,
    effectiveDryRun,
    wouldApply,
    wroteSidecar,
    blocked,
    blockedReasons,
    allowlistMatched,
    meta: metaPreview,
    sidecarRowId,
    applied: false,
  };
}

export type P76AllowlistApplyRollbackInput = {
  viewerUserId: string;
  sourceVersion: string;
  rolledBackBy: string;
  rollbackReason: string;
  rollbackToken?: string | null;
};

export async function rollbackP76AllowlistApplyMeta(
  prisma: P76AllowlistApplyWriterPrisma,
  input: P76AllowlistApplyRollbackInput,
  clock: { now: () => Date } = { now: () => new Date() },
): Promise<{ id: string; rolledBack: true }> {
  const row = await prisma.p76AllowlistApplyMeta.update({
    where: {
      viewerUserId_sourceVersion: {
        viewerUserId: norm(input.viewerUserId),
        sourceVersion: norm(input.sourceVersion),
      },
    },
    data: {
      rolledBack: true,
      rolledBackAt: clock.now(),
      rolledBackBy: norm(input.rolledBackBy),
      rollbackReason: input.rollbackReason.trim(),
      rollbackToken: input.rollbackToken?.trim() || null,
      applied: false,
      dryRun: true,
    },
  });
  return { id: row.id, rolledBack: true };
}

export function assertP76AllowlistApplyResultPrivacySafe(
  value: unknown,
  path = "",
): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertP76AllowlistApplyResultPrivacySafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = path ? `${path}.${key}` : key;
    if (
      PRIVACY_DENY_KEYS.some(
        (deny) => deny.toLowerCase() === key.toLowerCase(),
      )
    ) {
      throw new P76AllowlistApplyWriterError(
        `privacy violation: forbidden key ${full}`,
      );
    }
    assertP76AllowlistApplyResultPrivacySafe(child, full);
  }
}
