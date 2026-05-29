/**
 * P7.10-r7d — Admin Apply preview payload builder (no DB / MatchResult writes).
 */
import {
  assertP76CanonicalApplyPreviewNeverWrites,
  buildP76CanonicalApplyPreviewPayloadV1,
  evaluateP76CanonicalApplyPreviewGates,
} from "../src/modules/matching/p76-canonical-apply-preview-builder";
import {
  P76_CANONICAL_APPLY_PREVIEW_SOURCE_TYPE,
  P76_CANONICAL_APPLY_PREVIEW_SOURCE_VERSION,
  type P76CanonicalApplyPreviewInputV1,
} from "../src/modules/matching/p76-canonical-apply-preview.types";

const VIEWER = "viewer-p710-r7d";
const MR_ID = "mr-p710-r7d";
const SIDECAR_ID = "sidecar-p710-r7d";
const CAND_OLD = "cand-old-p710-r7d";
const CAND_NEW = "cand-new-p710-r7d";

function goodContext(): NonNullable<P76CanonicalApplyPreviewInputV1["context"]> {
  return {
    gate12Status: "PASS",
    grafanaStatus: "PASS",
    pmSignoffRequired: true,
    opsSignoffRequired: true,
    productionWriteRequested: false,
    incidentActive: false,
    percentRolloutActive: false,
    workerDeployActive: false,
  };
}

function goodInput(
  over: Partial<P76CanonicalApplyPreviewInputV1> = {},
): P76CanonicalApplyPreviewInputV1 {
  return {
    sidecar: {
      id: SIDECAR_ID,
      auditRunId: "audit-p710-r7d",
      environment: "dev",
      viewerUserId: VIEWER,
      matchResultId: MR_ID,
      selectedCandidateId: CAND_NEW,
      score: 0.85,
      reasonSummary: "canonical proposal",
      sourceVersion: "p7.6-r7j3-staging-cohort-v1",
      promotionStatus: "not_promoted",
      appliedToMatchResult: false,
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      rolledBack: false,
      deletedAt: null,
      supersededAt: null,
      pmSignoffStatus: "approved",
      opsSignoffStatus: "approved",
    },
    currentMatchResult: {
      id: MR_ID,
      viewerUserId: VIEWER,
      candidateUserId: CAND_OLD,
      finalScore: 0.7,
      reasonSummary: "worker baseline",
      matchInsights: { version: 1 },
    },
    context: goodContext(),
    ...over,
  };
}

function blockedReasons(input: P76CanonicalApplyPreviewInputV1): string[] {
  return evaluateP76CanonicalApplyPreviewGates(input)
    .filter((g) => !g.pass)
    .map((g) => g.blockedReason!)
    .filter(Boolean);
}

