import type { ActivePoolAuditReport } from "../src/modules/onboarding/onboarding-photo-preview-pool-active-audit";
import {
  R5_C2_V1_SOURCE_VERSION,
  R5_C2_V2_SOURCE_VERSION,
  activeAuditPass,
  auditViolationFlags,
  buildR5C2SignoffCases,
  evaluateR5C2CasePass,
} from "../src/dev-cli/p75-r5-c2-apply-writer-signoff-logic";

const VIEWER = "viewer-test-1";

function okAudit(
  poolSourceVersion: string | null = R5_C2_V1_SOURCE_VERSION,
): ActivePoolAuditReport {
  return {
    pool_id_masked: "p***",
    viewer_user_id_masked: "v***",
    viewer_gender_raw: "male",
    viewer_gender_normalized: "male",
    viewer_binary_for_gate: "male",
    pool_status: "active",
    pool_source_version: poolSourceVersion,
    pool_item_count: 6,
    items: Array.from({ length: 6 }, (_, i) => ({
      pool_id_masked: "p***",
      viewer_user_id_masked: "v***",
      viewer_gender_raw: "male",
      viewer_gender_normalized: "male",
      rank_in_pool: i + 1,
      tier: "aesthetic_fit",
      display_mode: "clear",
      candidate_user_id_masked: `c${i}***`,
      candidate_gender_raw: "female",
      image_url_present: true,
      image_url_redacted: true as const,
      source_image_key: `r4h:file-${i}`,
      is_viewer_self: false,
      violates_opposite_gender_gate: false,
      duplicate_candidate_user_id: false,
      duplicate_image_source_key: false,
      mapping_file: null,
      mapping_gender: null,
    })),
    notes: [],
  };
}

function baseObserved(overrides: Partial<Parameters<typeof evaluateR5C2CasePass>[1]>) {
  return {
    actualSourceVersion: R5_C2_V1_SOURCE_VERSION,
    actualApplyResultApplied: false,
    actualReason: "env_disabled",
    applyDryRunAppliedToPool: false,
    rootAppliedToPool: false,
    activeAuditPass: true,
    poolItemCount: 6,
    poolSourceVersionFromAudit: R5_C2_V1_SOURCE_VERSION,
    auditFlags: auditViolationFlags(okAudit()),
    shadowPresent: true,
    poolPresent: true,
    ...overrides,
  };
}

describe("buildR5C2SignoffCases", () => {
  it("defines five cases A–E with allowlist-only writer expectations", () => {
    const cases = buildR5C2SignoffCases(VIEWER);
    expect(cases.map((c) => c.caseId)).toEqual(["A", "B", "C", "D", "E"]);
    expect(cases.find((c) => c.caseId === "B")?.percent).toBe("100");
    expect(cases.find((c) => c.caseId === "B")?.allowlistDefined).toBe(false);
    expect(cases.find((c) => c.caseId === "D")?.allowlist).toBe(VIEWER);
    expect(cases.find((c) => c.caseId === "D")?.expectedSourceVersion).toBe(
      R5_C2_V2_SOURCE_VERSION,
    );
  });
});

describe("evaluateR5C2CasePass", () => {
  const cases = buildR5C2SignoffCases(VIEWER);

  it("Case A passes when v1 + env_disabled", () => {
    const spec = cases.find((c) => c.caseId === "A")!;
    const r = evaluateR5C2CasePass(spec, baseObserved({}));
    expect(r.pass).toBe(true);
  });

  it("Case B passes v1 + allowlist_empty even when percent would be 100 in env", () => {
    const spec = cases.find((c) => c.caseId === "B")!;
    const r = evaluateR5C2CasePass(
      spec,
      baseObserved({
        actualReason: "allowlist_empty",
      }),
    );
    expect(r.pass).toBe(true);
  });

  it("Case B fails if applyResult says ok (percent must not bypass allowlist)", () => {
    const spec = cases.find((c) => c.caseId === "B")!;
    const r = evaluateR5C2CasePass(
      spec,
      baseObserved({
        actualReason: "ok",
        actualApplyResultApplied: true,
        actualSourceVersion: R5_C2_V2_SOURCE_VERSION,
      }),
    );
    expect(r.pass).toBe(false);
    expect(r.caseError).toContain("apply_result");
  });

  it("Case D passes v2 + applied true", () => {
    const spec = cases.find((c) => c.caseId === "D")!;
    const r = evaluateR5C2CasePass(
      spec,
      baseObserved({
        actualSourceVersion: R5_C2_V2_SOURCE_VERSION,
        actualApplyResultApplied: true,
        actualReason: "ok",
        poolSourceVersionFromAudit: R5_C2_V2_SOURCE_VERSION,
      }),
    );
    expect(r.pass).toBe(true);
  });

  it("Case E passes rollback to v1", () => {
    const spec = cases.find((c) => c.caseId === "E")!;
    const r = evaluateR5C2CasePass(spec, baseObserved({}));
    expect(r.pass).toBe(true);
  });

  it("active audit fail fails case", () => {
    const spec = cases.find((c) => c.caseId === "A")!;
    const bad = okAudit();
    bad.items[0]!.is_viewer_self = true;
    const r = evaluateR5C2CasePass(
      spec,
      baseObserved({
        activeAuditPass: false,
        auditFlags: auditViolationFlags(bad),
      }),
    );
    expect(r.pass).toBe(false);
    expect(r.caseError).toContain("active_audit_failed");
  });
});

describe("activeAuditPass", () => {
  it("requires six items and no violations", () => {
    expect(activeAuditPass(okAudit())).toBe(true);
    const few = { ...okAudit(), pool_item_count: 5 };
    expect(activeAuditPass(few)).toBe(false);
  });
});
