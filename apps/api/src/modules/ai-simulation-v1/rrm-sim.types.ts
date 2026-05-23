import type { RrmScenarioKeyV1 } from "./ai-simulation-v1-rrm.constants";
import type {
  RrmSimLevelBand,
  RrmSimProgressionWindow,
  RrmSimSuggestedAction,
} from "./rrm-sim.constants";
import { RRM_SOURCE_VERSION_SIM } from "../rrm-shared";

export type RrmSimScenarioScoreRow = {
  scenario: RrmScenarioKeyV1;
  A_scenario: number;
  S_sim: number;
  E_sim: number;
  Q_sim: number;
  R_scenario: number;
  RFI_scenario: number;
  suggestedAction: RrmSimSuggestedAction;
};

export type RrmSimScoresBlock = {
  C_pred: number;
  F_sim: number;
  D_pre: number;
  R_pre: number;
  RFI_sim: number;
  simulatedRhythmScore: number;
};

export type RrmSimLevelsBlock = {
  relationshipCapacity: RrmSimLevelBand;
  contextualFit: RrmSimLevelBand;
  emotionalSafety: RrmSimLevelBand;
  feedbackReliability: RrmSimLevelBand;
  interactionQuality: RrmSimLevelBand;
  riskLevel: RrmSimLevelBand;
};

export type RrmSimEvidenceBlock = {
  C_pred: string[];
  S_sim: string[];
  E_sim: string[];
  F_sim: string[];
  Q_sim: string[];
  D_pre: string[];
  R_pre: string[];
};

/** M1-Full — read-time `rrmSimResult`; not persisted on item rows in this phase. */
export type RrmSimResult = {
  schemaVersion: 1;
  sourceVersion: typeof RRM_SOURCE_VERSION_SIM;
  sourceSimulationVersion: string;
  fallbackUsed: boolean;
  rrmUnavailableReason: string | null;
  scores: RrmSimScoresBlock;
  scenarioScores: RrmSimScenarioScoreRow[];
  levels: RrmSimLevelsBlock;
  progressionWindow: RrmSimProgressionWindow;
  suggestedAction: RrmSimSuggestedAction;
  summary: string;
  evidence: RrmSimEvidenceBlock;
};
