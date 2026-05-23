export type MatchingObservabilitySummaryReport = {
  schemaVersion: number;
  sourceVersion: string;
  generatedAt: string;
  window: {
    sinceDays: number;
    sinceUtc: string;
    rowCapForMetaParse: number;
  };
  notes: string[];
  pairwise: {
    totalInWindow: number;
    statusDistribution: Record<string, number>;
    sourceVersionDistribution: Record<string, number>;
    fallbackUsed: {
      trueCount: number;
      falseCount: number;
      nullCount: number;
      rateDenominatorAll: number;
      rateTrueOverAll: number | null;
    };
    failureDetailCodeDistribution: Record<string, number>;
    schemaValidationCount: number;
  };
  simulation: {
    jobStatusDistributionInWindow: Record<string, number>;
    itemStatusDistributionInWindow: Record<string, number>;
    itemErrorCodeDistributionInWindow: Record<string, number>;
    failedItemCountInWindow: number;
    schemaValidationItemCountInWindow: number;
  };
  finalizeMeta: {
    totalInWindow: number;
    totalAllTime: number;
    frozenTrueInWindow: number;
    frozenTrueAllTime: number;
    metaStatsSampled: boolean;
    metaRowsParsed: number;
    wouldChangeStaticResult: {
      trueCount: number;
      parsedBooleanCount: number;
      rateOverParsed: number | null;
    };
    fallbackReasonDistribution: Record<string, number>;
    pairwiseProposalRecommendationDistribution: Record<string, number>;
    appliedToFinalScoreTrueCountAmongParsed: number;
    appliedToWorkerRankingTrueCountAmongParsed: number;
    appliedFlagsDenominatorRows: number;
    metaParseErrorCount: number;
    metaParseErrorBuckets: Record<string, number>;
  };
  matchAndPreview: {
    matchResultsTotal: number;
    previewPoolsTotal: number;
    previewPoolsWithFinalizeMetaRow: number;
    distinctPreviewPoolsWithSucceededSimulationInWindow: number;
  };
  m42AlignmentHint: {
    message: string;
    suggestedScript: string;
    sanitizedRunRecordPath: string | null;
  };
};

export type BuildMatchingObservabilitySummaryOptions = {
  limit: number;
  sinceDays: number;
  /** When true, `m42AlignmentHint.sanitizedRunRecordPath` is set. */
  m42SanitizedRunRecordExists?: boolean;
  generatedAt?: Date;
};
