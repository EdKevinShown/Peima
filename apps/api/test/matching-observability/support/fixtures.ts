/** Sample finalize meta rows (safe fields only — mirrors production JSON subset). */
export const FINALIZE_META_ROW_WOULD_CHANGE = {
  meta: {
    wouldChangeStaticResult: true,
    fallbackReason: "pairwise_timeout",
    pairwiseProposalRecommendation: "hold",
    appliedToFinalScore: false,
    appliedToWorkerRanking: true,
  },
  frozen: true,
  updatedAt: new Date("2026-05-20T12:00:00.000Z"),
};

export const FINALIZE_META_ROW_MALFORMED_STRING = {
  meta: "not-json-object",
  frozen: false,
  updatedAt: new Date("2026-05-19T12:00:00.000Z"),
};

export const FINALIZE_META_ROW_NULL_META = {
  meta: null,
  frozen: false,
  updatedAt: new Date("2026-05-18T12:00:00.000Z"),
};
