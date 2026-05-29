import type { MatchResult } from "@peima/database";
import {
  buildM55RrmSimReadonlySummaryFixture,
  isM55FixtureBlockedInProduction,
  mergeM55RrmSummaryFixtureIntoInsights,
} from "../src/dev-cli/m55-m0-rrm-summary-fixture.lib";
import {
  m55FixtureSummaryJsonExcludesForbiddenTokens,
  parseM55M0FixtureArgs,
  runM55M0RrmTop2DisplayFixture,
} from "../src/dev-cli/m55-m0-rrm-top2-display-fixture.runner";
import {
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights,
} from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import { MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE } from "../src/modules/matching/rrm-top2-display-meta.types";

function baseRow(over: Partial<MatchResult> = {}): MatchResult {
  return {
    id: "mr-local-test",
    userId: "viewer-local",
    candidateUserId: "cand-baseline",
    batchId: "b1",
    finalScore: 0.71,
    reasonSummary: "ok",
    status: "active",
    matchInsights: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  } as MatchResult;
}

describe("parseM55M0FixtureArgs", () => {
  it("parses without --withRrmSummaryFixture (default false)", () => {
    const o = parseM55M0FixtureArgs([
      "--matchResultId=a",
      "--viewerUserId=u",
      "--selectedCandidateUserId=w",
      "--otherCandidateUserId=o",
    ]);
    expect(o).not.toBeNull();
    expect(o!.withRrmSummaryFixture).toBe(false);
    expect(o!.apply).toBe(false);
  });

  it("parses --withRrmSummaryFixture", () => {
    const o = parseM55M0FixtureArgs([
      "--matchResultId=a",
      "--viewerUserId=u",
      "--selectedCandidateUserId=w",
      "--otherCandidateUserId=o",
      "--withRrmSummaryFixture",
    ]);
    expect(o!.withRrmSummaryFixture).toBe(true);
  });
});

