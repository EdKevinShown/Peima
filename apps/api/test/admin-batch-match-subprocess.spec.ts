/**
 * M6.10-C5: API-triggered batch-match must not silently prefer stale worker dist over tsx src.
 */
import { join } from "node:path";
import { resolveBatchMatchSubprocessPlan } from "../src/modules/admin/admin.service";

describe("resolveBatchMatchSubprocessPlan (M6.10-C5)", () => {
  const root = join("C:", "repo");
  const nodePath = join("C:", "node", "node.exe");

  it("defaults to pnpm tsx batch-match even when dist exists flag is true", () => {
    const plan = resolveBatchMatchSubprocessPlan({
      monorepoRoot: root,
      nodeExecPath: nodePath,
      workerDistMainJsExists: true,
      env: {},
    });
    expect(plan.command).toBe("pnpm");
    expect(plan.args).toEqual(["--filter", "@peima/worker", "run", "batch-match"]);
    expect(plan.shell).toBe(true);
    expect(plan.cwd).toBe(root);
  });

  it("uses node dist when PEIMA_BATCH_MATCH_SUBPROCESS_USE_DIST=1 and dist exists", () => {
    const plan = resolveBatchMatchSubprocessPlan({
      monorepoRoot: root,
      nodeExecPath: nodePath,
      workerDistMainJsExists: true,
      env: { PEIMA_BATCH_MATCH_SUBPROCESS_USE_DIST: "1" },
    });
    expect(plan.command).toBe(nodePath);
    expect(plan.args).toEqual([join(root, "apps", "worker", "dist", "main.js"), "--batch-match"]);
    expect(plan.shell).toBe(false);
  });

  it("falls back to pnpm when USE_DIST is set but dist file is absent", () => {
    const plan = resolveBatchMatchSubprocessPlan({
      monorepoRoot: root,
      nodeExecPath: nodePath,
      workerDistMainJsExists: false,
      env: { PEIMA_BATCH_MATCH_SUBPROCESS_USE_DIST: "1" },
    });
    expect(plan.command).toBe("pnpm");
    expect(plan.shell).toBe(true);
  });
});
