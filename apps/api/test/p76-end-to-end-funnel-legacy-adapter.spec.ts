import * as matchingDisplay from "../src/modules/matching/matching-result-display";
import {
  assertP76EndToEndFunnelAuditPrivacySafe,
  extractM6RrmTop2FromMatchInsights,
  loadP76LegacyComparisonContext,
} from "../src/modules/matching/p76-end-to-end-funnel-legacy-adapter";

const VIEWER = "viewer-1";
const WINNER = "cmfemn00100016z64seed0001";
const RUNNER_UP = "cmfemn003000506z64seed0003";

function mockPrisma(overrides: {
  matchResult?: {
    id: string;
    userId: string;
    candidateUserId: string;
    finalScore: number | null;
    matchInsights: unknown;
  } | null;
  previewItems?: Array<{ candidateUserId: string }>;
  displayCandidateUserId?: string;
  displaySourceType?: string;
}) {
  const writeMethods = [
    "create",
    "update",
    "upsert",
    "delete",
    "deleteMany",
    "updateMany",
    "createMany",
  ];

  const prisma = {
    matchResult: {
      findUnique: jest.fn().mockResolvedValue(overrides.matchResult ?? null),
      findFirst: jest.fn().mockResolvedValue(overrides.matchResult ?? null),
    },
    onboardingPhotoPreviewPool: {
      findFirst: jest.fn().mockResolvedValue(
        overrides.previewItems
          ? { items: overrides.previewItems }
          : null,
      ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: WINNER }),
    },
    userProfile: {
      findUnique: jest.fn().mockResolvedValue({ userId: WINNER }),
    },
    matchResultRrmTop2DisplayMeta: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    pairwisePoolFinalizeMeta: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as never;

  for (const method of writeMethods) {
    for (const model of Object.values(prisma as object)) {
      if (model && typeof model === "object") {
        expect((model as Record<string, unknown>)[method]).toBeUndefined();
      }
    }
  }

  return prisma;
}

describe("p76 end-to-end funnel legacy adapter", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("extractM6RrmTop2FromMatchInsights parses top2 ids", () => {
    const m6 = extractM6RrmTop2FromMatchInsights({
      rrmV2Top2Selector: {
        selectedTop2: [
          { candidateUserId: WINNER, rank: 1 },
          { candidateUserId: RUNNER_UP, rank: 2 },
        ],
        top1CandidateUserId: WINNER,
      },
      rrmDecisionShadow: { present: true },
    });
    expect(m6.m6RrmTop2CandidateIds).toEqual([WINNER, RUNNER_UP]);
    expect(m6.m6RrmSelectedCandidateId).toBe(WINNER);
    expect(m6.hasRrmDecisionShadow).toBe(true);
  });

  it("MatchResult exists → legacy fields populated", async () => {
    jest.spyOn(matchingDisplay, "resolveMatchResultDisplay").mockResolvedValue({
      displayCandidateUserId: WINNER,
      displaySourceType: "match_result_original",
      finalMatchDecisionMeta: null,
    });

    const prisma = mockPrisma({
      matchResult: {
        id: "mr-1",
        userId: VIEWER,
        candidateUserId: WINNER,
        finalScore: 0.72,
        matchInsights: {
          rrmV2Top2Selector: {
            selectedTop2: [
              { candidateUserId: WINNER },
              { candidateUserId: RUNNER_UP },
            ],
            top1CandidateUserId: WINNER,
          },
        },
      },
      previewItems: [{ candidateUserId: WINNER }, { candidateUserId: RUNNER_UP }],
    });

    const { legacy } = await loadP76LegacyComparisonContext(prisma, {
      viewerUserId: VIEWER,
      compareLegacy: true,
      compareM6: true,
    });

    expect(legacy.matchResultCandidateUserId).toBe(WINNER);
    expect(legacy.matchResultFinalScore).toBe(0.72);
    expect(legacy.displayCandidateUserId).toBe(WINNER);
    expect(legacy.workerWinnerCandidateUserId).toBe(WINNER);
    expect(legacy.m6RrmTop2CandidateIds).toEqual([WINNER, RUNNER_UP]);
  });

  it("MatchResult missing does not throw", async () => {
    const prisma = mockPrisma({ matchResult: null });
    const { legacy, loadNotes } = await loadP76LegacyComparisonContext(prisma, {
      viewerUserId: VIEWER,
      compareLegacy: true,
      compareM6: true,
    });
    expect(legacy.matchResultCandidateUserId).toBeUndefined();
    expect(loadNotes).toContain("match_result_not_found");
  });

  it("compareLegacy=false skips match load", async () => {
    const prisma = mockPrisma({
      matchResult: {
        id: "mr-1",
        userId: VIEWER,
        candidateUserId: WINNER,
        finalScore: 0.5,
        matchInsights: {},
      },
    });
    const { legacy, loadNotes } = await loadP76LegacyComparisonContext(prisma, {
      viewerUserId: VIEWER,
      compareLegacy: false,
      compareM6: true,
    });
    expect(legacy.matchResultCandidateUserId).toBeUndefined();
    expect(loadNotes).toContain("compare_legacy_disabled");
    expect(
      (prisma as { matchResult: { findFirst: jest.Mock } }).matchResult.findFirst,
    ).not.toHaveBeenCalled();
  });

  it("privacy assert rejects matchInsights key in output", () => {
    expect(() =>
      assertP76EndToEndFunnelAuditPrivacySafe({
        legacyComparison: { matchInsights: { foo: 1 } },
      }),
    ).toThrow(/sensitive field/);

    const safe = {
      schemaVersion: "p7.6-end-to-end-funnel-shadow-audit-v1",
      legacyComparison: {
        m6RrmTop2CandidateIds: [WINNER],
        matchResultCandidateUserId: WINNER,
      },
    };
    expect(() => assertP76EndToEndFunnelAuditPrivacySafe(safe)).not.toThrow();
    expect(JSON.stringify(safe)).not.toContain("dimensionBranchChatHints");
  });
});
