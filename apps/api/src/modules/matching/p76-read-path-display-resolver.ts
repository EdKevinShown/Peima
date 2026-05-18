/**
 * P7.6-r8h1 — read-only display overlay from P7.6 allowlist sidecar.
 * sidecar `applied=true` means sidecar written — NOT production apply.
 */

import type { PrismaService } from "../../common/prisma/prisma.service";
import {
  deriveP76AdminStatuses,
  deriveP76SidecarStatus,
} from "./p76-admin-allowlist-apply-meta.derive";
import type {
  P76AdminViolationStatus,
  P76AllowlistApplyMetaDbRow,
} from "./p76-admin-allowlist-apply-meta.types";
import {
  isViewerOnP76ReadPathAllowlist,
  readP76ReadPathEnv,
  type P76ReadPathEnv,
} from "./p76-read-path-env";

export { readP76ReadPathEnv } from "./p76-read-path-env";

export const P76_READ_PATH_DISPLAY_SOURCE_TYPE =
  "p76_allowlist_sidecar_readonly" as const;

export type P76ReadPathDisplaySourceType = typeof P76_READ_PATH_DISPLAY_SOURCE_TYPE;

const FORBIDDEN_DISPLAY_SOURCE_NAMES = [
  "production_apply",
  "final_replacement",
  "worker_winner",
  "percent_rollout",
] as const;

export type P76ReadPathDisplayMeta = {
  enabled: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  sidecarId: string | null;
  sourceVersion: string | null;
  rolledBack: boolean | null;
  violationStatus: P76AdminViolationStatus | string | null;
  pmSignoffStatus: string | null;
  opsSignoffStatus: string | null;
};

export type P76ReadPathDisplayOverlay = {
  eligible: boolean;
  displayCandidateUserId: string | null;
  displaySourceType: P76ReadPathDisplaySourceType | null;
  fallbackReason: string | null;
  meta: P76ReadPathDisplayMeta;
};

/** Legacy display slice from `resolveMatchResultDisplay` (before P7.6 overlay). */
export type P76ReadPathLegacyDisplayInput = {
  displayCandidateUserId: string;
  displaySourceType: string;
  finalMatchDecisionMeta: unknown;
};

export type P76ReadPathResolverInput = {
  viewerUserId: string;
  legacyDisplay: P76ReadPathLegacyDisplayInput;
  sourceVersion?: string;
};

function isSignoffApproved(status: string, required: boolean): boolean {
  if (!required) return true;
  return status.trim().toLowerCase() === "approved";
}

export function deriveP76ReadPathFallbackReason(params: {
  env: P76ReadPathEnv;
  viewerUserId: string;
  row: P76AllowlistApplyMetaDbRow | null;
  violationStatus: P76AdminViolationStatus | null;
  sidecarStatus: "dry_run" | "written" | "rolled_back" | null;
  candidateFound: boolean | null;
  error?: unknown;
}): string {
  const { env, viewerUserId, row, violationStatus, sidecarStatus, candidateFound, error } =
    params;
  if (error != null) return "exception";
  if (!env.enabled) return "env_disabled";
  if (!isViewerOnP76ReadPathAllowlist(viewerUserId, env)) return "not_allowlisted";
  if (!row) return "missing_sidecar";
  if (row.sourceVersion !== env.sourceVersion) return "stale_source_version";
  const selected = row.selectedCandidateId?.trim() ?? "";
  if (!selected) return "missing_candidate_id";
  if (row.rolledBack) return "rolled_back";
  if (!row.allowlistMatched) return "non_allowlist_row";
  if (sidecarStatus === "dry_run") return "sidecar_dry_run";
  if (env.requirePmSignoff && !isSignoffApproved(row.pmSignoffStatus, true)) {
    return "pm_signoff_pending";
  }
  if (env.requireOpsSignoff && !isSignoffApproved(row.opsSignoffStatus, true)) {
    return "ops_signoff_pending";
  }
  if (row.appliedToMatchResult) return "main_chain_flag_match_result";
  if (row.appliedToFinalScore) return "main_chain_flag_final_score";
  if (row.appliedToWorkerRanking) return "main_chain_flag_worker_ranking";
  if (row.appliedToDisplay) return "main_chain_flag_display";
  if (env.strictViolationBlock && violationStatus && violationStatus !== "ok") {
    return `violation_${violationStatus}`;
  }
  if (sidecarStatus !== "written") return "sidecar_not_written";
  if (candidateFound === false) return "candidate_unavailable";
  return "eligible";
}

export function validateP76SidecarReadEligibility(
  row: P76AllowlistApplyMetaDbRow,
  env: P76ReadPathEnv,
  opts?: {
    violationStatus?: P76AdminViolationStatus;
    sidecarStatus?: "dry_run" | "written" | "rolled_back";
    candidateFound?: boolean;
  },
): { ok: true } | { ok: false; reason: string } {
  const derived = opts?.violationStatus
    ? {
        violationStatus: opts.violationStatus,
        sidecarStatus: opts.sidecarStatus ?? deriveP76SidecarStatus(row),
      }
    : deriveP76AdminStatuses(row, { currentSourceVersion: env.sourceVersion });

  const reason = deriveP76ReadPathFallbackReason({
    env,
    viewerUserId: row.viewerUserId,
    row,
    violationStatus: derived.violationStatus,
    sidecarStatus: derived.sidecarStatus,
    candidateFound: opts?.candidateFound ?? null,
  });

  if (reason === "eligible") {
    return { ok: true };
  }
  return { ok: false, reason };
}

