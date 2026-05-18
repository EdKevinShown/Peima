/**
 * P7.10-r3f2 — insert-only canonical match result sidecar writer (mock Prisma).
 */
import { Prisma } from "@peima/database";
import { buildP76CanonicalWriterDryRunPayloadV1 } from "../src/modules/matching/p76-canonical-writer-dry-run-builder";
import { P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION } from "../src/modules/matching/p76-canonical-writer-dry-run.types";
import type { P76Stage1PhotoVisualSummaryV1 } from "../src/modules/matching/p76-end-to-end-funnel-shadow.types";
import {
  assertP76CanonicalMatchResultSidecarWriterPrismaSurfaceSafe,
  insertOnlyP76CanonicalMatchResultSidecarWriter,
  type P76CanonicalMatchResultSidecarWriterPrisma,
} from "../src/modules/matching/p76-canonical-match-result-sidecar-writer";
import {
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
  type P76CanonicalMatchResultSidecarWriterEnv,
  type P76CanonicalMatchResultSidecarWriterInputV1,
  type P76CanonicalMatchResultSidecarWriterRowInputV1,
} from "../src/modules/matching/p76-canonical-match-result-sidecar-writer.types";

const VIEWER = "viewer-p710-r3f2";
const CANDIDATE = "cand-p710-r3f2";
const AUDIT = "audit-run-p710-r3f2";

function stage1(): P76Stage1PhotoVisualSummaryV1 {
  return {
    sourceVersion: "p7.6-stage1-v1",
    selectedCandidateIds: [CANDIDATE],
    topCandidatesSummary: [
      { candidateUserId: CANDIDATE, mutualPhotoVisualFit: 0.7, rank: 1 },
    ],
  };
}

function stage2() {
  return {
    sourceVersion: "p7.6-stage2-v1",
    top2CandidateIds: [CANDIDATE, "cand-other"],
    selectedBy20DOnlyCandidateId: CANDIDATE,
    rankedCandidatesSummary: [
      { candidateUserId: CANDIDATE, mutual20DFit: 0.8, rank: 1 },
    ],
  };
}

function stage3() {
  return {
    sourceVersion: "p7.6-stage3-v1",
    selectedByRrmCandidateId: CANDIDATE,
    rankedCandidatesSummary: [
      { candidateUserId: CANDIDATE, mutualRrmFit: 0.75, rank: 1 },
    ],
    reasonSummary: "RRM selected top mutual fit",
  };
}

function eligiblePayload() {
  const p = buildP76CanonicalWriterDryRunPayloadV1({
    viewerUserId: VIEWER,
    viewerAllowlist: [VIEWER],
    sourceVersion: P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
    cohortSourceVersion: P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
    stage1PhotoVisual: stage1(),
    stage2Ranking: stage2(),
    stage3Rrm: stage3(),
    score: 0.88,
    candidateExists: true,
  });
  return {
    ...p,
    sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
  };
}

function insertEnv(
  over: Partial<P76CanonicalMatchResultSidecarWriterEnv> = {},
): P76CanonicalMatchResultSidecarWriterEnv {
  return {
    enabled: true,
    dryRun: false,
    allowDbWrite: true,
    killSwitch: false,
    environment: "dev",
    normalizedEnvironment: "dev",
    nodeEnv: "development",
    expectedSourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
    viewerAllowlist: [],
    canInsert: true,
    blockedReason: "insert_only_not_implemented_in_r3f1",
    ...over,
  };
}

function baseRow(
  over: Partial<P76CanonicalMatchResultSidecarWriterRowInputV1> = {},
): P76CanonicalMatchResultSidecarWriterRowInputV1 {
  return {
    dryRunPayload: eligiblePayload(),
    matchResultId: "match-r3f2",
    ...over,
  };
}

function baseInput(
  over: Partial<P76CanonicalMatchResultSidecarWriterInputV1> = {},
): P76CanonicalMatchResultSidecarWriterInputV1 {
  return {
    auditRunId: AUDIT,
    environment: "dev",
    rows: [baseRow()],
    ...over,
  };
}

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["auditRunId", "viewerUserId", "sourceVersion"] },
  });
}

