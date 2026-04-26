import {
  ITEM_STATUS,
  JOB_STATUS,
  JOB_AUDIT_V0_BUILDABILITY_DETAIL,
  JOB_AUDIT_V0_DIAGNOSTIC_BUCKET,
  JOB_AUDIT_V0_SPEC_CLASSIFICATION,
  JOB_AUDIT_V0_SUPPRESSED_REASON,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { buildJobAuditV0 } from "../src/modules/ai-simulation-v1/ai-simulation-v1-job-audit-v0";
import { computeShortlistFingerprint } from "../src/modules/ai-simulation-v1/shortlist-contract-binding";
import { tryBuildShortlistDecisionV0 } from "../src/modules/ai-simulation-v1/shortlist-decision-v0";
import { tryBuildShortlistFourDimV0 } from "../src/modules/ai-simulation-v1/shortlist-four-dim-v0";
import { tryBuildShortlistScenariosV0 } from "../src/modules/ai-simulation-v1/shortlist-scenarios-v0";

function binding(ids: string[]) {
  return {
    previewPoolId: "p1",
    shortlistSchemaVersion: "preview_pool_shortlist_contract_v0",
    shortlistCandidateUserIds: ids,
    shortlistFingerprint: computeShortlistFingerprint(ids),
  };
}

function ev(score: number, recommendation: "explore_more" | "hold" | "slow_down") {
  return {
    continue_recommendation: recommendation,
    risk_tags: recommendation === "slow_down" ? ["value_gap"] : [],
    mitigation_hints: [],
    simulationRankScore: score,
    confidence: "medium" as const,
  };
}

describe("buildJobAuditV0 (Phase F v0.1)", () => {
  it("queued job: job_in_progress, rankConsistent null", () => {
    const b = binding(["a", "b"]);
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.QUEUED,
      shortlistBinding: b,
      shortlistScenariosV0: null,
      shortlistFourDimV0: null,
      shortlistDecisionV0: null,
      items: [
        { candidateUserId: "a", status: ITEM_STATUS.QUEUED, evaluator: null },
        { candidateUserId: "b", status: ITEM_STATUS.QUEUED, evaluator: null },
      ],
    });
    expect(audit.rankConsistent).toBeNull();
    expect(audit.sidecarTrioPresent).toBe(false);
    expect(audit.itemCounts).toEqual({ total: 2, queued: 2, running: 0, succeeded: 0, failed: 0 });
    expect(audit.sidecarSuppressedReason).toBe(JOB_AUDIT_V0_SUPPRESSED_REASON.JOB_IN_PROGRESS);
    expect(audit.diagnosticBucket).toBe(JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.IN_PROGRESS);
  });

  it("running job: job_in_progress", () => {
    const b = binding(["a", "b"]);
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.RUNNING,
      shortlistBinding: b,
      shortlistScenariosV0: null,
      shortlistFourDimV0: null,
      shortlistDecisionV0: null,
      items: [
        { candidateUserId: "a", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.8, "hold") },
        { candidateUserId: "b", status: ITEM_STATUS.RUNNING, evaluator: null },
      ],
    });
    expect(audit.sidecarSuppressedReason).toBe(JOB_AUDIT_V0_SUPPRESSED_REASON.JOB_IN_PROGRESS);
  });

  it("completed with persisted trio and matching recompute: none", () => {
    const b = binding(["c1", "c2"]);
    const items = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.86, "hold") },
      { candidateUserId: "c2", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.7, "slow_down") },
    ];
    const scenarios = tryBuildShortlistScenariosV0(b, items)!;
    const four = tryBuildShortlistFourDimV0(scenarios)!;
    const dec = tryBuildShortlistDecisionV0(b, items)!;
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.COMPLETED,
      shortlistBinding: b,
      shortlistScenariosV0: scenarios,
      shortlistFourDimV0: four,
      shortlistDecisionV0: dec,
      items,
    });
    expect(audit.sidecarTrioPresent).toBe(true);
    expect(audit.sidecarSuppressedReason).toBe(JOB_AUDIT_V0_SUPPRESSED_REASON.NONE);
    expect(audit.rankConsistent).toBe(true);
    expect(audit.specClassification).toBe(JOB_AUDIT_V0_SPEC_CLASSIFICATION.CURRENT_SHORTLIST_CONTRACT);
    expect(audit.diagnosticBucket).toBe(JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.CURRENT_OK);
    expect(audit.buildabilityDetail).toBe(JOB_AUDIT_V0_BUILDABILITY_DETAIL.NONE);
  });

  it("completed, DB empty, rank_mismatch", () => {
    const b = binding(["cand_a", "cand_b"]);
    type ItRow = { candidateUserId: string; status: string; evaluator: ReturnType<typeof ev> | null };
    let found: { items: ItRow[] } | null = null;
    for (const s1 of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99]) {
      for (const s2 of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99]) {
        for (const r1 of ["explore_more", "hold", "slow_down"] as const) {
          for (const r2 of ["explore_more", "hold", "slow_down"] as const) {
            const items: ItRow[] = [
              { candidateUserId: "cand_a", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(s1, r1) },
              { candidateUserId: "cand_b", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(s2, r2) },
            ];
            const scenarios = tryBuildShortlistScenariosV0(b, items);
            if (scenarios == null) continue;
            const four = tryBuildShortlistFourDimV0(scenarios);
            const dec = tryBuildShortlistDecisionV0(b, items);
            if (four == null || dec == null) continue;
            const a = four.comparison.rankedCandidateUserIds;
            const d = dec.rankedCandidateUserIds;
            if (a.length === d.length && a.every((id, i) => id === d[i])) continue;
            found = { items };
            break;
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (found == null) {
      throw new Error("grid search: no fourDim vs decision rank mismatch for 2-candidate shortlist");
    }
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.COMPLETED,
      shortlistBinding: b,
      shortlistScenariosV0: null,
      shortlistFourDimV0: null,
      shortlistDecisionV0: null,
      items: found.items,
    });
    expect(audit.sidecarTrioPresent).toBe(false);
    expect(audit.sidecarSuppressedReason).toBe(JOB_AUDIT_V0_SUPPRESSED_REASON.RANK_MISMATCH);
    expect(audit.rankConsistent).toBe(false);
    expect(audit.diagnosticBucket).toBe(JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.CURRENT_ANOMALY);
    expect(audit.buildabilityDetail).toBe(JOB_AUDIT_V0_BUILDABILITY_DETAIL.RANK_MISMATCH);
  });

  it("completed, DB empty but recompute would persist trio: persisted_sidecars_stale", () => {
    const b = binding(["c1", "c2"]);
    const items = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.86, "hold") },
      { candidateUserId: "c2", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.7, "slow_down") },
    ];
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.COMPLETED,
      shortlistBinding: b,
      shortlistScenariosV0: null,
      shortlistFourDimV0: null,
      shortlistDecisionV0: null,
      items,
    });
    const scenarios = tryBuildShortlistScenariosV0(b, items)!;
    const four = tryBuildShortlistFourDimV0(scenarios)!;
    const dec = tryBuildShortlistDecisionV0(b, items)!;
    if (
      scenarios == null ||
      four == null ||
      dec == null ||
      JSON.stringify(four.comparison.rankedCandidateUserIds) !== JSON.stringify(dec.rankedCandidateUserIds)
    ) {
      throw new Error("fixture: expected recompute to produce rank-consistent sidecars");
    }
    expect(audit.sidecarSuppressedReason).toBe(JOB_AUDIT_V0_SUPPRESSED_REASON.PERSISTED_SIDECARS_STALE);
    expect(audit.rankConsistent).toBe(true);
    expect(audit.buildabilityDetail).toBe(JOB_AUDIT_V0_BUILDABILITY_DETAIL.PERSISTED_SIDECARS_STALE);
  });

  it("completed, DB has sidecar JSON but current items do not match recompute: persisted_sidecars_inconsistent", () => {
    const b = binding(["c1", "c2"]);
    const itemsOk = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.86, "hold") },
      { candidateUserId: "c2", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.7, "slow_down") },
    ];
    const scenarios = tryBuildShortlistScenariosV0(b, itemsOk)!;
    const four = tryBuildShortlistFourDimV0(scenarios)!;
    const dec = tryBuildShortlistDecisionV0(b, itemsOk)!;
    const itemsCorrupt = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.86, "hold") },
      { candidateUserId: "c2", status: ITEM_STATUS.FAILED, evaluator: null },
    ];
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.COMPLETED,
      shortlistBinding: b,
      shortlistScenariosV0: scenarios,
      shortlistFourDimV0: four,
      shortlistDecisionV0: dec,
      items: itemsCorrupt,
    });
    expect(audit.sidecarTrioPresent).toBe(true);
    expect(audit.sidecarSuppressedReason).toBe(
      JOB_AUDIT_V0_SUPPRESSED_REASON.PERSISTED_SIDECARS_INCONSISTENT,
    );
    expect(audit.buildabilityDetail).toBe(JOB_AUDIT_V0_BUILDABILITY_DETAIL.PERSISTED_SIDECARS_INCONSISTENT);
  });

  it("completed, one item failed: four_dim_not_buildable (scenarios may exist, fourDim not)", () => {
    const b = binding(["c1", "c2"]);
    const items = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.8, "hold") },
      { candidateUserId: "c2", status: ITEM_STATUS.FAILED, evaluator: null },
    ];
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.COMPLETED,
      shortlistBinding: b,
      shortlistScenariosV0: null,
      shortlistFourDimV0: null,
      shortlistDecisionV0: null,
      items,
    });
    expect(audit.sidecarSuppressedReason).toBe(JOB_AUDIT_V0_SUPPRESSED_REASON.FOUR_DIM_NOT_BUILDABLE);
    expect(audit.buildabilityDetail).toBe(JOB_AUDIT_V0_BUILDABILITY_DETAIL.ITEMS_INCOMPLETE_OR_FAILED);
    expect(audit.diagnosticBucket).toBe(JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.CURRENT_ANOMALY);
  });

  it("completed, no shortlistBinding object: legacy_acceptable + binding_missing", () => {
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.COMPLETED,
      shortlistBinding: null,
      shortlistScenariosV0: null,
      shortlistFourDimV0: null,
      shortlistDecisionV0: null,
      items: [],
    });
    expect(audit.shortlistBindingPresent).toBe(false);
    expect(audit.specClassification).toBe(JOB_AUDIT_V0_SPEC_CLASSIFICATION.LEGACY_PRE_SHORTLIST_CONTRACT);
    expect(audit.diagnosticBucket).toBe(JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.LEGACY_ACCEPTABLE);
    expect(audit.buildabilityDetail).toBe(JOB_AUDIT_V0_BUILDABILITY_DETAIL.BINDING_MISSING);
  });

  it("completed, malformed shortlistBinding object: current_anomaly + binding_shape_invalid", () => {
    const audit = buildJobAuditV0({
      jobStatus: JOB_STATUS.COMPLETED,
      shortlistBinding: { shortlistCandidateUserIds: "bad-shape" },
      shortlistScenariosV0: null,
      shortlistFourDimV0: null,
      shortlistDecisionV0: null,
      items: [],
    });
    expect(audit.shortlistBindingPresent).toBe(true);
    expect(audit.specClassification).toBe(JOB_AUDIT_V0_SPEC_CLASSIFICATION.UNKNOWN);
    expect(audit.diagnosticBucket).toBe(JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.CURRENT_ANOMALY);
    expect(audit.buildabilityDetail).toBe(JOB_AUDIT_V0_BUILDABILITY_DETAIL.BINDING_SHAPE_INVALID);
  });
});