describe("M55 RRM summary fixture lib", () => {
  it("builds summary that passes tryParse", () => {
    const s = buildM55RrmSimReadonlySummaryFixture("cand-baseline", "cand-winner", "2026-05-03T00:00:00.000Z");
    const parsed = tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights({
      [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: s,
    });
    expect(parsed).not.toBeNull();
    expect(m55FixtureSummaryJsonExcludesForbiddenTokens(s)).toBe(true);
  });

  it("merge preserves explanation / riskFlags / openingTopics / chatSimulationSummary", () => {
    const existing = {
      explanation: { text: "keep" },
      riskFlags: ["x"],
      openingTopics: ["t1"],
      chatSimulationSummary: { k: 1 },
      otherKey: 42,
    };
    const merged = mergeM55RrmSummaryFixtureIntoInsights(existing, "cand-baseline", "cand-winner", "2026-05-03T00:00:00.000Z");
    expect(merged.explanation).toEqual(existing.explanation);
    expect(merged.riskFlags).toEqual(["x"]);
    expect(merged.openingTopics).toEqual(["t1"]);
    expect(merged.chatSimulationSummary).toEqual({ k: 1 });
    expect(merged.otherKey).toBe(42);
    expect(merged[RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]).toBeDefined();
  });
});

describe("runM55M0RrmTop2DisplayFixture", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevRrm = process.env.PEIMA_M5_RRM_TOP2_ENABLED;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevRrm === undefined) delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    else process.env.PEIMA_M5_RRM_TOP2_ENABLED = prevRrm;
  });

  it("dry-run without fixture does not call matchResult.update", async () => {
    process.env.PEIMA_M5_RRM_TOP2_ENABLED = "1";
    const row = baseRow({
      matchInsights: {
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: buildM55RrmSimReadonlySummaryFixture(
          "cand-baseline",
          "cand-winner",
          "2026-05-03T00:00:00.000Z",
        ),
      },
    });
    const update = jest.fn();
    const prisma = {
      matchResult: {
        findUnique: jest.fn().mockResolvedValue(row),
        update,
      },
      matchResultRrmTop2DisplayMeta: { upsert: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ id: "cand-winner" }) },
      pairwisePoolFinalizeMeta: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const r = await runM55M0RrmTop2DisplayFixture(
      {
        matchResultId: "mr-local-test",
        viewerUserId: "viewer-local",
        selectedCandidateUserId: "cand-winner",
        otherCandidateUserId: "cand-winner",
        top2Fingerprint: "local-dev-fixture",
        apply: false,
        withRrmSummaryFixture: false,
      },
      prisma as never,
      { nowIso: () => "2026-05-03T00:00:00.000Z" },
    );
    expect("error" in r).toBe(false);
    if ("mode" in r && r.mode === "dry_run") {
      expect(r.parseOk).toBe(true);
      expect("withRrmSummaryFixture" in r).toBe(false);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("dry-run with --withRrmSummaryFixture does not call matchResult.update", async () => {
    process.env.PEIMA_M5_RRM_TOP2_ENABLED = "1";
    const row = baseRow({ matchInsights: null });
    const update = jest.fn();
    const prisma = {
      matchResult: {
        findUnique: jest.fn().mockResolvedValue(row),
        update,
      },
      matchResultRrmTop2DisplayMeta: { upsert: jest.fn() },
      user: { findUnique: jest.fn() },
      pairwisePoolFinalizeMeta: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const r = await runM55M0RrmTop2DisplayFixture(
      {
        matchResultId: "mr-local-test",
        viewerUserId: "viewer-local",
        selectedCandidateUserId: "cand-winner",
        otherCandidateUserId: "cand-winner",
        top2Fingerprint: "local-dev-fixture",
        apply: false,
        withRrmSummaryFixture: true,
      },
      prisma as never,
      { nowIso: () => "2026-05-03T00:00:00.000Z" },
    );
    expect(update).not.toHaveBeenCalled();
    if ("withRrmSummaryFixture" in r && r.withRrmSummaryFixture) {
      expect(r.rrmSummaryParseValid).toBe(true);
      expect(r.wouldWriteMatchInsightsSummary).toBe(true);
      expect(r.eligibilityEligible).toBe(true);
    }
  });

  it("apply without fixture does not call matchResult.update", async () => {
    process.env.PEIMA_M5_RRM_TOP2_ENABLED = "1";
    const row = baseRow({
      matchInsights: {
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: buildM55RrmSimReadonlySummaryFixture(
          "cand-baseline",
          "cand-winner",
          "2026-05-03T00:00:00.000Z",
        ),
      },
    });
    const update = jest.fn();
    const metaRow = {
      frozen: true,
      top2Fingerprint: "local-dev-fixture",
      meta: {
        schemaVersion: 1,
        sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
        sourceVersion: "m5.3-c1-rrm-top2-display-meta-v1",
        baselineCandidateUserId: "cand-baseline",
        previousDisplayCandidateUserId: "cand-baseline",
        newDisplayCandidateUserId: "cand-winner",
        decisionRule: "rrm_top2_winner_guardrails_pass",
        top2Fingerprint: "local-dev-fixture",
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
        rollbackAvailable: true,
        frozenAt: "2026-05-03T00:00:00.000Z",
        guardrails: {
          status: "pass",
          blockReasons: [],
          cautionReasons: [],
          sourceVersion: "m5-local-fixture-guardrails-v1",
        },
      },
    };
    const prisma = {
      matchResult: {
        findUnique: jest.fn().mockResolvedValueOnce(row).mockResolvedValueOnce(row),
        update,
      },
      matchResultRrmTop2DisplayMeta: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(metaRow),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: "cand-winner" }) },
      pairwisePoolFinalizeMeta: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const r = await runM55M0RrmTop2DisplayFixture(
      {
        matchResultId: "mr-local-test",
        viewerUserId: "viewer-local",
        selectedCandidateUserId: "cand-winner",
        otherCandidateUserId: "cand-winner",
        top2Fingerprint: "local-dev-fixture",
        apply: true,
        withRrmSummaryFixture: false,
      },
      prisma as never,
      { nowIso: () => "2026-05-03T00:00:00.000Z" },
    );
    expect(update).not.toHaveBeenCalled();
    if ("mode" in r && r.mode === "apply") {
      expect(r.appliedRrmSummaryFixture).toBe(false);
    }
  });

  it("apply with fixture calls matchResult.update then upsert; preserves candidateUserId and finalScore", async () => {
    process.env.PEIMA_M5_RRM_TOP2_ENABLED = "1";
    const row = baseRow({ matchInsights: { explanation: { k: "v" } } });
    const mergedOnce = mergeM55RrmSummaryFixtureIntoInsights(row.matchInsights, "cand-baseline", "cand-winner", "2026-05-03T00:00:00.000Z");
    const rowAfter = { ...row, matchInsights: mergedOnce };
    const findUnique = jest.fn().mockResolvedValueOnce(row).mockResolvedValueOnce(rowAfter);
    const update = jest.fn().mockImplementation(async (args: { data: { matchInsights: unknown } }) => ({
      ...row,
      matchInsights: args.data.matchInsights,
    }));
    const upsert = jest.fn().mockResolvedValue({});
    const metaRow = {
      frozen: true,
      top2Fingerprint: "local-dev-fixture",
      meta: {
        schemaVersion: 1,
        sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
        sourceVersion: "m5.3-c1-rrm-top2-display-meta-v1",
        baselineCandidateUserId: "cand-baseline",
        previousDisplayCandidateUserId: "cand-baseline",
        newDisplayCandidateUserId: "cand-winner",
        decisionRule: "rrm_top2_winner_guardrails_pass",
        top2Fingerprint: "local-dev-fixture",
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
        rollbackAvailable: true,
        frozenAt: "2026-05-03T00:00:00.000Z",
        guardrails: {
          status: "pass",
          blockReasons: [],
          cautionReasons: [],
          sourceVersion: "m5-local-fixture-guardrails-v1",
        },
      },
    };
    const prisma = {
      matchResult: { findUnique, update },
      matchResultRrmTop2DisplayMeta: {
        upsert,
        findUnique: jest.fn().mockResolvedValue(metaRow),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: "cand-winner" }) },
      pairwisePoolFinalizeMeta: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const r = await runM55M0RrmTop2DisplayFixture(
      {
        matchResultId: "mr-local-test",
        viewerUserId: "viewer-local",
        selectedCandidateUserId: "cand-winner",
        otherCandidateUserId: "cand-winner",
        top2Fingerprint: "local-dev-fixture",
        apply: true,
        withRrmSummaryFixture: true,
      },
      prisma as never,
      { nowIso: () => "2026-05-03T00:00:00.000Z" },
    );

    expect("error" in r).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    const updateData = update.mock.calls[0][0].data;
    expect(updateData.matchInsights).toMatchObject({
      explanation: { k: "v" },
      [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: expect.any(Object),
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    if ("mode" in r && r.mode === "apply") {
      expect(r.appliedRrmSummaryFixture).toBe(true);
      expect(r.appliedRrmTop2DisplayMeta).toBe(true);
      expect(r.doesNotModifyCandidateUserId).toBe(true);
      expect(r.doesNotModifyFinalScore).toBe(true);
      expect(r.displaySourceTypeAfterResolve).toBe("rrm_top2_bounded_selector");
    }
  });
});

describe("isM55FixtureBlockedInProduction", () => {
  const prev = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it("returns true when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    expect(isM55FixtureBlockedInProduction()).toBe(true);
  });

  it("returns false when NODE_ENV is not production", () => {
    process.env.NODE_ENV = "test";
    expect(isM55FixtureBlockedInProduction()).toBe(false);
  });
});