describe("insertOnlyP76CanonicalMatchResultSidecarWriter (P7.10-r3f2)", () => {
  it("assertPrismaSurfaceSafe rejects matchResult.update", () => {
    const prisma = {
      p76CanonicalMatchResultMeta: { create: jest.fn() },
      matchResult: { update: jest.fn() },
    } as P76CanonicalMatchResultSidecarWriterPrisma & {
      matchResult: { update: jest.Mock };
    };
    expect(() =>
      assertP76CanonicalMatchResultSidecarWriterPrismaSurfaceSafe(prisma),
    ).toThrow(/matchResult\.update/);
  });

  it("inserts rows when canInsert gates pass", async () => {
    const create = jest.fn().mockResolvedValue({ id: "sidecar-row-1" });
    const prisma = { p76CanonicalMatchResultMeta: { create } };
    assertP76CanonicalMatchResultSidecarWriterPrismaSurfaceSafe(prisma);

    const result = await insertOnlyP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      { prisma, writerEnv: insertEnv() },
    );

    expect(result.mode).toBe("insert_only");
    expect(result.insertedCount).toBe(1);
    expect(result.appliedToMatchResultCount).toBe(0);
    expect(result.appliedToFinalScoreCount).toBe(0);
    expect(result.appliedToWorkerRankingCount).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.appliedToMatchResult).toBe(false);
    expect(data.appliedToFinalScore).toBe(false);
    expect(data.appliedToWorkerRanking).toBe(false);
    expect(data.promotionStatus).toBe("not_promoted");
    expect(data.mode).toBe("sidecar");
    expect(data.environment).toBe("dev");
    expect(data.auditRunId).toBe(AUDIT);
    expect(data.viewerUserId).toBe(VIEWER);
  });

  it("does not call create when dry-run env", async () => {
    const create = jest.fn();
    const prisma = { p76CanonicalMatchResultMeta: { create } };
    const result = await insertOnlyP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      {
        prisma,
        writerEnv: insertEnv({
          dryRun: true,
          canInsert: false,
          blockedReason: "dry_run",
        }),
      },
    );
    expect(result.insertedCount).toBe(0);
    expect(result.blockedCount).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not call create when disabled", async () => {
    const create = jest.fn();
    const prisma = { p76CanonicalMatchResultMeta: { create } };
    const result = await insertOnlyP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      {
        prisma,
        writerEnv: insertEnv({
          enabled: false,
          canInsert: false,
          blockedReason: "disabled",
        }),
      },
    );
    expect(result.mode).toBe("disabled");
    expect(create).not.toHaveBeenCalled();
  });

  it("counts P2002 as duplicate without failing batch", async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(p2002Error())
      .mockResolvedValueOnce({ id: "r2" });
    const prisma = { p76CanonicalMatchResultMeta: { create } };

    const result = await insertOnlyP76CanonicalMatchResultSidecarWriter(
      baseInput({
        rows: [
          baseRow(),
          baseRow({ matchResultId: "match-r3f2-b" }),
        ],
      }),
      { prisma, writerEnv: insertEnv() },
    );

    expect(result.duplicateCount).toBe(1);
    expect(result.insertedCount).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("blocks production NODE_ENV", async () => {
    const create = jest.fn();
    const prisma = { p76CanonicalMatchResultMeta: { create } };
    const result = await insertOnlyP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      {
        prisma,
        writerEnv: insertEnv({
          canInsert: false,
          blockedReason: "production_blocked",
          nodeEnv: "production",
        }),
      },
    );
    expect(result.mode).toBe("blocked_production");
    expect(create).not.toHaveBeenCalled();
  });

  it("skips invalid row and inserts valid row", async () => {
    const create = jest.fn().mockResolvedValue({ id: "ok" });
    const prisma = { p76CanonicalMatchResultMeta: { create } };
    const bad = eligiblePayload();
    const ineligible = buildP76CanonicalWriterDryRunPayloadV1({
      viewerUserId: "  ",
      sourceVersion: P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
    });

    const result = await insertOnlyP76CanonicalMatchResultSidecarWriter(
      baseInput({
        rows: [
          {
            dryRunPayload: {
              ...ineligible,
              sourceVersion:
                P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
            },
          },
          baseRow({ dryRunPayload: bad }),
        ],
      }),
      { prisma, writerEnv: insertEnv() },
    );

    expect(result.skippedCount).toBe(1);
    expect(result.insertedCount).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never exposes matchResult write surface on unsafe mock", async () => {
    const create = jest.fn();
    const matchResultUpdate = jest.fn();
    const prisma = {
      p76CanonicalMatchResultMeta: { create },
      matchResult: { update: matchResultUpdate },
    } as P76CanonicalMatchResultSidecarWriterPrisma & {
      matchResult: { update: jest.Mock };
    };
    await expect(
      insertOnlyP76CanonicalMatchResultSidecarWriter(baseInput(), {
        prisma,
        writerEnv: insertEnv(),
      }),
    ).rejects.toThrow(/matchResult\.update/);
    expect(create).not.toHaveBeenCalled();
    expect(matchResultUpdate).not.toHaveBeenCalled();
  });
});
