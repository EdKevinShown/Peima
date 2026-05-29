import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * M1.3 aggregate pure logic lives in `tools/lib/m13-calibration-aggregate.mjs` (ESM).
 * Jest/ts-jest does not reliably resolve dynamic `import(file://…/tools/...mjs)` from this package,
 * so we gate the suite via Node's native test runner (same assertions as tools/m13-calibration-aggregate.test.mjs).
 */
describe("m13-calibration-aggregate (node --test tools/)", () => {
  it("runs tools/m13-calibration-aggregate.test.mjs successfully", () => {
    const testFile = path.join(__dirname, "../../../tools/m13-calibration-aggregate.test.mjs");
    execFileSync(process.execPath, ["--test", testFile], {
      stdio: "pipe",
      encoding: "utf8",
    });
  });
});
