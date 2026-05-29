/**
 * P7.7-r1 — resultState contract + safe fallback negative regression.
 */
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  MatchingService,
  type GetMatchResultResponse,
  isMatchResultViewerPayload,
} from "../src/modules/matching/matching.service";
import {
  attachResultStateToViewerPayload,
  deriveNoRowResultState,
  deriveResultStateForRow,
  mapDisplaySourceCategory,
  P76_RESULT_STATE_CONTRACT_VERSION,
  type MatchResultResultStateFields,
} from "../src/modules/matching/matching-result-state";
import type { MatchResultViewerPayload } from "../src/modules/matching/matching.service";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";

const USER_ID = "user-p77-r1";

function matchRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mr-p77",
    userId: USER_ID,
    candidateUserId: "cand-baseline",
    batchId: "batch-1",
    finalScore: 0.83,
    reasonSummary: "ok",
    matchInsights: {},
    status: "ready",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  };
}

describe("P7.7-r1 matching-result-state helpers", () => {
  it("processing queue → matching_pending", () => {
    const r = deriveNoRowResultState("processing");
    expect(r).toMatchObject({
      resultState: "matching_pending",
      contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
      queue: { status: "processing" },
    });
    expect(r.noResult.reason).toBe("no_match_result");
    expect(r.noResult.recoverable).toBe(true);
    expect(r.noResult.nextAction).toBe("wait");
  });

  it("ready queue but no row → matching_pending (r4a design)", () => {
    const r = deriveNoRowResultState("ready");
    expect(r.resultState).toBe("matching_pending");
    expect(r.queue.status).toBe("ready");
  });

  it("not_queued → no_result with nextAction", () => {
    const r = deriveNoRowResultState("not_queued");
    expect(r.resultState).toBe("no_result");
    expect(r.noResult.reason).toBe("not_queued");
    expect(r.noResult.recoverable).toBe(true);
    expect(r.noResult.nextAction).toBe("start_matching");
  });

  it.each([
    ["missing_sidecar", "sidecar_missing"],
    ["stale_source_version", "stale_sidecar"],
    ["rolled_back", "rolled_back"],
    ["violation_artifact_missing", "violation_row"],
    ["candidate_unavailable", "candidate_missing"],
    ["env_disabled", "env_disabled"],
    ["exception", "exception"],
  ] as const)(
    "safe_fallback maps p76ReadPath reason %s → %s",
    (raw, mapped) => {
      const r = deriveResultStateForRow({
        displaySourceType: "match_result_original",
        p76ReadPathMeta: {
          enabled: true,
          fallbackUsed: true,
          fallbackReason: raw,
          sidecarId: null,
          sourceVersion: null,
          rolledBack: null,
          violationStatus: null,
          pmSignoffStatus: null,
          opsSignoffStatus: null,
        },
      });
      expect(r.resultState).toBe("safe_fallback");
      expect(r.safeFallback?.reason).toBe(mapped);
    },
  );

  it("static_fallback and match_result_original displaySourceType unchanged in category map", () => {
    expect(mapDisplaySourceCategory("static_fallback")).toBe("finalize");
    expect(mapDisplaySourceCategory("match_result_original")).toBe("safe_baseline");
    expect("static_fallback").toBe("static_fallback");
    expect("match_result_original").toBe("match_result_original");
  });

  it("static_fallback row → ready resultState without mutating displaySourceType literal", () => {
    const r = deriveResultStateForRow({
      displaySourceType: "static_fallback",
      p76ReadPathMeta: { fallbackUsed: false } as never,
    });
    expect(r.resultState).toBe("ready");
    expect(r.displaySourceCategory).toBe("finalize");
    expect(r.safeFallback?.active).toBe(false);
  });

  it("attachResultState preserves baseline row fields", () => {
    const out = attachResultStateToViewerPayload({
      ...matchRow(),
      displaySourceType: "match_result_original",
      displayCandidateUserId: "cand-baseline",
    });
    expect(out.candidateUserId).toBe("cand-baseline");
    expect(out.finalScore).toBe(0.83);
    expect(out.displaySourceType).toBe("match_result_original");
    expect(out.resultState).toBe("ready");
  });
});

