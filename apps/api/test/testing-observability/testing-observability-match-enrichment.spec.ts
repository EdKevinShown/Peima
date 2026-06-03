import {
  enrichTestingMatchSummaries,
  formatTestingMatchUserLabel,
} from "../../src/modules/testing-observability/testing-observability-match-enrichment";
import type { TestingMatchDebugSummary } from "../../src/modules/testing-observability/testing-observability.types";

function baseSummary(
  overrides: Partial<TestingMatchDebugSummary> = {},
): TestingMatchDebugSummary {
  return {
    matchResultId: "mr-1",
    viewerUserId: "viewer-a",
    candidateUserId: "cand-b",
    displayCandidateUserId: "cand-b",
    displaySourceType: "match_result_original",
    finalScore: 0.41,
    finalMatchDecisionMetaPresent: false,
    matchInsightsPresent: false,
    scoreShadowV2Present: false,
    rrmDecisionShadowPresent: false,
    pairwiseAvailable: false,
    fallbackUsed: null,
    guardrailFlags: [],
    sourceVersion: null,
    createdAt: "2026-06-03T14:00:00.000Z",
    updatedAt: "2026-06-03T14:00:00.000Z",
    ...overrides,
  };
}

describe("enrichTestingMatchSummaries", () => {
  it("adds pairing labels and mutual flag from DB reverse row", async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "viewer-a",
            nickname: "小明",
            gender: "male",
            age: 28,
            city: "深圳",
            phone: "13800001111",
          },
          {
            id: "cand-b",
            nickname: "小红",
            gender: "female",
            age: 26,
            city: "上海",
            phone: "13900002222",
          },
        ]),
      },
      matchResult: {
        findMany: jest.fn().mockResolvedValue([
          { userId: "cand-b", candidateUserId: "viewer-a" },
        ]),
      },
    };

    const out = await enrichTestingMatchSummaries(
      prisma as never,
      [baseSummary()],
    );
    expect(out[0]?.pairingSummary).toBe("小明 → 小红");
    expect(out[0]?.isMutualMatch).toBe(true);
    expect(out[0]?.viewer.nickname).toBe("小明");
    expect(out[0]?.candidate.city).toBe("上海");
  });
});

describe("formatTestingMatchUserLabel", () => {
  it("prefers nickname then phone tail", () => {
    expect(
      formatTestingMatchUserLabel({
        userId: "u1",
        nickname: "测试51",
        gender: null,
        age: null,
        city: null,
        phoneTail: "1111",
      }),
    ).toBe("测试51");
    expect(
      formatTestingMatchUserLabel({
        userId: "u1",
        nickname: null,
        gender: null,
        age: null,
        city: null,
        phoneTail: "1111",
      }),
    ).toBe("尾号1111");
  });
});
