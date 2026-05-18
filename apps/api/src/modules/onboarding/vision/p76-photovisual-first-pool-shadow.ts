/**
 * P7.6-r3a: build PhotoFirstMutualMatchingShadowV1 (pure; no Prisma / env / DB).
 */

import {
  evaluatePhotoVisualPairEligibility,
} from "./p76-photovisual-first-pool-eligibility";
import {
  computeAtoBPhotoVisualFit,
  computeBtoAPhotoVisualFit,
  computeMutualPhotoVisualFit,
  sortPhotoVisualPairs,
} from "./p76-photovisual-first-pool-scoring";
import {
  PHOTO_FIRST_MUTUAL_MATCHING_SCHEMA_VERSION,
  PHOTO_FIRST_MUTUAL_MATCHING_SOURCE_VERSION,
  type PhotoFirstMutualMatchingShadowV1,
  type PhotoVisualPairEligibilityInput,
  type PhotoVisualPairV1,
  type PhotoVisualPoolInputV1,
  type PhotoVisualScoredPairV1,
} from "./p76-photovisual-first-pool.types";

const DEFAULT_SELECTION_LIMIT = 6;

const R3A_SOURCE_POOL_TYPE = "onboarding_gated_cohort" as const;

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function assertR3aSourcePoolType(
  sourcePoolType: PhotoVisualPoolInputV1["sourcePoolType"],
): void {
  if (sourcePoolType !== R3A_SOURCE_POOL_TYPE) {
    throw new Error(
      `P7.6-r3a builder only supports sourcePoolType=${R3A_SOURCE_POOL_TYPE}, got ${sourcePoolType}`,
    );
  }
}

function buildPair(
  input: PhotoVisualPoolInputV1,
  candidate: PhotoVisualPoolInputV1["candidates"][number],
): PhotoVisualPairV1 {
  const viewerStyleTags = normalizeTags(input.viewerStyleTags);
  const candidateStyleTags = normalizeTags(candidate.candidateStyleTags);
  const viewerPhotoVisualTags = normalizeTags(
    input.viewerVision?.photoVisualTags ?? [],
  );
  const candidatePhotoVisualTags = normalizeTags(
    candidate.candidateVision?.photoVisualTags ?? [],
  );

  const eligibilityInput: PhotoVisualPairEligibilityInput = {
    viewerUserId: input.viewerUserId,
    viewerStyleTags: input.viewerStyleTags,
    viewerVision: input.viewerVision,
    candidateUserId: candidate.candidateUserId,
    candidateStyleTags: candidate.candidateStyleTags,
    candidateVision: candidate.candidateVision,
    gates: candidate.gates,
  };

  const { eligible, ineligibleReasons } =
    evaluatePhotoVisualPairEligibility(eligibilityInput);

  const qualitySignals =
    input.viewerVision?.qualityTags !== undefined ||
    candidate.candidateVision?.qualityTags !== undefined
      ? {
          ...(input.viewerVision?.qualityTags !== undefined
            ? { viewerQualityTags: [...input.viewerVision.qualityTags] }
            : {}),
          ...(candidate.candidateVision?.qualityTags !== undefined
            ? { candidateQualityTags: [...candidate.candidateVision.qualityTags] }
            : {}),
        }
      : undefined;

  const sceneSignals =
    input.viewerVision?.sceneTags !== undefined ||
    candidate.candidateVision?.sceneTags !== undefined
      ? {
          ...(input.viewerVision?.sceneTags !== undefined
            ? { viewerSceneTags: [...input.viewerVision.sceneTags] }
            : {}),
          ...(candidate.candidateVision?.sceneTags !== undefined
            ? { candidateSceneTags: [...candidate.candidateVision.sceneTags] }
            : {}),
        }
      : undefined;

  if (!eligible) {
    return {
      candidateUserId: candidate.candidateUserId,
      eligible: false,
      ineligibleReasons,
      AtoBPhotoVisualFit: null,
      BtoAPhotoVisualFit: null,
      mutualPhotoVisualFit: null,
      visualImbalancePenalty: null,
      usedViewerStyleTags: viewerStyleTags,
      usedCandidateStyleTags: candidateStyleTags,
      usedViewerPhotoVisualTags: viewerPhotoVisualTags,
      usedCandidatePhotoVisualTags: candidatePhotoVisualTags,
      viewerVisionSourceVersion: input.viewerVision?.sourceVersion,
      candidateVisionSourceVersion: candidate.candidateVision?.sourceVersion,
      viewerVisionProvider: input.viewerVision?.provider,
      candidateVisionProvider: candidate.candidateVision?.provider,
      qualitySignals,
      sceneSignals,
    };
  }

  const aToB = computeAtoBPhotoVisualFit(
    viewerStyleTags,
    candidatePhotoVisualTags,
  );
  const bToA = computeBtoAPhotoVisualFit(
    candidateStyleTags,
    viewerPhotoVisualTags,
  );
  const mutual = computeMutualPhotoVisualFit(aToB, bToA);

  return {
    candidateUserId: candidate.candidateUserId,
    eligible: true,
    ineligibleReasons,
    AtoBPhotoVisualFit: aToB,
    BtoAPhotoVisualFit: bToA,
    mutualPhotoVisualFit: mutual,
    visualImbalancePenalty: 0,
    usedViewerStyleTags: viewerStyleTags,
    usedCandidateStyleTags: candidateStyleTags,
    usedViewerPhotoVisualTags: viewerPhotoVisualTags,
    usedCandidatePhotoVisualTags: candidatePhotoVisualTags,
    viewerVisionSourceVersion: input.viewerVision?.sourceVersion,
    candidateVisionSourceVersion: candidate.candidateVision?.sourceVersion,
    viewerVisionProvider: input.viewerVision?.provider,
    candidateVisionProvider: candidate.candidateVision?.provider,
    qualitySignals,
    sceneSignals,
  };
}

