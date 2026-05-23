import { computeRfiScenario } from "../ai-simulation-v1/rrm-sim-formula";
import type { RrmCoreFormulaBranch } from "../rrm-shared";
import type { RrmObservedSignalSummaryV1 } from "../rrm-observed";
import type { RrmAssistantDraftDetectionV1 } from "./rrm-assistant-draft.types";

export type RrmAssistantSimContextHint = {
  fallbackUsed?: boolean;
  simulatedRhythmScore?: number | null;
};

export type RrmAssistantActionFitV1 = {
  schemaVersion: 1;
  /** Internal scalar; omit from viewer HTTP (M5.0). */
  actionFit: number;
  branch: RrmCoreFormulaBranch;
  P?: number;
  suitabilityBand: "good" | "caution" | "avoid";
  suggestedAction: "continue_lightly" | "maintain" | "slow_down" | "pause";
  toneAdvice: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function deriveCState(
  observed: RrmObservedSignalSummaryV1 | null | undefined,
  sim: RrmAssistantSimContextHint | null | undefined,
): number {
  if (observed && !observed.insufficientData) {
    return clamp01(
      0.35 * observed.S_obs +
        0.25 * (1 - observed.coldRisk) +
        0.25 * observed.F_obs +
        0.15 * observed.Q_obs,
    );
  }
  if (sim && sim.fallbackUsed !== true && typeof sim.simulatedRhythmScore === "number") {
    return clamp01(sim.simulatedRhythmScore / 100);
  }
  return 0.35;
}

function deriveDraftToneSignals(draft: string): { E_draft: number; Q_draft: number; R_draft: number } {
  const t = draft.trim();
  let E_draft = 0.72;
  let Q_draft = clamp01(Math.min(1, t.length / 120));
  let R_draft = 0.12;
  if (/必须|逼|威胁|举报/.test(t)) {
    E_draft = 0.25;
    R_draft = 0.55;
  } else if (/快点|赶紧|怎么不回/.test(t)) {
    E_draft = 0.4;
    R_draft = 0.4;
  } else if (/好吗|可以吗|方便/.test(t)) {
    E_draft = 0.78;
  }
  if (/[?？]/.test(t)) Q_draft = clamp01(Q_draft + 0.1);
  return { E_draft, Q_draft, R_draft };
}

function bandFromActionFit(actionFit: number, branch: RrmCoreFormulaBranch): RrmAssistantActionFitV1["suitabilityBand"] {
  if (branch === "over_capacity" || actionFit < -0.05) return "avoid";
  if (actionFit < 0.12) return "caution";
  return "good";
}

function suggestFromBand(band: RrmAssistantActionFitV1["suitabilityBand"]): {
  suggestedAction: RrmAssistantActionFitV1["suggestedAction"];
  toneAdvice: string;
} {
  if (band === "avoid") {
    return {
      suggestedAction: "slow_down",
      toneAdvice: "当前推进可能超过关系节奏，建议放缓或换一种更轻松的表达。",
    };
  }
  if (band === "caution") {
    return {
      suggestedAction: "maintain",
      toneAdvice: "可以表达兴趣，但语气尽量低压、给对方留余地。",
    };
  }
  return {
    suggestedAction: "continue_lightly",
    toneAdvice: "整体节奏匹配，可以保持自然推进。",
  };
}

/**
 * ActionFit uses the same segmented formula as Core (`computeRfiScenario`).
 * Context scalars come from Observed/Sim summaries — does not re-run RRM-Sim evaluator.
 */
export function computeRrmAssistantActionFit(params: {
  draft: string;
  detection: RrmAssistantDraftDetectionV1;
  observedSummary?: RrmObservedSignalSummaryV1 | null;
  simHint?: RrmAssistantSimContextHint | null;
}): RrmAssistantActionFitV1 {
  const A_draft = params.detection.A_draft;
  const C_state = deriveCState(params.observedSummary, params.simHint);
  const { E_draft, Q_draft, R_draft } = deriveDraftToneSignals(params.draft);

  const obs = params.observedSummary;
  const S_context = obs && !obs.insufficientData ? obs.S_obs : 0.55;
  const F_context = obs && !obs.insufficientData ? obs.F_obs : 0.45;
  const D_context = clamp01(
    (obs && !obs.insufficientData ? obs.D_obs : 0.15) +
      (obs && !obs.insufficientData ? obs.coldRisk * 0.25 : 0),
  );
  const R_pre = clamp01(R_draft + (obs && !obs.insufficientData ? obs.R_obs * 0.5 : 0));

  const actionFit = computeRfiScenario({
    A: A_draft,
    C_pred: C_state,
    S: S_context,
    E: E_draft,
    F: F_context,
    Q: Q_draft,
    D_pre: D_context,
    R_pre,
  });

  const over = A_draft > C_state;
  const branch: RrmCoreFormulaBranch = over ? "over_capacity" : "within_capacity";
  const P = over
    ? 1 + (1 - S_context) + (1 - E_draft) + R_pre
    : undefined;

  const suitabilityBand = bandFromActionFit(actionFit, branch);
  const { suggestedAction, toneAdvice } = suggestFromBand(suitabilityBand);

  return {
    schemaVersion: 1,
    actionFit,
    branch,
    ...(P !== undefined ? { P } : {}),
    suitabilityBand,
    suggestedAction,
    toneAdvice,
  };
}
