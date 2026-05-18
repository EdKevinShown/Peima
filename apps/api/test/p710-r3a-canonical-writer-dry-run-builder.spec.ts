/**
 * P7.10-r3a — P7.6 canonical writer dry-run payload builder (no DB / MatchResult writes).
 */
import {
  assertCanonicalWriterDryRunNeverWritesMatchResult,
  buildP76CanonicalWriterDryRunPayloadV1,
  evaluateP76CanonicalWriterDryRunGuardrails,
} from "../src/modules/matching/p76-canonical-writer-dry-run-builder";
import {
  P76_CANONICAL_WRITER_DRY_RUN_SOURCE_TYPE,
  P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
} from "../src/modules/matching/p76-canonical-writer-dry-run.types";
import type {
  P76Stage1PhotoVisualSummaryV1,
  P76Stage2TwentyDSummaryV1,
  P76Stage3RrmSummaryV1,
} from "../src/modules/matching/p76-end-to-end-funnel-shadow.types";

const VIEWER = "viewer-p710-r3a";
const CANDIDATE = "cand-p710-r3a";

function stage1(): P76Stage1PhotoVisualSummaryV1 {
  return {
    sourceVersion: "p7.6-stage1-v1",
    selectedCandidateIds: [CANDIDATE],
    topCandidatesSummary: [
      {
        candidateUserId: CANDIDATE,
        mutualPhotoVisualFit: 0.7,
        rank: 1,
      },
    ],
  };
}

function stage2(): P76Stage2TwentyDSummaryV1 {
  return {
    sourceVersion: "p7.6-stage2-v1",
    top2CandidateIds: [CANDIDATE, "cand-other"],
    selectedBy20DOnlyCandidateId: CANDIDATE,
    rankedCandidatesSummary: [
      { candidateUserId: CANDIDATE, mutual20DFit: 0.8, rank: 1 },
    ],
  };
}

function stage3(): P76Stage3RrmSummaryV1 {
  return {
    sourceVersion: "p7.6-stage3-v1",
    selectedByRrmCandidateId: CANDIDATE,
    rankedCandidatesSummary: [
      { candidateUserId: CANDIDATE, mutualRrmFit: 0.75, rank: 1 },
    ],
    reasonSummary: "RRM selected top mutual fit",
  };
}

function goodInput(
  over: Partial<Parameters<typeof buildP76CanonicalWriterDryRunPayloadV1>[0]> = {},
) {
  return {
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
  };
}

describe("buildP76CanonicalWriterDryRunPayloadV1 (P7.10-r3a)", () => {
  it("eligible funnel → ok, dry_run invariants, stage summary present", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(goodInput());
    expect(p.schemaVersion).toBe(1);
    expect(p.sourceType).toBe(P76_CANONICAL_WRITER_DRY_RUN_SOURCE_TYPE);
    expect(p.sourceVersion).toBe(P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION);
    expect(p.mode).toBe("dry_run");
    expect(p.viewerUserId).toBe(VIEWER);
    expect(p.selectedCandidateId).toBe(CANDIDATE);
    expect(p.score).toBe(0.88);
    expect(p.reasonSummary).toBe("RRM selected top mutual fit");
    expect(p.stageSummary.stage1PhotoVisual).toBeDefined();
    expect(p.stageSummary.stage2Ranking).toBeDefined();
    expect(p.stageSummary.stage3Rrm).toBeDefined();
    expect(p.guardrails).toEqual({
      eligible: true,
      reason: "ok",
      blockedReasons: [],
    });
    expect(p.safeFallbackMeta).toEqual({
      safeFallbackRequired: false,
      reason: null,
    });
    expect(p.appliedToMatchResult).toBe(false);
    expect(p.appliedToFinalScore).toBe(false);
    expect(p.appliedToWorkerRanking).toBe(false);
    assertCanonicalWriterDryRunNeverWritesMatchResult(p);
  });

  it("derives selectedCandidateId from stage3 when explicit field omitted", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({ selectedCandidateId: undefined }),
    );
    expect(p.selectedCandidateId).toBe(CANDIDATE);
  });

  it("missing viewer → missing_viewer + safe_fallback_required", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({ viewerUserId: "  " }),
    );
    expect(p.guardrails.eligible).toBe(false);
    expect(p.guardrails.reason).toBe("missing_viewer");
    expect(p.guardrails.blockedReasons).toContain("missing_viewer");
    expect(p.guardrails.blockedReasons).toContain("safe_fallback_required");
    expect(p.safeFallbackMeta.safeFallbackRequired).toBe(true);
    expect(p.selectedCandidateId).toBeNull();
    expect(p.score).toBeNull();
  });

  it.each([
    ["missing_stage1", { stage1PhotoVisual: undefined }],
    ["missing_stage2", { stage2Ranking: undefined }],
    ["missing_stage3", { stage3Rrm: undefined }],
  ] as const)("guardrail %s", (reason, patch) => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(goodInput(patch));
    expect(p.guardrails.eligible).toBe(false);
    expect(p.guardrails.reason).toBe(reason);
    expect(p.guardrails.blockedReasons).toContain(reason);
  });

  it("rolled_back → rolled_back", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(goodInput({ rolledBack: true }));
    expect(p.guardrails.reason).toBe("rolled_back");
  });

  it("violation_blocked when violation status not ok", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({ violationStatus: "p0_block" }),
    );
    expect(p.guardrails.reason).toBe("violation_blocked");
  });

  it("stale_source_version when cohort version mismatches", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({ cohortSourceVersion: "stale-cohort-v0" }),
    );
    expect(p.guardrails.reason).toBe("stale_source_version");
  });

  it("not_allowlisted when viewer not on allowlist", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({ viewerAllowlist: ["other-viewer"] }),
    );
    expect(p.guardrails.reason).toBe("not_allowlisted");
  });

  it("candidate_missing when candidateExists false", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({ candidateExists: false }),
    );
    expect(p.guardrails.blockedReasons).toContain("candidate_missing");
  });

  it("score_missing when score absent", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({ score: undefined }),
    );
    expect(p.guardrails.reason).toBe("score_missing");
  });

  it("missing_selected_candidate when stage3 has no selection", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({
        stage3Rrm: {
          ...stage3(),
          selectedByRrmCandidateId: null,
        },
        selectedCandidateId: null,
      }),
    );
    expect(p.guardrails.reason).toBe("missing_selected_candidate");
  });

  it("exception when resolverError set", () => {
    const p = buildP76CanonicalWriterDryRunPayloadV1(
      goodInput({ resolverError: new Error("boom") }),
    );
    expect(p.guardrails.reason).toBe("exception");
  });

  it("evaluateP76CanonicalWriterDryRunGuardrails is pure", () => {
    const input = goodInput();
    expect(evaluateP76CanonicalWriterDryRunGuardrails(input)).toEqual({
      eligible: true,
      reason: "ok",
      blockedReasons: [],
    });
  });

  it("assertCanonicalWriterDryRunNeverWritesMatchResult rejects appliedToMatchResult true", () => {
    expect(() =>
      assertCanonicalWriterDryRunNeverWritesMatchResult({
        mode: "dry_run",
        appliedToMatchResult: true as unknown as false,
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
      }),
    ).toThrow(/appliedToMatchResult=true/);
  });
});
