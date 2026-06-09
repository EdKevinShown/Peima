/**
 * P7.10-r10 — safe fallback final policy (read path only).
 * Formal MatchResult writes from legacy PreviewPool / photo-style batch-match are forbidden
 * when the r9 writer shutdown gate is active (default).
 */

import type {
  MatchResultNoRowContractPayload,
  MatchQueueStatus,
} from "./matching-result-state";
import { userMessageForNoResultReason } from "./matching-user-messages";

export const P710_R10_SAFE_FALLBACK_FINAL_POLICY_VERSION =
  "p7.10-r10-safe-fallback-final-v1" as const;

/** Allowed viewer-facing fallback tiers after r10. */
export const P710_R10_SAFE_FALLBACK_TIERS = [
  "canonical_result",
  "stable_baseline",
  "matching_pending",
  "no_result",
] as const;

export type P710R10SafeFallbackTier = (typeof P710_R10_SAFE_FALLBACK_TIERS)[number];

const TRUTHY = new Set(["1", "true", "yes"]);
const FALSY = new Set(["0", "false", "no"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return defaultValue;
}

export type P710R10OldPhotoWriterShutdownReadEnv = {
  shutdownEnabled: boolean;
  writerEnabled: boolean;
  /** True when legacy batch-match must not create MatchResult (default). */
  writerWritesBlocked: boolean;
};

/**
 * Mirrors worker `readOldPhotoMatchingWriterGate` defaults for API read-path messaging only.
 * Does not trigger worker or mutate percent.
 */
export function readP710R10OldPhotoWriterShutdownReadEnv(
  env: NodeJS.ProcessEnv = process.env,
): P710R10OldPhotoWriterShutdownReadEnv {
  const shutdownEnabled = parseTruthy(
    env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED,
    true,
  );
  const writerEnabled = parseTruthy(
    env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED,
    false,
  );
  const writerWritesBlocked = shutdownEnabled || !writerEnabled;
  return { shutdownEnabled, writerEnabled, writerWritesBlocked };
}

export function classifyDisplaySourceTier(
  displaySourceType: string | null | undefined,
  p76SidecarEligible: boolean,
): P710R10SafeFallbackTier {
  if (p76SidecarEligible) return "canonical_result";
  const t = displaySourceType?.trim() ?? "";
  if (t === "p76_allowlist_sidecar_readonly") return "canonical_result";
  if (
    t === "match_result_original" ||
    t === "rrm_top2_bounded_selector" ||
    t === "rrm_top2_v2_selector_readonly" ||
    t === "static_fallback" ||
    t === "static_final" ||
    t === "pairwise_final"
  ) {
    return "stable_baseline";
  }
  return "stable_baseline";
}

/**
 * When legacy writer is shutdown (default) and queue failed without a row,
 * surface `legacy_writer_disabled` instead of implying PreviewPool will write MatchResult.
 */
export function enrichNoRowResultForLegacyWriterShutdown(
  payload: MatchResultNoRowContractPayload,
  input: {
    queueStatus: MatchQueueStatus;
    latestQueueRowStatus?: string | null;
    writerEnv?: P710R10OldPhotoWriterShutdownReadEnv;
  },
): MatchResultNoRowContractPayload {
  const writerEnv =
    input.writerEnv ?? readP710R10OldPhotoWriterShutdownReadEnv();
  if (!writerEnv.writerWritesBlocked) return payload;

  const queueRow = input.latestQueueRowStatus?.trim().toLowerCase() ?? "";
  const waitingOrFailed =
    input.queueStatus === "waiting" ||
    input.queueStatus === "processing" ||
    queueRow === "failed";

  if (!waitingOrFailed) return payload;

  const reason = "legacy_writer_disabled" as const;
  return {
    ...payload,
    resultState: "matching_pending",
    displaySourceCategory: "pending",
    userMessage: userMessageForNoResultReason(reason),
    noResult: {
      ...payload.noResult,
      reason,
      recoverable: false,
      nextAction: "contact_support",
    },
  };
}

/** Read-path guard: PreviewPool must not be used to create formal MatchResult on GET. */
export function assertReadPathDoesNotWriteMatchResultFromPreviewPool(): {
  previewPoolFormalWriteForbidden: true;
  policyVersion: typeof P710_R10_SAFE_FALLBACK_FINAL_POLICY_VERSION;
} {
  return {
    previewPoolFormalWriteForbidden: true,
    policyVersion: P710_R10_SAFE_FALLBACK_FINAL_POLICY_VERSION,
  };
}