describe("buildP76CanonicalApplyPreviewPayloadV1 (P7.10-r7d)", () => {
  it("builds preview payload with mode preview", () => {
    const p = buildP76CanonicalApplyPreviewPayloadV1(goodInput());
    expect(p.schemaVersion).toBe(1);
    expect(p.sourceType).toBe(P76_CANONICAL_APPLY_PREVIEW_SOURCE_TYPE);
    expect(p.sourceVersion).toBe(P76_CANONICAL_APPLY_PREVIEW_SOURCE_VERSION);
    expect(p.mode).toBe("preview");
    expect(p.sidecar?.id).toBe(SIDECAR_ID);
    expect(p.currentMatchResult?.id).toBe(MR_ID);
  });

  it("never writes — safety flags all false", () => {
    const p = buildP76CanonicalApplyPreviewPayloadV1(goodInput());
    expect(p.safety).toEqual({
      writesDb: false,
      writesMatchResult: false,
      writesFinalScore: false,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    });
  });

  it("candidateWouldChange true when candidate differs", () => {
    const p = buildP76CanonicalApplyPreviewPayloadV1(goodInput());
    expect(p.proposedChange.candidateWouldChange).toBe(true);
  });

  it("scoreWouldChange true when score differs", () => {
    const p = buildP76CanonicalApplyPreviewPayloadV1(goodInput());
    expect(p.proposedChange.scoreWouldChange).toBe(true);
  });

  it("displayWouldChange true when candidate or score differs", () => {
    const p = buildP76CanonicalApplyPreviewPayloadV1(goodInput());
    expect(p.proposedChange.displayWouldChange).toBe(true);
  });

  it("blocks missing sidecar", () => {
    const reasons = blockedReasons(goodInput({ sidecar: null }));
    expect(reasons).toContain("missing_sidecar");
    const p = buildP76CanonicalApplyPreviewPayloadV1(goodInput({ sidecar: null }));
    expect(p.canApply).toBe(false);
    expect(p.sidecar).toBeNull();
  });

  it("blocks missing MatchResult", () => {
    const reasons = blockedReasons(goodInput({ currentMatchResult: null }));
    expect(reasons).toContain("missing_match_result");
  });

  it("blocks viewer mismatch", () => {
    const reasons = blockedReasons(
      goodInput({
        currentMatchResult: {
          id: MR_ID,
          viewerUserId: "other-viewer",
          candidateUserId: CAND_OLD,
          finalScore: 0.7,
        },
      }),
    );
    expect(reasons).toContain("viewer_mismatch");
  });

  it("blocks missing selectedCandidateId", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, selectedCandidateId: null },
      }),
    );
    expect(reasons).toContain("missing_selected_candidate");
  });

  it("blocks non-finite score", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, score: Number.NaN },
      }),
    );
    expect(reasons).toContain("score_missing");
  });

  it("blocks already promoted", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, promotionStatus: "promoted" },
      }),
    );
    expect(reasons).toContain("sidecar_already_promoted");
  });

  it("blocks rolledBack", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, rolledBack: true },
      }),
    );
    expect(reasons).toContain("sidecar_rolled_back");
  });

  it("blocks deleted / superseded", () => {
    expect(
      blockedReasons(
        goodInput({
          sidecar: { ...goodInput().sidecar!, deletedAt: "2026-05-19T00:00:00.000Z" },
        }),
      ),
    ).toContain("sidecar_deleted");
    expect(
      blockedReasons(
        goodInput({
          sidecar: { ...goodInput().sidecar!, supersededAt: "2026-05-19T00:00:00.000Z" },
        }),
      ),
    ).toContain("sidecar_superseded");
  });

  it("blocks appliedToWorkerRanking=true", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, appliedToWorkerRanking: true },
      }),
    );
    expect(reasons).toContain("sidecar_applied_to_worker_ranking");
  });

  it("blocks appliedToMatchResult=true", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, appliedToMatchResult: true },
      }),
    );
    expect(reasons).toContain("sidecar_applied_to_match_result");
  });

  it("blocks appliedToFinalScore=true", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, appliedToFinalScore: true },
      }),
    );
    expect(reasons).toContain("sidecar_applied_to_final_score");
  });

  it("blocks Gate 12 not final", () => {
    const reasons = blockedReasons(
      goodInput({
        context: {
          ...goodContext(),
          gate12Status: "STAGING_GET_MATRIX_READY_MONITORING_PENDING",
        },
      }),
    );
    expect(reasons).toContain("gate12_not_final");
  });

  it("blocks Grafana blocked", () => {
    const reasons = blockedReasons(
      goodInput({
        context: {
          ...goodContext(),
          grafanaStatus: "P7_6_R9E3F2_BLOCKED_BY_MISSING_GRAFANA_ACCESS",
        },
      }),
    );
    expect(reasons).toContain("grafana_blocked");
  });

  it("blocks missing PM signoff", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, pmSignoffStatus: "pending" },
      }),
    );
    expect(reasons).toContain("pm_signoff_missing");
  });

  it("blocks missing Ops signoff", () => {
    const reasons = blockedReasons(
      goodInput({
        sidecar: { ...goodInput().sidecar!, opsSignoffStatus: "pending" },
      }),
    );
    expect(reasons).toContain("ops_signoff_missing");
  });

  it("blocks incident active", () => {
    const reasons = blockedReasons(
      goodInput({ context: { ...goodContext(), incidentActive: true } }),
    );
    expect(reasons).toContain("incident_active");
  });

  it("blocks percent rollout active", () => {
    const reasons = blockedReasons(
      goodInput({ context: { ...goodContext(), percentRolloutActive: true } }),
    );
    expect(reasons).toContain("percent_rollout_active");
  });

  it("blocks worker deploy active", () => {
    const reasons = blockedReasons(
      goodInput({ context: { ...goodContext(), workerDeployActive: true } }),
    );
    expect(reasons).toContain("worker_deploy_active");
  });

  it("production write requested blocked", () => {
    const reasons = blockedReasons(
      goodInput({ context: { ...goodContext(), productionWriteRequested: true } }),
    );
    expect(reasons).toContain("production_write_blocked");
  });

  it("canApply true only when all gates pass", () => {
    const passing = buildP76CanonicalApplyPreviewPayloadV1(goodInput());
    expect(passing.canApply).toBe(true);
    expect(passing.blockedReasons).toEqual([]);

    const failing = buildP76CanonicalApplyPreviewPayloadV1(
      goodInput({ context: { ...goodContext(), incidentActive: true } }),
    );
    expect(failing.canApply).toBe(false);
    expect(failing.blockedReasons.length).toBeGreaterThan(0);
  });

  it("rollbackPreview redacts token", () => {
    const p = buildP76CanonicalApplyPreviewPayloadV1(goodInput());
    expect(p.rollbackPreview.snapshotAvailable).toBe(true);
    expect(p.rollbackPreview.rollbackTokenRequired).toBe(true);
    expect(p.rollbackPreview.rollbackTokenPreview).toBe("redacted");
  });

  it("assert preview never writes", () => {
    const p = buildP76CanonicalApplyPreviewPayloadV1(goodInput());
    assertP76CanonicalApplyPreviewNeverWrites(p);
    expect(() =>
      assertP76CanonicalApplyPreviewNeverWrites({
        ...p,
        safety: { ...p.safety, writesDb: true as false },
      }),
    ).toThrow(/must not write DB/);
  });
});
