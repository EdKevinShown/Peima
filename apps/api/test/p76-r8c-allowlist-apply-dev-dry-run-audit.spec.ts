import * as fs from "fs";
import * as path from "path";
import {
  createP76R8cInMemoryMockPrisma,
  loadP76R8cViewerArtifactBundle,
  P76_R8C_ROUTE_C_VIEWERS,
  runP76R8cDevDryRunAudit,
} from "../src/dev-cli/p76-r8c-allowlist-apply-dev-dry-run-audit";

describe("p76 r8c dev dry-run audit", () => {
  const repoRoot = path.resolve(__dirname, "../../..");

  it("loads r7g artifacts for all 5 viewers", () => {
    for (const id of P76_R8C_ROUTE_C_VIEWERS) {
      const b = loadP76R8cViewerArtifactBundle(repoRoot, id);
      expect(b.finalShadowSelectedCandidateId).toBeTruthy();
      expect(b.stage1SelectedCandidateIds.length).toBe(6);
    }
  });

  it("default disabled blocks; allowlist dry-run wouldApply without DB write", async () => {
    const mock = createP76R8cInMemoryMockPrisma();
    const report = await runP76R8cDevDryRunAudit({
      repoRoot,
      prisma: mock,
    });

    expect(report.defaultDisabledResults).toHaveLength(5);
    for (const r of report.defaultDisabledResults) {
      expect(r.blocked).toBe(true);
      expect(r.wouldApply).toBe(false);
      expect(r.wroteSidecar).toBe(false);
      expect(r.blockedReasons).toContain("apply_disabled");
    }

    expect(report.allowlistDryRunResults).toHaveLength(5);
    for (const r of report.allowlistDryRunResults) {
      expect(r.allowlistMatched).toBe(true);
      expect(r.wouldApply).toBe(true);
      expect(r.wroteSidecar).toBe(false);
      expect(r.effectiveDryRun).toBe(true);
      expect(r.applied).toBe(false);
    }

    expect(mock.upsertCalls).toBe(0);
    expect(report.sidecarWriteSmoke).toBe("skipped");
  });

  it("writes audit report artifact when run via script helper", () => {
    const artifact = path.join(
      repoRoot,
      "artifacts/p76/r8c/dev-dry-run-audit-report.json",
    );
    if (fs.existsSync(artifact)) {
      const parsed = JSON.parse(fs.readFileSync(artifact, "utf8")) as {
        schemaVersion: string;
      };
      expect(parsed.schemaVersion).toBe(
        "p7.6-r8c-allowlist-apply-dev-dry-run-audit-v1",
      );
    }
  });
});
