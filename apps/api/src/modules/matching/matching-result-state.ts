/**
 * P7.10-r4a — derive additive resultState fields for GET /matching/result.
 */

import type { P76ReadPathDisplayMeta } from "./p76-read-path-display-resolver";
import { userMessageForNoResultReason } from "./matching-user-messages";

export type MatchQueueStatus = "not_queued" | "waiting" | "processing" | "ready";

export const P76_RESULT_STATE_CONTRACT_VERSION =
  "p7.10-r4a-result-state-contract-v1" as const;

export type MatchResultResultState =
  | "ready"
  | "safe_fallback"
  | "matching_pending"
  | "no_result";

export type MatchResultDisplaySourceCategory =
  | "p76_canonical"
  | "p76_sidecar"
  | "safe_baseline"
  | "finalize"
  | "pending"
  | "no_result"
  | "unknown";

export type MatchResultSafeFallbackReason =
  | "canonical_missing"
  | "sidecar_missing"
  | "not_allowlisted"
  | "stale_sidecar"
  | "rolled_back"
  | "violation_row"
  | "candidate_missing"
  | "env_disabled"
  | "exception"
  | "baseline_only";

export type MatchResultSafeFallbackBlock = {
  active: boolean;
  policyVersion: "safe_fallback_v1";
  reason?: MatchResultSafeFallbackReason;
  from?: "p76_canonical" | "p76_sidecar" | "p76_read_path";
  to?: "baseline_display" | "stable_result" | "matching_pending" | "no_result";
};

export type MatchResultResultStateFields = {
  resultState: MatchResultResultState;
  contractVersion: typeof P76_RESULT_STATE_CONTRACT_VERSION;
  displaySourceCategory?: MatchResultDisplaySourceCategory;
  safeFallback?: MatchResultSafeFallbackBlock;
};

export type MatchResultNoRowContractPayload = MatchResultResultStateFields & {
  resultState: "matching_pending" | "no_result";
  queue: { status: MatchQueueStatus };
  /** Viewer-safe hint; never exposes internal reason codes. */
  userMessage: string;
  noResult: {
    reason:
      | "no_match_result"
      | "not_queued"
      | "candidate_pool_empty"
      | "onboarding_incomplete"
      | "legacy_writer_disabled"
      | "unknown";
    recoverable: boolean;
    nextAction?: "wait" | "start_matching" | "complete_onboarding" | "contact_support";
  };
};

const P76_READ_PATH_REASON_MAP: Record<string, MatchResultSafeFallbackReason> = {
  env_disabled: "env_disabled",
  not_allowlisted: "not_allowlisted",
  missing_sidecar: "sidecar_missing",
  stale_source_version: "stale_sidecar",
  rolled_back: "rolled_back",
  candidate_missing: "candidate_missing",
  candidate_unavailable: "candidate_missing",
  exception: "exception",
};

function mapP76FallbackReason(
  raw: string | null | undefined,
): MatchResultSafeFallbackReason {
  if (raw == null || raw.trim() === "") return "baseline_only";
  const key = raw.trim().toLowerCase();
  if (P76_READ_PATH_REASON_MAP[key]) return P76_READ_PATH_REASON_MAP[key];
  if (key.startsWith("violation_")) return "violation_row";
  if (key.startsWith("main_chain_flag_")) return "baseline_only";
  return "baseline_only";
}

export function mapDisplaySourceCategory(
  displaySourceType: string | null | undefined,
): MatchResultDisplaySourceCategory {
  const t = displaySourceType?.trim() ?? "";
  if (t === "p76_allowlist_sidecar_readonly") return "p76_sidecar";
  if (t === "static_fallback" || t === "static_final" || t === "pairwise_final") {
    return "finalize";
  }
  if (
    t === "match_result_original" ||
    t === "rrm_top2_bounded_selector" ||
    t === "rrm_top2_v2_selector_readonly"
  ) {
    return "safe_baseline";
  }
  if (t === "") return "unknown";
  return "unknown";
}

export function deriveResultStateForRow(input: {
  displaySourceType: string | null | undefined;
  p76ReadPathMeta?: P76ReadPathDisplayMeta | null;
}): Pick<
  MatchResultResultStateFields,
  "resultState" | "displaySourceCategory" | "safeFallback"
> {
  const category = mapDisplaySourceCategory(input.displaySourceType);
  const p76Meta = input.p76ReadPathMeta;
  /** Safe fallback only when read path was enabled but overlay could not apply. */
  const readPathFallback =
    p76Meta?.enabled === true && p76Meta?.fallbackUsed === true;

  if (readPathFallback) {
    return {
      resultState: "safe_fallback",
      displaySourceCategory: category === "p76_sidecar" ? "safe_baseline" : category,
      safeFallback: {
        active: true,
        policyVersion: "safe_fallback_v1",
        reason: mapP76FallbackReason(p76Meta?.fallbackReason),
        from: "p76_read_path",
        to: "baseline_display",
      },
    };
  }

  return {
    resultState: "ready",
    displaySourceCategory: category,
    safeFallback: {
      active: false,
      policyVersion: "safe_fallback_v1",
    },
  };
}

export function deriveNoRowResultState(
  queueStatus: MatchQueueStatus,
): MatchResultNoRowContractPayload {
  if (queueStatus === "waiting" || queueStatus === "processing") {
    const reason = "no_match_result" as const;
    return {
      resultState: "matching_pending",
      contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
      displaySourceCategory: "pending",
      queue: { status: queueStatus },
      userMessage: userMessageForNoResultReason(reason),
      noResult: {
        reason,
        recoverable: true,
        nextAction: "wait",
      },
    };
  }

  if (queueStatus === "ready") {
    const reason = "no_match_result" as const;
    return {
      resultState: "matching_pending",
      contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
      displaySourceCategory: "pending",
      queue: { status: queueStatus },
      userMessage: userMessageForNoResultReason(reason),
      noResult: {
        reason,
        recoverable: true,
        nextAction: "wait",
      },
    };
  }

  const reason = "not_queued" as const;
  return {
    resultState: "no_result",
    contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
    displaySourceCategory: "no_result",
    queue: { status: queueStatus },
    userMessage: userMessageForNoResultReason(reason),
    noResult: {
      reason,
      recoverable: true,
      nextAction: "start_matching",
    },
  };
}

export function attachResultStateToViewerPayload<
  T extends {
    displaySourceType?: string | null;
    p76ReadPathMeta?: P76ReadPathDisplayMeta | null;
  },
>(payload: T): T & MatchResultResultStateFields {
  const derived = deriveResultStateForRow({
    displaySourceType: payload.displaySourceType,
    p76ReadPathMeta: payload.p76ReadPathMeta,
  });
  return {
    ...payload,
    contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
    ...derived,
  };
}
