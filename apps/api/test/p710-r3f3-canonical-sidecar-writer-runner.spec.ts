/**
 * P7.10-r3f3 — canonical sidecar writer dev-cli args / artifact / synthetic input.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildP710R3f3SyntheticSidecarWriterInput,
  buildP710R3f3SidecarWriterEnvForCli,
} from "../src/dev-cli/p710-r3f3-canonical-sidecar-writer-runner";
import {
  defaultP710R3f3AuditRunId,
  parseP710R3f3CanonicalSidecarWriterCliArgs,
} from "../src/dev-cli/p710-r3f3-canonical-sidecar-writer-cli-args";
import {
  evaluateP76CanonicalMatchResultSidecarWriterSmokePass,
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_VERSION,
  type P76CanonicalMatchResultSidecarWriterSmokeSummaryV1,
} from "../src/modules/matching/p76-canonical-match-result-sidecar-writer-smoke-artifact";

function baseSummary(
  over: Partial<P76CanonicalMatchResultSidecarWriterSmokeSummaryV1> = {},
): P76CanonicalMatchResultSidecarWriterSmokeSummaryV1 {
  return {
    generatedAt: new Date().toISOString(),
    sourceType: "p76_canonical_match_result_sidecar_writer_smoke",
    sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_VERSION,
    auditRunId: "audit-r3f3-test",
    environment: "dev",
    mode: "insert_only",
    attemptedCount: 3,
    insertedCount: 2,
    duplicateCount: 0,
    skippedCount: 1,
    blockedCount: 0,
    verify: {
      rowCount: 2,
      appliedToMatchResultTrueCount: 0,
      appliedToFinalScoreTrueCount: 0,
      appliedToWorkerRankingTrueCount: 0,
      promotionStatusNotPromotedCount: 2,
    },
    cleanup: {
      requested: true,
      deletedCount: 2,
      finalRowsForAuditRunId: 0,
    },
    safety: {
      matchResultTouched: false,
      workerTouched: false,
      getTouched: false,
    },
    pass: false,
    ...over,
  };
}

describe("p710-r3f3 canonical sidecar writer cli args", () => {
  it("defaults auditRunId to r3f3-local-smoke timestamp", () => {
    const args = parseP710R3f3CanonicalSidecarWriterCliArgs([], 1_700_000_000_000);
    expect(args.auditRunId).toBe(defaultP710R3f3AuditRunId(1_700_000_000_000));
    expect(args.auditRunId).toMatch(/^r3f3-local-smoke-/);
    expect(args.insert).toBe(false);
    expect(args.cleanup).toBe(false);
    expect(args.verify).toBe(false);
    expect(args.includeDuplicateProbe).toBe(true);
  });

  it("parse insert enables cleanup and verify by default", () => {
    const args = parseP710R3f3CanonicalSidecarWriterCliArgs(["--insert=true"]);
    expect(args.insert).toBe(true);
    expect(args.cleanup).toBe(true);
    expect(args.verify).toBe(true);
  });

  it("parse cleanup=false explicitly", () => {
    const args = parseP710R3f3CanonicalSidecarWriterCliArgs([
      "--insert=true",
      "--cleanup=false",
    ]);
    expect(args.cleanup).toBe(false);
  });

  it("builds insert writer env with gates", () => {
    const args = parseP710R3f3CanonicalSidecarWriterCliArgs([
      "--insert=true",
      "--environment=staging",
    ]);
    const env = buildP710R3f3SidecarWriterEnvForCli(args, {
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    expect(env.canInsert).toBe(true);
    expect(env.normalizedEnvironment).toBe("staging");
  });
});

describe("p710-r3f3 smoke artifact", () => {
  it("passes when appliedTo* counts are zero and cleanup cleared", () => {
    const summary = baseSummary();
    expect(evaluateP76CanonicalMatchResultSidecarWriterSmokePass(summary)).toBe(
      true,
    );
    summary.pass = evaluateP76CanonicalMatchResultSidecarWriterSmokePass(summary);
    expect(summary.pass).toBe(true);
  });

  it("fails when appliedToMatchResultTrueCount > 0", () => {
    const summary = baseSummary({
      verify: {
        ...baseSummary().verify,
        appliedToMatchResultTrueCount: 1,
      },
    });
    expect(evaluateP76CanonicalMatchResultSidecarWriterSmokePass(summary)).toBe(
      false,
    );
  });

  it("duplicate probe summary requires duplicateCount > 0 and unchanged rows", () => {
    const summary = baseSummary({
      duplicateProbe: {
        duplicateCount: 2,
        rowCountAfter: 2,
        rowCountUnchanged: true,
      },
    });
    expect(evaluateP76CanonicalMatchResultSidecarWriterSmokePass(summary)).toBe(
      true,
    );
  });

  it("cleanup summary requires finalRowsForAuditRunId=0 when cleanup requested", () => {
    const summary = baseSummary({
      cleanup: {
        requested: true,
        deletedCount: 1,
        finalRowsForAuditRunId: 1,
      },
    });
    expect(evaluateP76CanonicalMatchResultSidecarWriterSmokePass(summary)).toBe(
      false,
    );
  });
});

describe("p710-r3f3 synthetic payload builder", () => {
  it("creates 3 rows with 2 eligible payloads", () => {
    const input = buildP710R3f3SyntheticSidecarWriterInput(
      "audit-synthetic",
      "dev",
    );
    expect(input.rows).toHaveLength(3);
    const eligible = input.rows.filter((r) => r.dryRunPayload.guardrails.eligible);
    expect(eligible).toHaveLength(2);
    expect(eligible[0]!.dryRunPayload.viewerUserId).toBe("r3f3-viewer-1");
    expect(eligible[1]!.dryRunPayload.selectedCandidateId).toBe("r3f3-cand-2");
  });
});

describe("p710-r3f3 runner module", () => {
  it("imports PrismaModule only", () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../src/dev-cli/p710-r3f3-canonical-sidecar-writer-runner.module.ts",
      ),
      "utf8",
    );
    expect(source).toMatch(/PrismaModule/);
    expect(source).not.toMatch(/MatchingModule/);
    expect(source).not.toMatch(/AppModule/);
  });
});
