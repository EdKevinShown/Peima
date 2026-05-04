import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MatchReviewAiChatCompletionsClient } from "../src/modules/match-review-ai/match-review-ai-chat-completions.client";
import { MatchReviewAiConfigService } from "../src/modules/match-review-ai/match-review-ai.config.service";
import { MatchReviewAiService } from "../src/modules/match-review-ai/match-review-ai.service";
import { MatchingService } from "../src/modules/matching/matching.service";
import type { MatchResultViewerPayload } from "../src/modules/matching/matching.service";
import {
  buildResolvedMatchProjection,
  type MatchResultDisplayFields,
} from "../src/modules/matching/matching-result-display";
import { resolveRelationshipProfileScoreV2Shadow } from "../src/modules/matching/matching-relationship-profile-score-v2";
import { QuestionnaireService } from "../src/modules/questionnaire/questionnaire.service";

const stubProfile = {
  profile: {} as never,
  dimensionBranchProfiles: {},
  byDimensionBranchScores: {},
  dominantBranches: {},
  uncertainBranchesByAxis: {},
  labels: { primary: null, candidates: [], styleLabels: [] },
  displayPrimary: { id: "x", name: "n", ruleTokens: [], matchedAxes: [], source: "fallback" as const },
  overallExplanation: { title: "t", paragraph: "p" },
} as const;

function minimalMatchRow(
  over: Partial<MatchResultViewerPayload> = {},
): MatchResultViewerPayload {
  const candidateUserId = over.candidateUserId ?? "cand-static";
  const displayCandidateUserId = over.displayCandidateUserId ?? candidateUserId;
  const displaySourceType =
    over.displaySourceType ?? ("match_result_original" as MatchResultDisplayFields["displaySourceType"]);
  const display: MatchResultDisplayFields = {
    displayCandidateUserId,
    displaySourceType,
    finalMatchDecisionMeta: over.finalMatchDecisionMeta ?? null,
  };
  const resolvedProjection = buildResolvedMatchProjection(candidateUserId, display, {
    displayResolverErrored: false,
  });
  const base = {
    id: "mr-spec-1",
    userId: "viewer-spec-1",
    candidateUserId,
    batchId: "batch-1",
    finalScore: 0.75,
    reasonSummary: "ok",
    status: "active",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...display,
    ...resolvedProjection,
    multiSourceFinalDecision: {
      sources: {
        static: {},
        pairwise: null,
        rrmSim: null,
        guardrails: { status: "pass" as const, blockReasons: [], cautionReasons: [], sourceSummary: "x" },
      },
      missingSources: [],
      notes: [],
    } as unknown as MatchResultViewerPayload["multiSourceFinalDecision"],
    scoreBreakdown: {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "parse_failed",
    },
    relationshipProfileScore: { score: null, source: "missing" },
    relationshipProfileScoreV2: resolveRelationshipProfileScoreV2Shadow(null),
  } as MatchResultViewerPayload;
  return { ...base, ...over } as MatchResultViewerPayload;
}

async function makeService(matching: Pick<MatchingService, "getLatestResultForUser">) {
  const questionnaire = { getProfileForUser: jest.fn() };
  const aiConfig = {
    matchReviewAiEnabled: false,
    apiKey: "",
    providerSlug: "stub",
    model: "stub",
  } as unknown as MatchReviewAiConfigService;
  const chatClient = {} as unknown as MatchReviewAiChatCompletionsClient;

  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchReviewAiService,
      { provide: MatchingService, useValue: matching },
      { provide: QuestionnaireService, useValue: questionnaire },
      { provide: MatchReviewAiConfigService, useValue: aiConfig },
      { provide: MatchReviewAiChatCompletionsClient, useValue: chatClient },
    ],
  }).compile();

  return {
    service: moduleRef.get(MatchReviewAiService),
    questionnaire,
  };
}

describe("MatchReviewAiService.review candidate gate (M3.8-M13 display)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows candidateUserId equal to stored MatchResult.candidateUserId", async () => {
    const row = minimalMatchRow();
    const { service, questionnaire } = await makeService({
      getLatestResultForUser: jest.fn().mockResolvedValue(row),
    });
    questionnaire.getProfileForUser.mockResolvedValue(stubProfile as never);

    await expect(
      service.review("viewer-spec-1", "cand-static"),
    ).resolves.toMatchObject({ viewerUserId: "viewer-spec-1", candidateUserId: "cand-static" });
    expect(questionnaire.getProfileForUser).toHaveBeenCalled();
  });

  it("allows candidateUserId equal to displayCandidateUserId when display differs from static", async () => {
    const row = minimalMatchRow({
      candidateUserId: "cand-static",
      displayCandidateUserId: "cand-winner",
    });
    const { service, questionnaire } = await makeService({
      getLatestResultForUser: jest.fn().mockResolvedValue(row),
    });
    questionnaire.getProfileForUser.mockResolvedValue(stubProfile as never);

    await expect(service.review("viewer-spec-1", "cand-winner")).resolves.toMatchObject({
      candidateUserId: "cand-winner",
    });
  });

  it("forbids candidateUserId that matches neither static nor display", async () => {
    const row = minimalMatchRow({
      candidateUserId: "cand-static",
      displayCandidateUserId: "cand-winner",
    });
    const { service, questionnaire } = await makeService({
      getLatestResultForUser: jest.fn().mockResolvedValue(row),
    });

    await expect(service.review("viewer-spec-1", "other-user")).rejects.toBeInstanceOf(ForbiddenException);
    expect(questionnaire.getProfileForUser).not.toHaveBeenCalled();
  });
});
