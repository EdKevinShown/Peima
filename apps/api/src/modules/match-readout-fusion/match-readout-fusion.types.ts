import type { AiMatchReview } from "../match-review-ai/match-review-ai.types";
import type { LiteOverallVerdict } from "../interaction-simulation-lite/interaction-simulation-lite.types";

export type ReadoutStance = "up" | "mid" | "down";

export type MatchReadoutFusionInputsDto = {
  /** 0–100；null 表示缺失，按 `mid` 参与合成 */
  workerScorePercent: number | null;
  workerStance: ReadoutStance;
  p6xRecommendation: AiMatchReview["recommendation"];
  p6xStance: ReadoutStance;
  p6yVerdict: LiteOverallVerdict;
  p6yStance: ReadoutStance;
};

export type MatchReadoutFusionDebugDto = {
  fusionVersion: string;
  inputs: MatchReadoutFusionInputsDto;
  /** 如 `consensus_up`、`min_down_wins`、`mixed_mid`、`tension_A` */
  ruleTrace: string;
};

export type MatchReadoutFusionResponseDto = {
  matchResultId: string;
  headlineZh: string;
  bulletsZh: string[];
  /** 无冲突时为空字符串 */
  tensionZh: string;
  debug: MatchReadoutFusionDebugDto;
};
