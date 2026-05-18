/**
 * P7.10-r6a — canonical writer shadow dev audit (pure builder + CLI args).
 */
import {
  P710_R6A_DEFAULT_LIMIT,
  P710_R6A_DEFAULT_OUTPUT,
  parseP710R6aCanonicalWriterShadowAuditCliArgs,
} from "../src/dev-cli/p710-r6a-canonical-writer-shadow-audit-cli-args";
import {
  buildP76CanonicalWriterShadowAuditReport,
  P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_TYPE,
  P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_VERSION,
} from "../src/modules/matching/p76-canonical-writer-shadow-audit";
import { assertP76CanonicalWriterShadowAuditPrivacySafe } from "../src/modules/matching/p76-canonical-writer-shadow-audit-json";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";
import type { P76ReadPathEnv } from "../src/modules/matching/p76-read-path-env";

const VIEWER = "viewer-r6a-audit";
const SIDE = "cand-side-r6a";
const BASE = "cand-base-r6a";

function readPathEnv(over: Partial<P76ReadPathEnv> = {}): P76ReadPathEnv {
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

function goodSidecar(
  over: Partial<{
    selectedCandidateId: string;
    rolledBack: boolean;
    applied: boolean;
    dryRun: boolean;
    appliedToMatchResult: boolean;
    sourceVersion: string;
  }> = {},
) {
  return {
    id: "meta-r6a",
    viewerUserId: VIEWER,
    selectedCandidateId: SIDE,
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
    ...over,
  };
}

function matchRow(id: string, candidateUserId: string) {
  return {
    matchResult: {
      id,
      userId: VIEWER,
      candidateUserId,
      finalScore: 0.8,
    },
    sidecar: goodSidecar(),
    sidecarCandidateExists: true,
  };
}

describe("parseP710R6aCanonicalWriterShadowAuditCliArgs", () => {
  it("defaults limit/output/includeBlocked/dryRun", () => {
    const a = parseP710R6aCanonicalWriterShadowAuditCliArgs([]);
    expect(a.limit).toBe(P710_R6A_DEFAULT_LIMIT);
    expect(a.outputPath).toBe(P710_R6A_DEFAULT_OUTPUT);
    expect(a.includeBlocked).toBe(true);
    expect(a.dryRun).toBe(true);
  });

  it("parses limit and output", () => {
    const a = parseP710R6aCanonicalWriterShadowAuditCliArgs([
      "--limit=5",
      "--output=artifacts/p76/r6a/custom.json",
    ]);
    expect(a.limit).toBe(5);
    expect(a.outputPath).toBe("artifacts/p76/r6a/custom.json");
  });
});

describe("buildP76CanonicalWriterShadowAuditReport", () => {
  const shadowEnv = { PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED: "1" };

  it("empty rows → zeros, appliedToMatchResultCount=0", () => {
    const r = buildP76CanonicalWriterShadowAuditReport({
      generatedAt: "2026-05-17T00:00:00.000Z",
      rows: [],
      shadowEnv,
      readPathEnv: readPathEnv(),
    });
    expect(r.totalRows).toBe(0);
    expect(r.appliedToMatchResultCount).toBe(0);
    expect(r.eligibleCount).toBe(0);
    expect(r.sourceType).toBe(P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_TYPE);
    expect(r.sourceVersion).toBe(P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_VERSION);
    assertP76CanonicalWriterShadowAuditPrivacySafe(r);
  });

  it("aggregates blocked reasons", () => {
    const r = buildP76CanonicalWriterShadowAuditReport({
      generatedAt: "2026-05-17T00:00:00.000Z",
      rows: [
        {
          matchResult: {
            id: "mr-1",
            userId: VIEWER,
            candidateUserId: BASE,
            finalScore: 0.5,
          },
          sidecar: null,
        },
        {
          matchResult: {
            id: "mr-2",
            userId: VIEWER,
            candidateUserId: BASE,
            finalScore: 0.5,
          },
          sidecar: goodSidecar({ sourceVersion: "stale" }),
        },
        {
          matchResult: {
            id: "mr-3",
            userId: VIEWER,
            candidateUserId: BASE,
            finalScore: 0.5,
          },
          sidecar: goodSidecar({ rolledBack: true, dryRun: true, applied: false }),
        },
        {
          matchResult: {
            id: "mr-4",
            userId: VIEWER,
            candidateUserId: BASE,
            finalScore: 0.5,
          },
          sidecar: goodSidecar({ appliedToMatchResult: true }),
        },
        {
          matchResult: {
            id: "mr-5",
            userId: VIEWER,
            candidateUserId: BASE,
            finalScore: 0.5,
          },
          sidecar: goodSidecar(),
          sidecarCandidateExists: false,
        },
      ],
      shadowEnv,
      readPathEnv: readPathEnv(),
    });
    expect(r.totalRows).toBe(5);
    expect(r.blockedCount).toBe(5);
    expect(r.eligibleCount).toBe(0);
    expect(r.reasonCounts.missing_sidecar).toBe(1);
    expect(r.reasonCounts.stale_sidecar).toBe(1);
    expect(r.reasonCounts.rolled_back).toBe(1);
    expect(r.reasonCounts.violation_row).toBe(1);
    expect(r.reasonCounts.candidate_missing).toBe(1);
    expect(r.appliedToMatchResultCount).toBe(0);
  });

  it("eligible same candidate → eligibleCount++, no wouldChange", () => {
    const r = buildP76CanonicalWriterShadowAuditReport({
      generatedAt: "2026-05-17T00:00:00.000Z",
      rows: [matchRow("mr-same", SIDE)],
      shadowEnv,
      readPathEnv: readPathEnv(),
    });
    expect(r.eligibleCount).toBe(1);
    expect(r.wouldChangeCandidateCount).toBe(0);
    expect(r.rows[0]!.shadow.guardrails.reason).toBe("ok");
  });

  it("eligible changed candidate → wouldChangeCandidateCount++", () => {
    const r = buildP76CanonicalWriterShadowAuditReport({
      generatedAt: "2026-05-17T00:00:00.000Z",
      rows: [matchRow("mr-diff", BASE)],
      shadowEnv,
      readPathEnv: readPathEnv(),
    });
    expect(r.eligibleCount).toBe(1);
    expect(r.wouldChangeCandidateCount).toBe(1);
  });

  it("includeBlocked=false omits blocked rows from output list", () => {
    const r = buildP76CanonicalWriterShadowAuditReport({
      generatedAt: "2026-05-17T00:00:00.000Z",
      rows: [
        matchRow("mr-ok", SIDE),
        {
          matchResult: {
            id: "mr-block",
            userId: VIEWER,
            candidateUserId: BASE,
            finalScore: 0.5,
          },
          sidecar: null,
        },
      ],
      includeBlocked: false,
      shadowEnv,
      readPathEnv: readPathEnv(),
    });
    expect(r.totalRows).toBe(2);
    expect(r.blockedCount).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.matchResultId).toBe("mr-ok");
  });

  it("appliedToMatchResultCount stays 0 with shadow rows", () => {
    const r = buildP76CanonicalWriterShadowAuditReport({
      generatedAt: "2026-05-17T00:00:00.000Z",
      rows: [matchRow("mr-1", BASE)],
      shadowEnv,
      readPathEnv: readPathEnv(),
    });
    expect(r.rows.every((x) => x.shadow.appliedToMatchResult === false)).toBe(true);
    expect(r.appliedToMatchResultCount).toBe(0);
  });

  it("privacy: JSON has no forbidden sensitive keys", () => {
    const r = buildP76CanonicalWriterShadowAuditReport({
      generatedAt: "2026-05-17T00:00:00.000Z",
      rows: [matchRow("mr-1", BASE)],
      shadowEnv,
      readPathEnv: readPathEnv(),
    });
    const text = JSON.stringify(r);
    expect(text).not.toContain('"rawPrompt"');
    expect(text).not.toContain('"imageFeatures"');
    expect(text).not.toContain('"transcript"');
    assertP76CanonicalWriterShadowAuditPrivacySafe(r);
  });
});
