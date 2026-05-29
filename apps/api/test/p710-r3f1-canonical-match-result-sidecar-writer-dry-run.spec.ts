/**
 * P7.10-r3f1 — canonical match result sidecar writer dry-run (no DB / no Prisma).
 */
import { buildP76CanonicalWriterDryRunPayloadV1 } from "../src/modules/matching/p76-canonical-writer-dry-run-builder";
import {
  P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
} from "../src/modules/matching/p76-canonical-writer-dry-run.types";
import type { P76Stage1PhotoVisualSummaryV1 } from "../src/modules/matching/p76-end-to-end-funnel-shadow.types";
import {
  assertP76CanonicalMatchResultSidecarPayloadPrivacySafe,
  dryRunP76CanonicalMatchResultSidecarWriter,
  findP76CanonicalMatchResultSidecarForbiddenKey,
  mapP76CanonicalMatchResultSidecarDryRunRowToCreateInputLike,
  P76CanonicalMatchResultSidecarWriterError,
  readP76CanonicalMatchResultSidecarWriterEnv,
  resolveP76CanonicalMatchResultSidecarWriterMode,
  validateP76CanonicalMatchResultSidecarWriterInput,
} from "../src/modules/matching/p76-canonical-match-result-sidecar-writer";
import {
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
  type P76CanonicalMatchResultSidecarWriterEnv,
  type P76CanonicalMatchResultSidecarWriterInputV1,
  type P76CanonicalMatchResultSidecarWriterRowInputV1,
} from "../src/modules/matching/p76-canonical-match-result-sidecar-writer.types";

const VIEWER = "viewer-p710-r3f1";
const CANDIDATE = "cand-p710-r3f1";
const AUDIT = "audit-run-p710-r3f1";

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

function eligiblePayload(
  over: Partial<Parameters<typeof buildP76CanonicalWriterDryRunPayloadV1>[0]> = {},
) {
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
    ...over,
  });
  return {
    ...p,
    sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
  };
}

function enabledDryRunEnv(
  over: Partial<P76CanonicalMatchResultSidecarWriterEnv> = {},
): P76CanonicalMatchResultSidecarWriterEnv {
  return {
    enabled: true,
    dryRun: true,
    allowDbWrite: false,
    killSwitch: false,
    environment: "dev",
    normalizedEnvironment: "dev",
    nodeEnv: "test",
    expectedSourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
    viewerAllowlist: [],
    canInsert: false,
    blockedReason: "dry_run",
    ...over,
  };
}

function baseRow(
  over: Partial<P76CanonicalMatchResultSidecarWriterRowInputV1> = {},
): P76CanonicalMatchResultSidecarWriterRowInputV1 {
  return {
    dryRunPayload: eligiblePayload(),
    matchResultId: "match-r3f1",
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

describe("readP76CanonicalMatchResultSidecarWriterEnv (P7.10-r3f1)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to disabled, dry-run, no db write", () => {
    delete process.env.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENABLED;
    const env = readP76CanonicalMatchResultSidecarWriterEnv({});
    expect(env.enabled).toBe(false);
    expect(env.dryRun).toBe(true);
    expect(env.allowDbWrite).toBe(false);
    expect(env.killSwitch).toBe(false);
    expect(env.canInsert).toBe(false);
    expect(env.expectedSourceVersion).toBe(
      P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
    );
    expect(env.blockedReason).toBe("disabled");
    expect(resolveP76CanonicalMatchResultSidecarWriterMode(env)).toBe("disabled");
  });

  it("maps local environment to dev", () => {
    const env = readP76CanonicalMatchResultSidecarWriterEnv({
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENVIRONMENT: "local",
    });
    expect(env.environment).toBe("dev");
    expect(env.normalizedEnvironment).toBe("dev");
  });

  it("insert_only_requested when insert gates pass", () => {
    const env = readP76CanonicalMatchResultSidecarWriterEnv({
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENABLED: "1",
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_DRY_RUN: "0",
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_ALLOW_DB_WRITE: "1",
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_KILL_SWITCH: "0",
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENVIRONMENT: "staging",
      NODE_ENV: "development",
    });
    expect(env.canInsert).toBe(true);
    expect(env.blockedReason).toBe("insert_only_not_implemented_in_r3f1");
    expect(resolveP76CanonicalMatchResultSidecarWriterMode(env)).toBe(
      "insert_only_requested",
    );
  });

  it("kill_switch takes precedence", () => {
    const env = readP76CanonicalMatchResultSidecarWriterEnv({
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_KILL_SWITCH: "1",
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENABLED: "1",
    });
    expect(env.blockedReason).toBe("kill_switch");
    expect(resolveP76CanonicalMatchResultSidecarWriterMode(env)).toBe(
      "kill_switch",
    );
  });
});

