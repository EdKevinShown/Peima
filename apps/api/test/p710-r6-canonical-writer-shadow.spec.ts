/**
 * P7.10-r6 — P7.6 canonical writer shadow (no MatchResult writes).
 */
import {
  assertCanonicalWriterShadowNeverWritesMatchResult,
  buildP76CanonicalWriterShadowPayloadV1,
  P76_CANONICAL_WRITER_SHADOW_SOURCE_VERSION,
  readP76CanonicalWriterShadowEnv,
} from "../src/modules/matching/p76-canonical-writer-shadow";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";
import type { P76ReadPathEnv } from "../src/modules/matching/p76-read-path-env";

const VIEWER = "viewer-p710-r6";
const SIDE_CAND = "cand-sidecar-r6";
const BASE_CAND = "cand-baseline-r6";

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

function baseline(
  over: Partial<{
    candidateUserId: string;
    finalScore: number;
    displaySourceType: string;
  }> = {},
) {
  return {
    candidateUserId: BASE_CAND,
    finalScore: 0.82,
    displaySourceType: "match_result_original",
    ...over,
  };
}

function goodSidecar(
  over: Partial<{
    selectedCandidateId: string;
    sourceVersion: string;
    rolledBack: boolean;
    applied: boolean;
    appliedToMatchResult: boolean;
    dryRun: boolean;
    pmSignoffStatus: string;
  }> = {},
) {
  return {
    id: "meta-p710-r6",
    viewerUserId: VIEWER,
    selectedCandidateId: SIDE_CAND,
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

function buildEnabled(
  input: Parameters<typeof buildP76CanonicalWriterShadowPayloadV1>[0],
  readPathEnv = enabledReadPathEnv(),
) {
  const env = {
    PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED: "1",
    PEIMA_P76_READ_PATH_ENABLED: readPathEnv.enabled ? "1" : "0",
    PEIMA_P76_READ_PATH_VIEWER_IDS: readPathEnv.viewerAllowlist.join(","),
    PEIMA_P76_READ_PATH_SOURCE_VERSION: readPathEnv.sourceVersion,
  } as NodeJS.ProcessEnv;
  return buildP76CanonicalWriterShadowPayloadV1(input, { env, readPathEnv });
}

describe("p76-canonical-writer-shadow-env (P7.10-r6)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to disabled", () => {
    delete process.env.PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED;
    expect(readP76CanonicalWriterShadowEnv().enabled).toBe(false);
  });

  it("PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED=1 → enabled", () => {
    process.env.PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED = "1";
    expect(readP76CanonicalWriterShadowEnv().enabled).toBe(true);
  });
});

describe("buildP76CanonicalWriterShadowPayloadV1 (P7.10-r6)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("shadow env off → disabled guardrail, appliedToMatchResult false", () => {
    delete process.env.PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED;
    const p = buildP76CanonicalWriterShadowPayloadV1({
      viewerUserId: VIEWER,
      baseline: baseline(),
      sidecar: goodSidecar(),
    });
    expect(p.appliedToMatchResult).toBe(false);
    expect(p.mode).toBe("shadow");
    expect(p.guardrails).toEqual({ eligible: false, reason: "disabled" });
    assertCanonicalWriterShadowNeverWritesMatchResult(p);
  });

  it("eligible sidecar → ok, wouldChangeCandidate, appliedToMatchResult false", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline(),
      sidecar: goodSidecar(),
    });
    expect(p.appliedToMatchResult).toBe(false);
    expect(p.schemaVersion).toBe(1);
    expect(p.sourceVersion).toBe(P76_CANONICAL_WRITER_SHADOW_SOURCE_VERSION);
    expect(p.guardrails).toEqual({ eligible: true, reason: "ok" });
    expect(p.proposal.selectedCandidateUserId).toBe(SIDE_CAND);
    expect(p.comparison.wouldChangeCandidate).toBe(true);
    expect(p.comparison.scoreDelta).toBe(0);
    expect(p.comparison.scoreDeltaBand).toBe("none");
    expect(p.provenance.inputSource).toBe("p76_allowlist_sidecar");
    assertCanonicalWriterShadowNeverWritesMatchResult(p);
  });

  it("missing baseline → missing_baseline", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: { candidateUserId: null, finalScore: null },
      sidecar: goodSidecar(),
    });
    expect(p.guardrails.reason).toBe("missing_baseline");
    expect(p.proposal.selectedCandidateUserId).toBeNull();
  });

  it("missing sidecar → missing_sidecar", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline(),
      sidecar: null,
    });
    expect(p.guardrails.reason).toBe("missing_sidecar");
  });

  it("stale sourceVersion → stale_sidecar", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline(),
      sidecar: goodSidecar({ sourceVersion: "stale-cohort" }),
    });
    expect(p.guardrails.reason).toBe("stale_sidecar");
  });

  it("rolledBack → rolled_back", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline(),
      sidecar: goodSidecar({ rolledBack: true, dryRun: true, applied: false }),
    });
    expect(p.guardrails.reason).toBe("rolled_back");
  });

  it("violation main_chain_flag → violation_row", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline(),
      sidecar: goodSidecar({ appliedToMatchResult: true }),
    });
    expect(p.guardrails.reason).toBe("violation_row");
  });

  it("candidate missing → candidate_missing", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline(),
      sidecar: goodSidecar(),
      sidecarCandidateExists: false,
    });
    expect(p.guardrails.reason).toBe("candidate_missing");
  });

  it("non-allowlist viewer → not_allowlisted", () => {
    const p = buildEnabled(
      {
        viewerUserId: VIEWER,
        baseline: baseline(),
        sidecar: goodSidecar(),
      },
      enabledReadPathEnv({ viewerAllowlist: ["other-viewer"] }),
    );
    expect(p.guardrails.reason).toBe("not_allowlisted");
  });

  it("read path env disabled → env_disabled", () => {
    const p = buildEnabled(
      {
        viewerUserId: VIEWER,
        baseline: baseline(),
        sidecar: goodSidecar(),
      },
      enabledReadPathEnv({ enabled: false }),
    );
    expect(p.guardrails.reason).toBe("env_disabled");
  });

  it("resolver error → exception", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline(),
      sidecar: goodSidecar(),
      resolverError: new Error("resolver failed"),
    });
    expect(p.guardrails.reason).toBe("exception");
  });

  it("same candidate → wouldChangeCandidate false", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline({ candidateUserId: SIDE_CAND }),
      sidecar: goodSidecar({ selectedCandidateId: SIDE_CAND }),
    });
    expect(p.guardrails.reason).toBe("ok");
    expect(p.comparison.wouldChangeCandidate).toBe(false);
  });

  it("baseline displaySourceType match_result_original preserved in payload", () => {
    const p = buildEnabled({
      viewerUserId: VIEWER,
      baseline: baseline({ displaySourceType: "match_result_original" }),
      sidecar: goodSidecar(),
    });
    expect(p.baseline.displaySourceType).toBe("match_result_original");
    expect("static_fallback").toBe("static_fallback");
  });

  it("invariant: appliedToMatchResult is always false on built payload", () => {
    const cases = [
      buildP76CanonicalWriterShadowPayloadV1({ viewerUserId: VIEWER }),
      buildEnabled({ viewerUserId: VIEWER, baseline: baseline(), sidecar: goodSidecar() }),
    ];
    for (const p of cases) {
      expect(p.appliedToMatchResult).toBe(false);
      assertCanonicalWriterShadowNeverWritesMatchResult(p);
    }
  });
});
