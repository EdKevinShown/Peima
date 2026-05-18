/**
 * P7.10-r6f2 — insert-only rehearsal writer (mock Prisma).
 */
import { Prisma } from "@peima/database";
import {
  buildP76CanonicalWriterShadowPayloadV1,
} from "../src/modules/matching/p76-canonical-writer-shadow";
import type { P76CanonicalWriterShadowBuildInputV1 } from "../src/modules/matching/p76-canonical-writer-shadow.types";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";
import type { P76ReadPathEnv } from "../src/modules/matching/p76-read-path-env";
import {
  assertP76CanonicalWriterRehearsalWriterPrismaSurfaceSafe,
  insertOnlyP76CanonicalWriterRehearsalWriter,
  type P76CanonicalWriterRehearsalWriterPrisma,
} from "../src/modules/matching/p76-canonical-writer-rehearsal-writer";
import type {
  P76CanonicalWriterRehearsalWriterInput,
  P76CanonicalWriterRehearsalWriterRowInput,
  P76RehearsalSidecarWriterEnv,
} from "../src/modules/matching/p76-canonical-writer-rehearsal-writer.types";

const VIEWER = "viewer-r6f2";
const MATCH = "match-r6f2";
const AUDIT = "audit-run-r6f2";

function enabledReadPathEnv(
  over: Partial<P76ReadPathEnv> = {},
): P76ReadPathEnv {
  return {
    enabled: true,
    viewerAllowlist: [VIEWER],
    sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    requirePmSignoff: true,
    requireOpsSignoff: true,
    safeFallbackEnabled: true,
    fallbackLegacy: true,
    deprecatedAliasUsed: false,
    strictViolationBlock: true,
    ...over,
  };
}

function buildShadow(over: Partial<P76CanonicalWriterShadowBuildInputV1> = {}) {
  return buildP76CanonicalWriterShadowPayloadV1(
    {
      viewerUserId: VIEWER,
      baseline: { candidateUserId: "base", finalScore: 0.7 },
      sidecar: {
        id: "meta-r6f2",
        viewerUserId: VIEWER,
        selectedCandidateId: "prop",
        sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
        allowlistMatched: true,
        pmSignoffStatus: "approved",
        opsSignoffStatus: "approved",
        applied: true,
        dryRun: false,
        rolledBack: false,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
        appliedToDisplay: false,
      },
      ...over,
    },
    {
      env: {
        PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED: "1",
        PEIMA_P76_READ_PATH_ENABLED: "1",
        PEIMA_P76_READ_PATH_VIEWER_IDS: VIEWER,
      } as NodeJS.ProcessEnv,
      readPathEnv: enabledReadPathEnv(),
    },
  );
}

function baseRow(
  over: Partial<P76CanonicalWriterRehearsalWriterRowInput> = {},
): P76CanonicalWriterRehearsalWriterRowInput {
  return {
    matchResultId: MATCH,
    viewerUserId: VIEWER,
    shadow: buildShadow(),
    ...over,
  };
}

function baseInput(
  over: Partial<P76CanonicalWriterRehearsalWriterInput> = {},
): P76CanonicalWriterRehearsalWriterInput {
  return {
    auditRunId: AUDIT,
    environment: "dev",
    readPathSourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    rows: [baseRow()],
    ...over,
  };
}

function insertEnv(over: Partial<P76RehearsalSidecarWriterEnv> = {}): P76RehearsalSidecarWriterEnv {
  return {
    enabled: true,
    dryRun: false,
    environment: "dev",
    allowDbWrite: true,
    killSwitch: false,
    canInsert: true,
    blockedReason: null,
    nodeEnv: "development",
    normalizedEnvironment: "dev",
    ...over,
  };
}

function mockPrisma(): P76CanonicalWriterRehearsalWriterPrisma & {
  create: jest.Mock;
  matchResultUpdate: jest.Mock;
} {
  const create = jest.fn().mockResolvedValue({ id: "rehearsal-row-1" });
  const matchResultUpdate = jest.fn();
  const prisma = {
    create,
    matchResultUpdate,
    p76CanonicalWriterRehearsalMeta: { create },
    matchResult: { update: matchResultUpdate },
  };
  return prisma;
}

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["matchResultId", "auditRunId", "pipelineVersion"] },
  });
}

