/**
 * P7.10-r10 — safe fallback final (read path; no PreviewPool MatchResult write).
 */
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { MatchingService } from "../src/modules/matching/matching.service";
import {
  deriveNoRowResultState,
  deriveResultStateForRow,
  mapDisplaySourceCategory,
  P76_RESULT_STATE_CONTRACT_VERSION,
} from "../src/modules/matching/matching-result-state";
import {
  assertReadPathDoesNotWriteMatchResultFromPreviewPool,
  classifyDisplaySourceTier,
  enrichNoRowResultForLegacyWriterShutdown,
  readP710R10OldPhotoWriterShutdownReadEnv,
} from "../src/modules/matching/p710-r10-safe-fallback-final-policy";

const USER_ID = "user-r10-test";

describe("P7.10-r10 safe fallback final policy", () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it("default r9 writer shutdown is active on API read path", () => {
    delete process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED;
    delete process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED;
    const env = readP710R10OldPhotoWriterShutdownReadEnv();
    expect(env.writerWritesBlocked).toBe(true);
  });

  it("read path forbids PreviewPool as formal MatchResult writer fallback", () => {
    expect(assertReadPathDoesNotWriteMatchResultFromPreviewPool()).toEqual({
      previewPoolFormalWriteForbidden: true,
      policyVersion: "p7.10-r10-safe-fallback-final-v1",
    });
  });

  it("classifies canonical sidecar display tier", () => {
    expect(
      classifyDisplaySourceTier("p76_allowlist_sidecar_readonly", true),
    ).toBe("canonical_result");
  });

  it("classifies stable baseline display tiers", () => {
    expect(classifyDisplaySourceTier("match_result_original", false)).toBe(
      "stable_baseline",
    );
    expect(classifyDisplaySourceTier("rrm_top2_v2_selector_readonly", false)).toBe(
      "stable_baseline",
    );
    expect(classifyDisplaySourceTier("pairwise_final", false)).toBe(
      "stable_baseline",
    );
  });

  it("enrichNoRow: waiting queue + writer shutdown → legacy_writer_disabled", () => {
    const base = deriveNoRowResultState("waiting");
    const enriched = enrichNoRowResultForLegacyWriterShutdown(base, {
      queueStatus: "waiting",
      latestQueueRowStatus: "waiting",
      writerEnv: {
        shutdownEnabled: true,
        writerEnabled: false,
        writerWritesBlocked: true,
      },
    });
    expect(enriched.resultState).toBe("matching_pending");
    expect(enriched.noResult.reason).toBe("legacy_writer_disabled");
    expect(enriched.noResult.recoverable).toBe(false);
  });

  it("enrichNoRow: failed queue + writer shutdown → legacy_writer_disabled", () => {
    const base = deriveNoRowResultState("not_queued");
    const enriched = enrichNoRowResultForLegacyWriterShutdown(base, {
      queueStatus: "not_queued",
      latestQueueRowStatus: "failed",
      writerEnv: {
        shutdownEnabled: true,
        writerEnabled: false,
        writerWritesBlocked: true,
      },
    });
    expect(enriched.noResult.reason).toBe("legacy_writer_disabled");
  });

  it("enrichNoRow: writer rollback env leaves base payload", () => {
    const base = deriveNoRowResultState("not_queued");
    const enriched = enrichNoRowResultForLegacyWriterShutdown(base, {
      queueStatus: "not_queued",
      latestQueueRowStatus: "failed",
      writerEnv: {
        shutdownEnabled: false,
        writerEnabled: true,
        writerWritesBlocked: false,
      },
    });
    expect(enriched).toEqual(base);
  });

  it("existing row → ready / safe_baseline category", () => {
    const r = deriveResultStateForRow({
      displaySourceType: "match_result_original",
      p76ReadPathMeta: {
        enabled: false,
        fallbackUsed: false,
        fallbackReason: null,
        sidecarId: null,
        sourceVersion: null,
        rolledBack: null,
        violationStatus: null,
        pmSignoffStatus: null,
        opsSignoffStatus: null,
      },
    });
    expect(r.resultState).toBe("ready");
    expect(mapDisplaySourceCategory("match_result_original")).toBe("safe_baseline");
  });

  it("p76 read path fallback → safe_fallback not photo pool", () => {
    const r = deriveResultStateForRow({
      displaySourceType: "match_result_original",
      p76ReadPathMeta: {
        enabled: true,
        fallbackUsed: true,
        fallbackReason: "missing_sidecar",
        sidecarId: null,
        sourceVersion: null,
        rolledBack: null,
        violationStatus: null,
        pmSignoffStatus: null,
        opsSignoffStatus: null,
      },
    });
    expect(r.resultState).toBe("safe_fallback");
    expect(r.safeFallback?.to).toBe("baseline_display");
  });
});

describe("MatchingService P7.10-r10 GET /matching/result", () => {
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
    process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED = "1";
    delete process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED;
    delete process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED;
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it("no row + waiting queue does not throw; returns matching_pending (writer shutdown enrich)", async () => {
    prisma.matchResult.findFirst.mockResolvedValue(null);
    prisma.batchMatchQueue.findFirst.mockResolvedValue({
      id: "q1",
      status: "waiting",
    });

    const r = await service.getLatestResultForUser(USER_ID);
    expect(r).toMatchObject({
      resultState: "matching_pending",
      contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
    });
    expect("id" in r).toBe(false);
    if (!("id" in r)) {
      expect(r.noResult.reason).toBe("legacy_writer_disabled");
    }
  });

  it("existing MatchResult row still returns full payload", async () => {
    prisma.matchResult.findFirst.mockResolvedValue({
      id: "mr-r10",
      userId: USER_ID,
      candidateUserId: "cand-1",
      batchId: "batch-1",
      finalScore: 0.8,
      reasonSummary: "ok",
      matchInsights: {},
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const r = await service.getLatestResultForUser(USER_ID);
    expect("id" in r && r.id === "mr-r10").toBe(true);
    expect(r).toMatchObject({
      displaySourceType: "match_result_original",
      resultState: "ready",
    });
  });

  it("contract flag off + no row still throws NotFoundException", async () => {
    delete process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED;
    prisma.matchResult.findFirst.mockResolvedValue(null);
    prisma.batchMatchQueue.findFirst.mockResolvedValue(null);
    await expect(service.getLatestResultForUser(USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