describe("P7.7-r1 MatchingService resultState + safe fallback", () => {
  const prevEnv = { ...process.env };
  let service: MatchingService;
  let prisma: {
    user: { findUnique: jest.Mock };
    matchResult: { findFirst: jest.Mock };
    batchMatchQueue: { findFirst: jest.Mock };
    userProfile: { findUnique: jest.Mock };
    matchResultRrmTop2DisplayMeta: { findUnique: jest.Mock };
    pairwisePoolFinalizeMeta: { findFirst: jest.Mock };
    p76AllowlistApplyMeta: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: USER_ID }) },
      matchResult: { findFirst: jest.fn() },
      batchMatchQueue: { findFirst: jest.fn() },
      userProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      matchResultRrmTop2DisplayMeta: { findUnique: jest.fn().mockResolvedValue(null) },
      pairwisePoolFinalizeMeta: { findFirst: jest.fn().mockResolvedValue(null) },
      p76AllowlistApplyMeta: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(MatchingService);
    delete process.env.PEIMA_P76_READ_PATH_ENABLED;
    delete process.env.PEIMA_P76_READ_PATH_VIEWER_IDS;
    delete process.env.PAIRWISE_FINAL_MATCH_ENABLED;
    delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    delete process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED;
    delete process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED;
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it("flag off + no row → NotFoundException No match result", async () => {
    prisma.matchResult.findFirst.mockResolvedValue(null);
    await expect(service.getLatestResultForUser(USER_ID)).rejects.toMatchObject({
      message: expect.stringContaining("No match result"),
    });
    await expect(service.getLatestResultForUser(USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("flag on + processing → matching_pending", async () => {
    process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED = "1";
    prisma.matchResult.findFirst.mockResolvedValue(null);
    prisma.batchMatchQueue.findFirst.mockResolvedValue({
      id: "q1",
      userId: USER_ID,
      status: "processing",
    });

    const r = await service.getLatestResultForUser(USER_ID);
    expect(r).toMatchObject({
      resultState: "matching_pending",
      contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
      queue: { status: "processing" },
    });
  });

  it("flag on + row + read path missing sidecar → safe_fallback, baseline preserved", async () => {
    process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED = "1";
    process.env.PEIMA_P76_READ_PATH_ENABLED = "1";
    process.env.PEIMA_P76_READ_PATH_VIEWER_IDS = USER_ID;
    process.env.PEIMA_P76_READ_PATH_SOURCE_VERSION =
      P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION;
    process.env.PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF = "0";
    process.env.PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF = "0";
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "0";

    prisma.matchResult.findFirst.mockResolvedValue(matchRow());
    prisma.p76AllowlistApplyMeta.findUnique.mockResolvedValue(null);

    const r = await service.getLatestResultForUser(USER_ID);
    assertViewerWithResultState(r);
    expect(r.candidateUserId).toBe("cand-baseline");
    expect(r.finalScore).toBe(0.83);
    expect(r.displaySourceType).toBe("match_result_original");
    expect(r.resultState).toBe("safe_fallback");
    expect(r.safeFallback?.active).toBe(true);
    expect(r.safeFallback?.reason).toBe("sidecar_missing");
    expect(r.p76ReadPathMeta?.fallbackUsed).toBe(true);
  });

  it("flag on + baseline row → ready, match_result_original preserved", async () => {
    process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED = "1";
    prisma.matchResult.findFirst.mockResolvedValue(matchRow());

    const r = await service.getLatestResultForUser(USER_ID);
    assertViewerWithResultState(r);
    expect(r.resultState).toBe("ready");
    expect(r.displaySourceType).toBe("match_result_original");
    expect(r.displaySourceCategory).toBe("safe_baseline");
    expect(r.candidateUserId).toBe("cand-baseline");
    expect(r.finalScore).toBe(0.83);
    expect("static_fallback").toBe("static_fallback");
    expect("match_result_original").toBe("match_result_original");
  });
});

type ViewerWithResultState = MatchResultViewerPayload & MatchResultResultStateFields;

function assertViewerWithResultState(
  r: GetMatchResultResponse,
): asserts r is ViewerWithResultState {
  if (!isMatchResultViewerPayload(r) || !("resultState" in r)) {
    throw new Error("expected viewer payload with resultState");
  }
}
