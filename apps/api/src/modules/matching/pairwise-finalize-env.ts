export type PairwiseFinalizeMode = "proposal_only" | "shadow" | "enabled";

export type PairwiseFinalizeEnv = {
  enabledFlag: boolean;
  mode: PairwiseFinalizeMode;
  minConfidence: number;
  minScoreGap: number;
  timeoutMs: number;
  sourceVersion: string;
};

export function readPairwiseFinalizeEnv(): PairwiseFinalizeEnv {
  const modeRaw = (process.env.PAIRWISE_FINAL_MATCH_MODE ?? "proposal_only").trim();
  const mode: PairwiseFinalizeMode =
    modeRaw === "shadow" || modeRaw === "enabled" || modeRaw === "proposal_only" ? modeRaw : "proposal_only";
  return {
    enabledFlag: process.env.PAIRWISE_FINAL_MATCH_ENABLED === "1",
    mode,
    minConfidence: Number(process.env.PAIRWISE_FINAL_MATCH_MIN_CONFIDENCE ?? 0.6),
    minScoreGap: Number(process.env.PAIRWISE_FINAL_MATCH_MIN_SCORE_GAP ?? 5),
    timeoutMs: Number(process.env.PAIRWISE_FINAL_MATCH_TIMEOUT_MS ?? 90_000),
    sourceVersion: (process.env.PAIRWISE_FINAL_MATCH_SOURCE_VERSION ?? "m3.8-pairwise-finalize-v1").trim(),
  };
}