describe("dryRunP76CanonicalMatchResultSidecarWriter (P7.10-r3f1)", () => {
  it("dry-run maps eligible payload to createInputLike", () => {
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      enabledDryRunEnv(),
    );
    expect(result.mode).toBe("dry_run");
    expect(result.mappedCount).toBe(1);
    const summary = result.rowSummaries[0];
    expect(summary.createInputLike.viewerUserId).toBe(VIEWER);
    expect(summary.createInputLike.selectedCandidateId).toBe(CANDIDATE);
    expect(summary.createInputLike.auditRunId).toBe(AUDIT);
    expect(summary.createInputLike.environment).toBe("dev");
    expect(summary.createInputLike.matchResultId).toBe("match-r3f1");
  });

  it("insertedCount is always 0", () => {
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      enabledDryRunEnv(),
    );
    expect(result.insertedCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
  });

  it("appliedTo* counts are always 0", () => {
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      enabledDryRunEnv(),
    );
    expect(result.appliedToMatchResultCount).toBe(0);
    expect(result.appliedToFinalScoreCount).toBe(0);
    expect(result.appliedToWorkerRankingCount).toBe(0);
    expect(result.rowSummaries[0].appliedToMatchResult).toBe(false);
    expect(result.rowSummaries[0].appliedToFinalScore).toBe(false);
    expect(result.rowSummaries[0].appliedToWorkerRanking).toBe(false);
    expect(result.rowSummaries[0].createInputLike.appliedToMatchResult).toBe(
      false,
    );
  });

  it("promotionStatus is always not_promoted and mode is sidecar", () => {
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      enabledDryRunEnv(),
    );
    expect(result.rowSummaries[0].promotionStatus).toBe("not_promoted");
    expect(result.rowSummaries[0].mode).toBe("sidecar");
    expect(result.rowSummaries[0].createInputLike.promotionStatus).toBe(
      "not_promoted",
    );
    expect(result.rowSummaries[0].createInputLike.mode).toBe("sidecar");
  });

  it("dryRunPayload preserved when safe", () => {
    const payload = eligiblePayload();
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput({ rows: [{ dryRunPayload: payload }] }),
      enabledDryRunEnv(),
    );
    expect(result.rowSummaries[0].createInputLike.dryRunPayload).toEqual(payload);
  });

  it("skips ineligible payload", () => {
    const ineligible = buildP76CanonicalWriterDryRunPayloadV1({
      viewerUserId: "  ",
      sourceVersion: P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
    });
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput({
        rows: [
          {
            dryRunPayload: {
              ...ineligible,
              sourceVersion:
                P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
            },
          },
        ],
      }),
      enabledDryRunEnv(),
    );
    expect(result.mappedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.errors[0]?.code).toBe("guardrails_ineligible");
  });

  it("skips missing selectedCandidateId on otherwise eligible guardrails", () => {
    const payload = eligiblePayload();
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput({
        rows: [
          {
            dryRunPayload: {
              ...payload,
              selectedCandidateId: null,
              guardrails: {
                ...payload.guardrails,
                eligible: true,
                reason: "ok",
                blockedReasons: [],
              },
            },
          },
        ],
      }),
      enabledDryRunEnv(),
    );
    expect(result.skippedCount).toBe(1);
    expect(result.errors[0]?.message).toMatch(/selectedCandidateId/);
  });

  it("skips forbidden payload key", () => {
    const payload = eligiblePayload();
    const poisoned = {
      ...payload,
      stageSummary: {
        ...payload.stageSummary,
        rawPrompt: "secret",
      },
    };
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput({ rows: [{ dryRunPayload: poisoned }] }),
      enabledDryRunEnv(),
    );
    expect(result.skippedCount).toBe(1);
    expect(result.errors[0]?.code).toBe("forbidden_payload_key");
    expect(findP76CanonicalMatchResultSidecarForbiddenKey(poisoned)).toMatch(
      /rawPrompt/i,
    );
    expect(() =>
      assertP76CanonicalMatchResultSidecarPayloadPrivacySafe(poisoned),
    ).toThrow(P76CanonicalMatchResultSidecarWriterError);
  });

  it("allowlist blocks non-allowlisted viewer", () => {
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      enabledDryRunEnv({ viewerAllowlist: ["other-viewer"] }),
    );
    expect(result.skippedCount).toBe(1);
    expect(result.errors[0]?.code).toBe("not_allowlisted");
    expect(result.reasonCounts.not_allowlisted).toBe(1);
  });

  it("sourceVersion mismatch blocks row", () => {
    const payload = eligiblePayload();
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput({
        rows: [
          {
            dryRunPayload: {
              ...payload,
              sourceVersion: "stale-version",
            },
          },
        ],
      }),
      enabledDryRunEnv(),
    );
    expect(result.skippedCount).toBe(1);
    expect(result.errors[0]?.code).toBe("stale_source_version");
  });

  it("kill switch blocks all rows", () => {
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      enabledDryRunEnv({ killSwitch: true, blockedReason: "kill_switch" }),
    );
    expect(result.mode).toBe("kill_switch");
    expect(result.blockedCount).toBe(1);
    expect(result.rowSummaries).toHaveLength(0);
    expect(result.errors[0]?.code).toBe("kill_switch");
  });

  it("insert_only env returns blocked reason and no mapped rows", () => {
    const env = readP76CanonicalMatchResultSidecarWriterEnv({
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENABLED: "1",
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_DRY_RUN: "0",
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_ALLOW_DB_WRITE: "1",
      PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENVIRONMENT: "dev",
      NODE_ENV: "development",
    });
    const result = dryRunP76CanonicalMatchResultSidecarWriter(baseInput(), env);
    expect(result.mode).toBe("insert_only_requested");
    expect(result.blockedCount).toBe(1);
    expect(result.rowSummaries).toHaveLength(0);
    expect(result.errors[0]?.code).toBe("insert_only_not_implemented_in_r3f1");
    expect(result.reasonCounts.insert_only_not_implemented_in_r3f1).toBe(1);
  });

  it("invalid writer environment blocks via aligned check", () => {
    expect(() =>
      dryRunP76CanonicalMatchResultSidecarWriter(
        baseInput(),
        enabledDryRunEnv({
          environment: "production",
          normalizedEnvironment: null,
          blockedReason: "production_blocked",
        }),
      ),
    ).toThrow(/writer environment is not dev or staging/);
  });

  it("missing auditRunId rejects input", () => {
    expect(() =>
      validateP76CanonicalMatchResultSidecarWriterInput(
        baseInput({ auditRunId: "  " }),
      ),
    ).toThrow(P76CanonicalMatchResultSidecarWriterError);
    expect(() =>
      dryRunP76CanonicalMatchResultSidecarWriter(
        baseInput({ auditRunId: "  " }),
        enabledDryRunEnv(),
      ),
    ).toThrow(/auditRunId/);
  });

  it("invalid input environment rejects", () => {
    expect(() =>
      validateP76CanonicalMatchResultSidecarWriterInput({
        auditRunId: AUDIT,
        environment: "production" as "dev",
        rows: [],
      }),
    ).toThrow(/environment must be dev or staging/);
  });

  it("disabled env is no-op safe mode", () => {
    const env = readP76CanonicalMatchResultSidecarWriterEnv({});
    const result = dryRunP76CanonicalMatchResultSidecarWriter(baseInput(), env);
    expect(result.mode).toBe("disabled");
    expect(result.insertedCount).toBe(0);
    expect(result.mappedCount).toBe(0);
    expect(result.blockedCount).toBe(1);
  });

  it("batch continues after one skipped row", () => {
    const bad = eligiblePayload();
    const good = eligiblePayload();
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput({
        rows: [
          {
            dryRunPayload: {
              ...bad,
              selectedCandidateId: null,
              guardrails: {
                eligible: true,
                reason: "ok",
                blockedReasons: [],
              },
            },
          },
          { dryRunPayload: good, matchResultId: "m2" },
        ],
      }),
      enabledDryRunEnv(),
    );
    expect(result.mappedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.rowSummaries).toHaveLength(1);
    expect(result.rowSummaries[0].viewerUserId).toBe(VIEWER);
  });

  it("map row helper aligns createInputLike without Prisma", () => {
    const row = baseRow();
    const mapped = mapP76CanonicalMatchResultSidecarDryRunRowToCreateInputLike(
      row,
      { auditRunId: AUDIT, environment: "dev" },
    );
    expect(mapped.appliedToMatchResult).toBe(false);
    expect(mapped.promotionStatus).toBe("not_promoted");
    expect(mapped.rolledBack).toBe(false);
    expect(mapped.dryRunPayload.mode).toBe("dry_run");
  });

  it("writer module has no Prisma import or create calls", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const modules = [
      "p76-canonical-match-result-sidecar-writer.ts",
      "p76-canonical-match-result-sidecar-writer-env.ts",
      "p76-canonical-match-result-sidecar-writer-row.ts",
      "p76-canonical-match-result-sidecar-writer-privacy.ts",
    ];
    for (const file of modules) {
      const source = fs.readFileSync(
        path.join(__dirname, "../src/modules/matching", file),
        "utf8",
      );
      expect(source).not.toMatch(/from ["']@peima\/database["']/);
      expect(source).not.toMatch(/\.create\s*\(/);
      expect(source).not.toMatch(/\.upsert\s*\(/);
      expect(source).not.toMatch(/\.update\s*\(/);
      expect(source).not.toMatch(/\.delete\s*\(/);
    }
  });

  it("result sourceVersion is r3f1 sidecar writer v1", () => {
    const result = dryRunP76CanonicalMatchResultSidecarWriter(
      baseInput(),
      enabledDryRunEnv(),
    );
    expect(result.sourceVersion).toBe(
      P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
    );
    expect(result.schemaVersion).toBe(1);
  });
});