describe("insertOnlyP76CanonicalWriterRehearsalWriter (P7.10-r6f2)", () => {
  it("assertPrismaSurfaceSafe rejects matchResult.update", () => {
    const prisma = mockPrisma();
    expect(() =>
      assertP76CanonicalWriterRehearsalWriterPrismaSurfaceSafe(prisma),
    ).toThrow(/matchResult\.update/);
  });

  it("inserts rows when canInsert gates pass", async () => {
    const prisma = {
      p76CanonicalWriterRehearsalMeta: {
        create: jest.fn().mockResolvedValue({ id: "r1" }),
      },
    };
    assertP76CanonicalWriterRehearsalWriterPrismaSurfaceSafe(prisma);

    const result = await insertOnlyP76CanonicalWriterRehearsalWriter(baseInput(), {
      prisma,
      writerEnv: insertEnv(),
    });

    expect(result.mode).toBe("insert_only");
    expect(result.insertedCount).toBe(1);
    expect(result.appliedToMatchResultCount).toBe(0);
    expect(prisma.p76CanonicalWriterRehearsalMeta.create).toHaveBeenCalledTimes(1);
    const data = prisma.p76CanonicalWriterRehearsalMeta.create.mock.calls[0][0].data;
    expect(data.appliedToMatchResult).toBe(false);
    expect(data.environment).toBe("dev");
    expect(data.auditRunId).toBe(AUDIT);
    expect(data.rehearsalMode).toBe("sidecar_rehearsal");
  });

  it("does not call create when dry-run env", async () => {
    const prisma = {
      p76CanonicalWriterRehearsalMeta: {
        create: jest.fn(),
      },
    };
    const result = await insertOnlyP76CanonicalWriterRehearsalWriter(baseInput(), {
      prisma,
      writerEnv: insertEnv({ dryRun: true, canInsert: false, blockedReason: "dry_run" }),
    });
    expect(result.insertedCount).toBe(0);
    expect(result.blockedCount).toBe(1);
    expect(prisma.p76CanonicalWriterRehearsalMeta.create).not.toHaveBeenCalled();
  });

  it("does not call create when disabled", async () => {
    const prisma = {
      p76CanonicalWriterRehearsalMeta: { create: jest.fn() },
    };
    const result = await insertOnlyP76CanonicalWriterRehearsalWriter(baseInput(), {
      prisma,
      writerEnv: insertEnv({
        enabled: false,
        canInsert: false,
        blockedReason: "disabled",
      }),
    });
    expect(result.mode).toBe("disabled");
    expect(prisma.p76CanonicalWriterRehearsalMeta.create).not.toHaveBeenCalled();
  });

  it("counts P2002 as duplicate without failing batch", async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(p2002Error())
      .mockResolvedValueOnce({ id: "r2" });
    const prisma = { p76CanonicalWriterRehearsalMeta: { create } };

    const result = await insertOnlyP76CanonicalWriterRehearsalWriter(
      baseInput({
        rows: [
          baseRow({ matchResultId: "m1" }),
          baseRow({ matchResultId: "m2" }),
        ],
      }),
      { prisma, writerEnv: insertEnv() },
    );

    expect(result.duplicateCount).toBe(1);
    expect(result.insertedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("never calls matchResult.update on unsafe mock", async () => {
    const prisma = mockPrisma();
    await expect(
      insertOnlyP76CanonicalWriterRehearsalWriter(baseInput(), {
        prisma,
        writerEnv: insertEnv(),
      }),
    ).rejects.toThrow(/matchResult\.update/);
    expect(prisma.create).not.toHaveBeenCalled();
    expect(prisma.matchResultUpdate).not.toHaveBeenCalled();
  });

  it("blocks production NODE_ENV", async () => {
    const prisma = {
      p76CanonicalWriterRehearsalMeta: { create: jest.fn() },
    };
    const result = await insertOnlyP76CanonicalWriterRehearsalWriter(baseInput(), {
      prisma,
      writerEnv: insertEnv({
        canInsert: false,
        blockedReason: "production_blocked",
        nodeEnv: "production",
      }),
    });
    expect(result.mode).toBe("blocked_production");
    expect(prisma.p76CanonicalWriterRehearsalMeta.create).not.toHaveBeenCalled();
  });

  it("skips invalid row and inserts valid row", async () => {
    const create = jest.fn().mockResolvedValue({ id: "ok" });
    const prisma = { p76CanonicalWriterRehearsalMeta: { create } };
    const bad = buildShadow();
    (bad as { appliedToMatchResult: boolean }).appliedToMatchResult = true;

    const result = await insertOnlyP76CanonicalWriterRehearsalWriter(
      baseInput({
        rows: [baseRow({ shadow: bad }), baseRow({ matchResultId: "m-ok" })],
      }),
      { prisma, writerEnv: insertEnv() },
    );

    expect(result.skippedCount).toBe(1);
    expect(result.insertedCount).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