function pickSelectedCandidateIds(
  pairs: PhotoVisualPairV1[],
  selectionLimit: number,
): string[] {
  const scored: PhotoVisualScoredPairV1[] = [];
  for (const pair of pairs) {
    if (
      !pair.eligible ||
      pair.AtoBPhotoVisualFit == null ||
      pair.BtoAPhotoVisualFit == null ||
      pair.mutualPhotoVisualFit == null
    ) {
      continue;
    }
    scored.push({
      candidateUserId: pair.candidateUserId,
      AtoBPhotoVisualFit: pair.AtoBPhotoVisualFit,
      BtoAPhotoVisualFit: pair.BtoAPhotoVisualFit,
      mutualPhotoVisualFit: pair.mutualPhotoVisualFit,
    });
  }

  const sorted = sortPhotoVisualPairs(scored);
  const limit = Math.max(0, Math.floor(selectionLimit));
  return sorted.slice(0, limit).map((row) => row.candidateUserId);
}

export function buildPhotoFirstMutualMatchingShadowV1(
  input: PhotoVisualPoolInputV1,
): PhotoFirstMutualMatchingShadowV1 {
  assertR3aSourcePoolType(input.sourcePoolType);

  const selectionLimit = input.selectionLimit ?? DEFAULT_SELECTION_LIMIT;

  const pairs: PhotoVisualPairV1[] = [];
  const seenCandidateIds = new Set<string>();

  for (const candidate of input.candidates) {
    if (seenCandidateIds.has(candidate.candidateUserId)) {
      continue;
    }
    seenCandidateIds.add(candidate.candidateUserId);
    pairs.push(buildPair(input, candidate));
  }

  let eligibleCandidatesCount = 0;
  let ineligibleCandidatesCount = 0;
  for (const pair of pairs) {
    if (pair.eligible) {
      eligibleCandidatesCount += 1;
    } else {
      ineligibleCandidatesCount += 1;
    }
  }

  const selectedCandidateIds = pickSelectedCandidateIds(pairs, selectionLimit);

  return {
    schemaVersion: PHOTO_FIRST_MUTUAL_MATCHING_SCHEMA_VERSION,
    sourceVersion: PHOTO_FIRST_MUTUAL_MATCHING_SOURCE_VERSION,
    viewerUserId: input.viewerUserId,
    poolId: input.poolId,
    sourcePoolType: R3A_SOURCE_POOL_TYPE,
    generatedAt: input.generatedAt,
    stage1PhotoVisualPool: {
      eligibleCandidatesCount,
      ineligibleCandidatesCount,
      selectedCandidateIds,
      pairs,
      appliedToPool: false,
    },
    comparisons: {},
    finalShadow: {
      stage1SelectedCandidateIds: [...selectedCandidateIds],
      applied: false,
      appliedToPool: false,
      appliedToFinalScore: false,
      appliedToMatchResult: false,
      appliedToWorkerRanking: false,
    },
  };
}
