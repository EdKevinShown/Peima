/**
 * P7.10-r7g — rollback snapshot dry-run builder (no DB / MatchResult writes).
 */
import { buildP76CanonicalApplyPreviewPayloadV1 } from "../src/modules/matching/p76-canonical-apply-preview-builder";
import type { P76CanonicalApplyPreviewInputV1 } from "../src/modules/matching/p76-canonical-apply-preview.types";
import {
  assertP76CanonicalRollbackSnapshotNeverWrites,
  buildP76CanonicalApplyRollbackSnapshotV1,
  computeP76BaselineFingerprintV1,
  evaluateP76CanonicalApplyRollbackSnapshotGuards,
  summarizeP76MatchInsightsForRollbackSnapshot,
} from "../src/modules/matching/p76-canonical-apply-rollback-snapshot-builder";
import {
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_TYPE,
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_VERSION,
  type P76CanonicalApplyRollbackSnapshotBuildInputV1,
} from "../src/modules/matching/p76-canonical-apply-rollback-snapshot.types";

const VIEWER = "viewer-p710-r7g";
const MR_ID = "mr-p710-r7g";
const SIDECAR_ID = "sidecar-p710-r7g";
const CAND_OLD = "cand-old-p710-r7g";
const CAND_NEW = "cand-new-p710-r7g";
const CAPTURED_AT = "2026-05-19T14:00:00.000Z";

function previewInput(): P76CanonicalApplyPreviewInputV1 {
  return {
    sidecar: {
      id: SIDECAR_ID,
      auditRunId: "audit-r7g",
      environment: "dev",
      viewerUserId: VIEWER,
      matchResultId: MR_ID,
      selectedCandidateId: CAND_NEW,
      score: 0.85,
      reasonSummary: "canonical proposal",
      sourceVersion: "p7.6-cohort-v1",
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
      matchInsights: {
        version: 1,
        p76CanonicalWriterMeta: { source: "worker" },
        rawPrompt: "must-not-appear",
      },
    },
    context: {
      gate12Status: "PASS",
      grafanaStatus: "PASS",
      pmSignoffRequired: true,
      opsSignoffRequired: true,
      productionWriteRequested: false,
      incidentActive: false,
      percentRolloutActive: false,
      workerDeployActive: false,
    },
    previewedAt: CAPTURED_AT,
  };
}

function goodSnapshotInput(
  over: Partial<P76CanonicalApplyRollbackSnapshotBuildInputV1> = {},
): P76CanonicalApplyRollbackSnapshotBuildInputV1 {
  const preview = buildP76CanonicalApplyPreviewPayloadV1(previewInput());
  return {
    sidecar: previewInput().sidecar!,
    currentMatchResult: {
      ...previewInput().currentMatchResult!,
      updatedAt: "2026-05-19T13:00:00.000Z",
    },
    previewPayload: preview,
    now: CAPTURED_AT,
    rollbackTtlHours: 72,
    environment: "dev",
    approvals: { engineeringSignoffStatus: "not_required" },
    ...over,
  };
}