export function buildP76ReadPathDisplayOverlay(
  row: P76AllowlistApplyMetaDbRow,
  env: P76ReadPathEnv,
): P76ReadPathDisplayOverlay {
  const derived = deriveP76AdminStatuses(row, {
    currentSourceVersion: env.sourceVersion,
  });
  const candidateId = row.selectedCandidateId.trim();
  return {
    eligible: true,
    displayCandidateUserId: candidateId,
    displaySourceType: P76_READ_PATH_DISPLAY_SOURCE_TYPE,
    fallbackReason: null,
    meta: {
      enabled: env.enabled,
      fallbackUsed: false,
      fallbackReason: null,
      sidecarId: row.id,
      sourceVersion: row.sourceVersion,
      rolledBack: row.rolledBack,
      violationStatus: derived.violationStatus,
      pmSignoffStatus: row.pmSignoffStatus,
      opsSignoffStatus: row.opsSignoffStatus,
    },
  };
}

function buildIneligibleOverlay(
  env: P76ReadPathEnv,
  fallbackReason: string,
  partial: Partial<P76ReadPathDisplayMeta> = {},
): P76ReadPathDisplayOverlay {
  return {
    eligible: false,
    displayCandidateUserId: null,
    displaySourceType: null,
    fallbackReason,
    meta: {
      enabled: env.enabled,
      fallbackUsed: true,
      fallbackReason,
      sidecarId: null,
      sourceVersion: env.sourceVersion,
      rolledBack: null,
      violationStatus: null,
      pmSignoffStatus: null,
      opsSignoffStatus: null,
      ...partial,
    },
  };
}

export function assertP76ReadPathDisplaySourceTypeSafe(
  displaySourceType: string | null | undefined,
): void {
  if (displaySourceType == null) return;
  const lower = displaySourceType.trim().toLowerCase();
  for (const forbidden of FORBIDDEN_DISPLAY_SOURCE_NAMES) {
    if (lower === forbidden || lower.includes(forbidden)) {
      throw new Error(`forbidden displaySourceType: ${displaySourceType}`);
    }
  }
}

export async function resolveP76AllowlistSidecarDisplayCandidate(
  prisma: PrismaService,
  input: P76ReadPathResolverInput,
  env: P76ReadPathEnv = readP76ReadPathEnv(),
): Promise<P76ReadPathDisplayOverlay> {
  const viewerUserId = input.viewerUserId.trim();
  const sourceVersion = input.sourceVersion?.trim() || env.sourceVersion;

  if (!env.enabled) {
    return buildIneligibleOverlay(env, "env_disabled");
  }
  if (!isViewerOnP76ReadPathAllowlist(viewerUserId, env)) {
    return buildIneligibleOverlay(env, "not_allowlisted");
  }

  const row = await prisma.p76AllowlistApplyMeta.findUnique({
    where: {
      viewerUserId_sourceVersion: {
        viewerUserId,
        sourceVersion,
      },
    },
  });

  if (!row) {
    return buildIneligibleOverlay(env, "missing_sidecar", { sourceVersion });
  }

  const dbRow = row as unknown as P76AllowlistApplyMetaDbRow;
  const derived = deriveP76AdminStatuses(dbRow, { currentSourceVersion: sourceVersion });

  const candidateId = dbRow.selectedCandidateId?.trim() ?? "";
  let candidateFound: boolean | null = null;
  if (candidateId) {
    const userOk = await prisma.user.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    candidateFound = !!userOk;
  }

  const elig = validateP76SidecarReadEligibility(dbRow, { ...env, sourceVersion }, {
    violationStatus: derived.violationStatus,
    sidecarStatus: derived.sidecarStatus,
    candidateFound: candidateFound ?? false,
  });

  if (!elig.ok) {
    return buildIneligibleOverlay(env, elig.reason, {
      sidecarId: dbRow.id,
      sourceVersion: dbRow.sourceVersion,
      rolledBack: dbRow.rolledBack,
      violationStatus: derived.violationStatus,
      pmSignoffStatus: dbRow.pmSignoffStatus,
      opsSignoffStatus: dbRow.opsSignoffStatus,
    });
  }

  assertP76ReadPathDisplaySourceTypeSafe(P76_READ_PATH_DISPLAY_SOURCE_TYPE);
  return buildP76ReadPathDisplayOverlay(dbRow, { ...env, sourceVersion });
}

export type P76ReadPathDisplayOverlayResult = P76ReadPathLegacyDisplayInput & {
  p76ReadPathMeta?: P76ReadPathDisplayMeta;
};

/**
 * Overlay P7.6 sidecar display on legacy resolver output. Never throws; always returns display fields.
 */
export async function applyP76ReadPathDisplayOverlay(
  prisma: PrismaService,
  input: P76ReadPathResolverInput,
): Promise<P76ReadPathDisplayOverlayResult> {
  const legacy = input.legacyDisplay;
  try {
    const overlay = await resolveP76AllowlistSidecarDisplayCandidate(prisma, input);
    if (!overlay.eligible || !overlay.displayCandidateUserId) {
      return {
        ...legacy,
        p76ReadPathMeta: overlay.meta,
      };
    }
    assertP76ReadPathDisplaySourceTypeSafe(overlay.displaySourceType);
    return {
      displayCandidateUserId: overlay.displayCandidateUserId,
      displaySourceType: P76_READ_PATH_DISPLAY_SOURCE_TYPE,
      finalMatchDecisionMeta: legacy.finalMatchDecisionMeta,
      p76ReadPathMeta: overlay.meta,
    };
  } catch {
    const env = readP76ReadPathEnv();
    return {
      ...legacy,
      p76ReadPathMeta: {
        ...buildIneligibleOverlay(env, "exception").meta,
        fallbackReason: "exception",
      },
    };
  }
}
