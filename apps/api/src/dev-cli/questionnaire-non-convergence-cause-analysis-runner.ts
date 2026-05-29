import {
  analyzeNonConvergenceCauses,
  formatNonConvergenceCauseReport,
} from "../modules/questionnaire/questionnaire-non-convergence-cause-analysis";

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const samples = Number(parseArg("samples") ?? "500000");
const seed = Number(parseArg("seed") ?? "20260528");

const report = analyzeNonConvergenceCauses({ randomSamples: samples, randomSeed: seed });
console.log(formatNonConvergenceCauseReport(report));
