import { authHeaders, baseUrl, handleJson } from "./auth";

export type ReadoutStance = "up" | "mid" | "down";

export type MatchReadoutFusionInputs = {
  workerScorePercent: number | null;
  workerStance: ReadoutStance;
  p6xRecommendation: string;
  p6xStance: ReadoutStance;
  p6yVerdict: string;
  p6yStance: ReadoutStance;
};

export type MatchReadoutFusionResponse = {
  matchResultId: string;
  headlineZh: string;
  bulletsZh: string[];
  tensionZh: string;
  debug: {
    fusionVersion: string;
    inputs: MatchReadoutFusionInputs;
    ruleTrace: string;
  };
};

/** GET /match-readout-fusion/match-results/:matchResultId — JWT；viewer 须为该 MatchResult 的 userId。 */
export async function getMatchReadoutFusion(matchResultId: string) {
  const url = `${baseUrl}/match-readout-fusion/match-results/${encodeURIComponent(matchResultId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<MatchReadoutFusionResponse>(res);
}
