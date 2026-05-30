/**
 * Reports which code paths are active for matching + AI modules given current process.env.
 * Does not print secrets. Load .env from repo root when run via package script.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readM5RrmTop2DisplayEnv } from "../modules/matching/m5-rrm-top2-display-env";
import { readM6RrmV2SelectorDisplayEnv } from "../modules/matching/matching-m6-rrm-v2-selector-display-env";
import { readPairwiseFinalizeEnv } from "../modules/matching/pairwise-finalize-env";
import { readP76ReadPathEnv } from "../modules/matching/p76-read-path-env";
import { readP710R10OldPhotoWriterShutdownReadEnv } from "../modules/matching/p710-r10-safe-fallback-final-policy";
import { readM5RrmTop2MetaWriteEnabled } from "../modules/matching/matching-rrm-top2-display-meta-write-env";
import {
  isPreviewPoolAutoEnsureEnabled,
  isPreviewPoolAutoEnsureSyntheticFallbackEnabled,
} from "../modules/preview-pool/preview-pool-auto-ensure.policy";
import { SummaryAiConfigService } from "../modules/summary-ai/summary-ai.config.service";
import { MatchExplanationAiConfigService } from "../modules/match-explanation-ai/match-explanation-ai.config.service";
import { MatchReviewAiConfigService } from "../modules/match-review-ai/match-review-ai.config.service";
import { CopilotAiConfigService } from "../modules/copilot/copilot-ai.config.service";
import { InteractionSimulationLiteConfigService } from "../modules/interaction-simulation-lite/interaction-simulation-lite.config.service";
import { AiSimulationV1ConfigService } from "../modules/ai-simulation-v1/ai-simulation-v1.config.service";
import { canUserWriteMatchResultViaTestAllowlist } from "../modules/test/test-match.policy";

const repoRoot = resolve(__dirname, "../../../..");
config({ path: resolve(repoRoot, ".env") });

function truthy(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function reciprocalEnabled(): boolean {
  const v = process.env.PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  return v === "1" || v === "true" || v === "yes";
}

type Row = {
  area: string;
  primaryExpected: string;
  activePath: string;
  status: "primary" | "fallback" | "blocked" | "shadow_only" | "warn";
  note: string;
};

const rows: Row[] = [];

// --- Worker batch match ---
const writerShutdown = readP710R10OldPhotoWriterShutdownReadEnv();
const globalWriterCanWrite = !writerShutdown.writerWritesBlocked;
const testWriterIds = (process.env.PEIMA_TEST_MATCH_RESULT_WRITER_USER_IDS ?? "")
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);
const allowlistSample = testWriterIds.slice(0, 3);
const allowlistCanWriteCount = allowlistSample.filter((id) =>
  canUserWriteMatchResultViaTestAllowlist(id),
).length;
const anyAllowlistCanWrite = allowlistCanWriteCount > 0;
rows.push({
  area: "匹配写入 (batch-match)",
  primaryExpected: "computeFinalScoreV1 选 Top1 + matchInsights(V2 shadow)",
  activePath: anyAllowlistCanWrite
    ? `白名单用户可写 (${allowlistCanWriteCount}/${allowlistSample.length} sampled)`
    : globalWriterCanWrite
      ? "writeLegacyPhotoMatchResult (writer 全局允许)"
      : `全局 blocked (shutdown=${writerShutdown.shutdownEnabled})`,
  status: anyAllowlistCanWrite || globalWriterCanWrite ? "primary" : "blocked",
  note:
    "全局 shutdown 默认 ON；本地测试靠 PEIMA_TEST_MATCH_RESULT_WRITER_* 白名单。legacy 函数名≠旧算法。",
});

rows.push({
  area: "匹配互惠可见",
  primaryExpected: "writeReciprocalMatchResultIfAbsent",
  activePath: reciprocalEnabled() ? "reciprocal ON" : "reciprocal OFF (fallback: 仅 outbound)",
  status: reciprocalEnabled() ? "primary" : "fallback",
  note: "PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED",
});

const m6Shadow = process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED === "1";
const m6Dry = process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED === "1";
rows.push({
  area: "Worker 计分增强",
  primaryExpected: "V1 finalScore 决定 batch Top1",
  activePath: `V1 primary${m6Shadow ? " + RRM decision shadow" : ""}${m6Dry ? " + bounded dry-run" : ""}`,
  status: "primary",
  note: "V2/RRM 在 matchInsights 中为 shadow/dry-run，不改 batch 写入候选",
});

// --- GET display ---
const rrmRead = readM5RrmTop2DisplayEnv();
const rrmMetaWrite = readM5RrmTop2MetaWriteEnabled();
const m6Display = readM6RrmV2SelectorDisplayEnv();
const pairwise = readPairwiseFinalizeEnv();
const p76 = readP76ReadPathEnv();

let displayChain = "match_result_original (batch Top1)";
if (rrmRead.enabled && rrmMetaWrite) {
  displayChain = "rrm_top2_bounded_selector (需 frozen meta)";
} else if (rrmRead.enabled && !rrmMetaWrite) {
  displayChain =
    "尝试 RRM Top2 → 无 meta 则下落 → " +
    (pairwise.enabledFlag && pairwise.mode === "enabled"
      ? "pairwise_finalize"
      : "match_result_original");
}
if (m6Display.enabled) {
  displayChain = "rrm_top2_v2_selector_readonly (flag ON) → " + displayChain;
}
rows.push({
  area: "GET /matching/result 展示解析",
  primaryExpected:
    pairwise.enabledFlag && pairwise.mode === "enabled"
      ? "pairwise_finalize 或 RRM Top2 (有 meta 时)"
      : "match_result_original",
  activePath: displayChain,
  status:
    rrmRead.enabled && !rrmMetaWrite && pairwise.enabledFlag
      ? "warn"
      : pairwise.enabledFlag && pairwise.mode === "enabled"
        ? "primary"
        : "primary",
  note:
    rrmRead.enabled && !rrmMetaWrite
      ? "M5_RRM_TOP2_ENABLED=1 但 META_WRITE=0 → RRM 展示层常回落到 pairwise/original"
      : "见 matching-result-display.ts 优先级",
});

rows.push({
  area: "P76 读路径覆盖",
  primaryExpected: "基线展示 (多数用户)",
  activePath: p76.enabled
    ? `P76 overlay (allowlist ${p76.viewerAllowlist.length} ids)`
    : "baseline only",
  status: p76.enabled ? "primary" : "primary",
  note: `safeFallback=${p76.safeFallbackEnabled}`,
});

const p710 = readP710R10OldPhotoWriterShutdownReadEnv();
rows.push({
  area: "P710 旧 writer",
  primaryExpected: "shutdown 阻止旧路径写库",
  activePath: p710.writerWritesBlocked ? "shutdown ON (expected)" : "旧 writer 可能可写",
  status: p710.writerWritesBlocked ? "primary" : "warn",
  note: "",
});

// --- Preview pool ---
rows.push({
  area: "预览池",
  primaryExpected: "DB 池 + 懒建",
  activePath: isPreviewPoolAutoEnsureEnabled()
    ? `auto-ensure ON, synthetic=${isPreviewPoolAutoEnsureSyntheticFallbackEnabled()}`
    : "auto-ensure OFF",
  status: isPreviewPoolAutoEnsureEnabled() ? "primary" : "fallback",
  note: "",
});

// --- AI ---
const summaryCfg = new SummaryAiConfigService();
const matchExpCfg = new MatchExplanationAiConfigService();
const matchReviewCfg = new MatchReviewAiConfigService();
const copilotCfg = new CopilotAiConfigService();
const interactCfg = new InteractionSimulationLiteConfigService();
const simCfg = new AiSimulationV1ConfigService();

function aiRow(
  area: string,
  enabled: boolean,
  hasKey: boolean,
  primaryLabel: string,
  fallbackLabel: string,
): void {
  let activePath = fallbackLabel;
  let status: Row["status"] = "fallback";
  if (enabled && hasKey) {
    activePath = primaryLabel;
    status = "primary";
  } else if (enabled && !hasKey) {
    activePath = `${fallbackLabel} (enabled 但缺 key)`;
    status = "warn";
  }
  rows.push({ area, primaryExpected: primaryLabel, activePath, status, note: "" });
}

aiRow(
  "Summary AI",
  summaryCfg.summaryAiEnabled,
  Boolean(summaryCfg.apiKey),
  "summary_model_*",
  "summary_rule_based",
);
aiRow(
  "Match Explanation AI",
  matchExpCfg.matchExplanationAiEnabled,
  Boolean(matchExpCfg.apiKey),
  "match_explanation_model_*",
  "match_explanation_rule_based",
);
aiRow(
  "Match Review AI",
  matchReviewCfg.matchReviewAiEnabled,
  Boolean(matchReviewCfg.apiKey),
  "LLM review",
  "static/rule summary",
);
aiRow(
  "Copilot",
  copilotCfg.copilotEnabled,
  Boolean(copilotCfg.apiKey),
  "model_*",
  "rule / non-LLM",
);
aiRow(
  "Interaction Sim Lite",
  interactCfg.interactionSimulationLiteEnabled,
  Boolean(interactCfg.apiKey),
  "LLM",
  "interaction-lite-rule",
);
rows.push({
  area: "AI Simulation v1",
  primaryExpected: "队列 + worker",
  activePath: simCfg.aiSimulationV1Enabled
    ? truthy("AI_SIMULATION_V1_WORKER_ENABLED")
      ? "API enqueue + worker ON"
      : "API enqueue, worker OFF"
    : "disabled",
  status: simCfg.aiSimulationV1Enabled ? "primary" : "shadow_only",
  note: "",
});

rows.push({
  area: "Pairwise finalize (展示)",
  primaryExpected: "enabled 时覆盖 display",
  activePath: `enabled=${pairwise.enabledFlag} mode=${pairwise.mode}`,
  status:
    pairwise.enabledFlag && pairwise.mode === "enabled"
      ? "primary"
      : pairwise.enabledFlag
        ? "shadow_only"
        : "fallback",
  note: "不影响 batch 写入的 candidateUserId",
});

// Print
console.log("=== Peima runtime active path audit ===\n");
console.log(`env_file=${resolve(repoRoot, ".env")}`);
console.log(`NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}\n`);

const icons: Record<Row["status"], string> = {
  primary: "[OK primary]",
  fallback: "[!! fallback]",
  blocked: "[XX blocked]",
  shadow_only: "[-- shadow/off]",
  warn: "[?? warn]",
};

for (const r of rows) {
  console.log(`${icons[r.status]} ${r.area}`);
  console.log(`  expected: ${r.primaryExpected}`);
  console.log(`  active:   ${r.activePath}`);
  if (r.note) console.log(`  note:     ${r.note}`);
  console.log("");
}

const problems = rows.filter(
  (r) => r.status === "fallback" || r.status === "blocked" || r.status === "warn",
);
console.log("--- Summary ---");
console.log(`total=${rows.length} issues=${problems.length}`);
if (problems.length > 0) {
  console.log("\nItems needing attention:");
  for (const p of problems) {
    console.log(`  - ${p.area}: ${p.activePath}`);
  }
  process.exitCode = problems.some((p) => p.status === "blocked") ? 2 : 1;
} else {
  console.log("All checked paths match intended primary configuration.");
}
