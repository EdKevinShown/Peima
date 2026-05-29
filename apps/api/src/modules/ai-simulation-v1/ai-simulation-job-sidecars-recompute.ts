import { ITEM_STATUS } from "./ai-simulation-v1.constants";
import type { ShortlistDecisionV0, ShortlistFourDimV0 } from "./ai-simulation-v1.types";
import { tryBuildShortlistFourDimV0FromSimulationV2, isAiSimulationTranscriptLiteV2 } from "./shortlist-four-dim-from-simulation-v2";
import { tryBuildShortlistFourDimV0 } from "./shortlist-four-dim-v0";
import { tryBuildShortlistDecisionV0, tryBuildShortlistDecisionV0FromFourDim } from "./shortlist-decision-v0";
import { tryBuildShortlistScenariosV0 } from "./shortlist-scenarios-v0";

export type AiSimulationJobSidecarDerivation = "simulation_v2" | "legacy_scenarios";

export type AiSimulationJobSidecarItemRow = {
  candidateUserId: string;
  status: string;
  evaluator: unknown;
  transcriptLite?: unknown;
};

function computeRankConsistent(
  fourDim: ShortlistFourDimV0 | null,
  decision: ShortlistDecisionV0 | null,
): boolean {
  if (fourDim == null || decision == null) return false;
  const a = fourDim.comparison.rankedCandidateUserIds;
  const b = decision.rankedCandidateUserIds;
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function readBindingIds(shortlistBinding: unknown): string[] | null {
  if (typeof shortlistBinding !== "object" || shortlistBinding === null) return null;
  const o = shortlistBinding as Record<string, unknown>;
  const ids = o.shortlistCandidateUserIds;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) return null;
  return ids as string[];
}

function everyBindingItemSucceeded(bindingIds: string[], items: AiSimulationJobSidecarItemRow[]): boolean {
  const byId = new Map(items.map((it) => [it.candidateUserId, it]));
  return bindingIds.every((id) => {
    const it = byId.get(id);
    return it != null && it.status === ITEM_STATUS.SUCCEEDED;
  });
}

function allItemsHaveV2Simulation(bindingIds: string[], items: AiSimulationJobSidecarItemRow[]): boolean {
  const byId = new Map(items.map((it) => [it.candidateUserId, it]));
  return bindingIds.every((id) => {
    const it = byId.get(id);
    return it != null && isAiSimulationTranscriptLiteV2(it.transcriptLite);
  });
}

/**
 * Mirrors `AiSimulationV1Service.runJob` finally: v2 jobs derive fourDim+decision without
 * `tryBuildShortlistScenariosV0`; legacy v1 (or mixed) still uses synthetic scenarios in-memory only.
 */
export function recomputeAiSimulationJobSidecarsV0(input: {
  shortlistBinding: unknown;
  items: AiSimulationJobSidecarItemRow[];
}): {
  fourDim: ShortlistFourDimV0 | null;
  decision: ShortlistDecisionV0 | null;
  rankConsistent: boolean;
  derivation: AiSimulationJobSidecarDerivation;
  /** `null` when v2 path or early exit before `tryBuildShortlistScenariosV0`; else whether scenarios built. */
  legacyScenariosBuildable: boolean | null;
  bindingCandidateIdsOk: boolean;
  allShortlistItemsSucceeded: boolean;
} {
  const bindingIds = readBindingIds(input.shortlistBinding);

  if (bindingIds == null || bindingIds.length < 2 || bindingIds.length > 3) {
    return {
      fourDim: null,
      decision: null,
      rankConsistent: false,
      derivation: "legacy_scenarios",
      legacyScenariosBuildable: null,
      bindingCandidateIdsOk: false,
      allShortlistItemsSucceeded: false,
    };
  }

  const allShortlistItemsSucceeded = everyBindingItemSucceeded(bindingIds, input.items);
  if (!allShortlistItemsSucceeded) {
    return {
      fourDim: null,
      decision: null,
      rankConsistent: false,
      derivation: "legacy_scenarios",
      legacyScenariosBuildable: null,
      bindingCandidateIdsOk: true,
      allShortlistItemsSucceeded: false,
    };
  }

  if (allItemsHaveV2Simulation(bindingIds, input.items)) {
    const fourDim = tryBuildShortlistFourDimV0FromSimulationV2(input.shortlistBinding, input.items);
    const decision = tryBuildShortlistDecisionV0FromFourDim(input.shortlistBinding, fourDim, input.items);
    return {
      fourDim,
      decision,
      rankConsistent: computeRankConsistent(fourDim, decision),
      derivation: "simulation_v2",
      legacyScenariosBuildable: null,
      bindingCandidateIdsOk: true,
      allShortlistItemsSucceeded: true,
    };
  }

  const scenarios = tryBuildShortlistScenariosV0(input.shortlistBinding, input.items);
  const fourDim = scenarios != null ? tryBuildShortlistFourDimV0(scenarios) : null;
  const decision = tryBuildShortlistDecisionV0(input.shortlistBinding, input.items);
  return {
    fourDim,
    decision,
    rankConsistent: computeRankConsistent(fourDim, decision),
    derivation: "legacy_scenarios",
    legacyScenariosBuildable: scenarios != null,
    bindingCandidateIdsOk: true,
    allShortlistItemsSucceeded: true,
  };
}
