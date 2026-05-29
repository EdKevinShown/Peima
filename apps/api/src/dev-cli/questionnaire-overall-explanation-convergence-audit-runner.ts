/**
 * Audit overallExplanation convergence over questionnaire answer combinations.
 *
 * Usage (from repo root, after api build):
 *   pnpm --filter @peima/api exec tsx src/dev-cli/questionnaire-overall-explanation-convergence-audit-runner.ts --mode=random --samples=50000
 *   pnpm --filter @peima/api exec tsx src/dev-cli/questionnaire-overall-explanation-convergence-audit-runner.ts --mode=greedy-targets --max=500000
 *   pnpm --filter @peima/api exec tsx src/dev-cli/questionnaire-overall-explanation-convergence-audit-runner.ts --mode=exhaustive --max=1000000
 *
 * Full 4^30 exhaustive is ~1.15e18 — always use --max unless you intend an overnight run.
 */
import {
  auditOverallExplanationConvergence,
  formatConvergenceReport,
  getCanonicalAnswerCombinationCount,
} from "../modules/questionnaire/questionnaire-overall-explanation-convergence-audit";

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function main(): void {
  const modeRaw = parseArg("mode") ?? "random";
  if (
    modeRaw !== "random" &&
    modeRaw !== "exhaustive" &&
    modeRaw !== "greedy-targets"
  ) {
    console.error("mode must be random | exhaustive | greedy-targets");
    process.exit(1);
  }
  const mode = modeRaw;
  const max = parseArg("max");
  const samples = parseArg("samples");
  const seed = parseArg("seed");

  const total = getCanonicalAnswerCombinationCount();
  console.log(`theoretical_combinations=${total.toString()}`);
  if (mode === "exhaustive" && !max) {
    console.warn(
      "WARN: exhaustive without --max will not finish in human time. Example: --max=1000000",
    );
  }

  const report = auditOverallExplanationConvergence({
    mode,
    maxSamples: max ? Number(max) : undefined,
    randomSamples: samples ? Number(samples) : 50_000,
    randomSeed: seed ? Number(seed) : 42,
  });

  console.log(formatConvergenceReport(report));

  if (report.invalidCount > 0) {
    process.exit(2);
  }
  if (report.instabilitySamples.length > 0) {
    process.exit(3);
  }
}

main();