describe("buildP76CanonicalApplyRollbackSnapshotV1 (P7.10-r7g)", () => {
  it("builds snapshot for valid sidecar + MatchResult + preview", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    expect(s.schemaVersion).toBe(1);
    expect(s.sourceType).toBe(P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_TYPE);
    expect(s.sourceVersion).toBe(P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_VERSION);
    expect(s.mode).toBe("dry_run");
    expect(s.snapshotReady).toBe(true);
    expect(s.blockedReasons).toEqual([]);
    expect(s.sidecarId).toBe(SIDECAR_ID);
    expect(s.matchResultId).toBe(MR_ID);
    expect(s.viewerUserId).toBe(VIEWER);
  });

  it("before candidateUserId / finalScore captured", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    expect(s.before.candidateUserId).toBe(CAND_OLD);
    expect(s.before.finalScore).toBe(0.7);
    expect(s.before.reasonSummary).toBe("worker baseline");
  });

  it("proposedAfter candidateUserId / score captured", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    expect(s.proposedAfter.candidateUserId).toBe(CAND_NEW);
    expect(s.proposedAfter.finalScore).toBe(0.85);
    expect(s.proposedAfter.sourceVersion).toBe("p7.6-cohort-v1");
  });

  it("rollbackTokenPreview always redacted and rollbackTokenHash null", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    expect(s.rollback.rollbackTokenRequired).toBe(true);
    expect(s.rollback.rollbackTokenPreview).toBe("redacted");
    expect(s.rollback.rollbackTokenHash).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/rollbackTokenHash":"[a-f0-9]{32,}/i);
  });

  it("no rollbackToken plaintext in output", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    expect(JSON.stringify(s)).not.toContain("secret-rollback-plaintext");
    expect(JSON.stringify(s)).not.toContain("must-not-appear");
    expect(s.before.matchInsightsSummary?.topLevelKeys).not.toContain("rawPrompt");
    expect(s.rollback.rollbackTokenHash).toBeNull();
  });

  it("matchInsights summarized, not copied raw", () => {
    const summary = summarizeP76MatchInsightsForRollbackSnapshot({
      version: 1,
      p76CanonicalWriterMeta: { ok: true },
      rawPrompt: "strip-me",
    });
    expect(summary?.hasMatchInsights).toBe(true);
    expect(summary?.hasP76CanonicalWriterMeta).toBe(true);
    expect(summary?.forbiddenKeysStripped).toContain("rawPrompt");
    const s = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    expect(s.before.matchInsightsSummary?.topLevelKeys).not.toContain("rawPrompt");
    expect(JSON.stringify(s.before.matchInsightsSummary)).not.toContain("strip-me");
  });

  it("baselineFingerprint stable for same input", () => {
    const a = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    const b = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    expect(a.before.baselineFingerprint).toBe(b.before.baselineFingerprint);
    expect(a.before.baselineFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("baselineFingerprint changes if candidate / score / reason changes", () => {
    const base = goodSnapshotInput();
    const s1 = buildP76CanonicalApplyRollbackSnapshotV1(base);
    const s2 = buildP76CanonicalApplyRollbackSnapshotV1({
      ...base,
      currentMatchResult: {
        ...base.currentMatchResult!,
        candidateUserId: "other-candidate",
      },
    });
    const s3 = buildP76CanonicalApplyRollbackSnapshotV1({
      ...base,
      currentMatchResult: {
        ...base.currentMatchResult!,
        finalScore: 0.99,
        reasonSummary: "different reason",
      },
    });
    expect(s2.before.baselineFingerprint).not.toBe(s1.before.baselineFingerprint);
    expect(s3.before.baselineFingerprint).not.toBe(s1.before.baselineFingerprint);
  });

  it("missing MatchResult blocks", () => {
    const blocked = evaluateP76CanonicalApplyRollbackSnapshotGuards({
      ...goodSnapshotInput(),
      currentMatchResult: null,
    });
    expect(blocked).toContain("missing_current_match_result");
    const s = buildP76CanonicalApplyRollbackSnapshotV1({
      ...goodSnapshotInput(),
      currentMatchResult: null,
    });
    expect(s.snapshotReady).toBe(false);
    expect(s.blockedReasons).toContain("missing_current_match_result");
  });

  it("viewer mismatch blocks", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1({
      ...goodSnapshotInput(),
      currentMatchResult: {
        ...goodSnapshotInput().currentMatchResult!,
        viewerUserId: "other-viewer",
      },
    });
    expect(s.snapshotReady).toBe(false);
    expect(s.blockedReasons).toContain("viewer_mismatch");
  });

  it("preview canApply=false blocks", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1({
      ...goodSnapshotInput(),
      previewPayload: { canApply: false, blockedReasons: ["gate12_not_final"] },
    });
    expect(s.snapshotReady).toBe(false);
    expect(s.blockedReasons).toContain("preview_not_ready");
  });

  it("sidecar rolledBack blocks", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1({
      ...goodSnapshotInput(),
      sidecar: { ...goodSnapshotInput().sidecar!, rolledBack: true },
    });
    expect(s.blockedReasons).toContain("sidecar_rolled_back");
  });

  it("sidecar already promoted blocks", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1({
      ...goodSnapshotInput(),
      sidecar: { ...goodSnapshotInput().sidecar!, promotionStatus: "promoted" },
    });
    expect(s.blockedReasons).toContain("sidecar_already_promoted");
  });

  it("appliedTo* flags block", () => {
    for (const [field, reason] of [
      ["appliedToMatchResult", "sidecar_applied_to_match_result"],
      ["appliedToFinalScore", "sidecar_applied_to_final_score"],
      ["appliedToWorkerRanking", "sidecar_applied_to_worker_ranking"],
    ] as const) {
      const s = buildP76CanonicalApplyRollbackSnapshotV1({
        ...goodSnapshotInput(),
        sidecar: { ...goodSnapshotInput().sidecar!, [field]: true },
      });
      expect(s.blockedReasons).toContain(reason);
    }
  });

  it("no-write safety all false", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    expect(s.safety).toEqual({
      writesDb: false,
      writesMatchResult: false,
      writesFinalScore: false,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    });
  });

  it("assert snapshot never writes", () => {
    const s = buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput());
    assertP76CanonicalRollbackSnapshotNeverWrites(s);
    expect(() =>
      assertP76CanonicalRollbackSnapshotNeverWrites({
        ...s,
        safety: { ...s.safety, writesDb: true as false },
      }),
    ).toThrow(/must not write DB/);
  });

  it("computeP76BaselineFingerprintV1 is deterministic", () => {
    const summary = summarizeP76MatchInsightsForRollbackSnapshot({ version: 1 });
    const fp = computeP76BaselineFingerprintV1({
      matchResultId: MR_ID,
      viewerUserId: VIEWER,
      candidateUserId: CAND_OLD,
      finalScore: 0.7,
      reasonSummary: "worker baseline",
      matchInsightsSummary: summary,
      updatedAt: "2026-05-19T13:00:00.000Z",
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});
