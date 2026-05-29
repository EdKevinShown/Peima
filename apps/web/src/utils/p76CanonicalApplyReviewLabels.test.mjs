import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ALLOWED_ACTION_LABELS,
  FORBIDDEN_ACTION_LABELS,
  FORBIDDEN_UI_COPY,
  canApplyTone,
  getBlockedReasonLabel,
  getCanApplySummaryLabel,
  getNoWriteSafetyLabel,
  getRollbackSnapshotDryRunBadge,
  getRollbackTokenDisplay,
  getSnapshotReadyLabel,
  isAllowedActionLabel,
  isRollbackSnapshotApiUnavailable,
  isForbiddenActionLabel,
  isForbiddenUiCopy,
  isNoWriteSafetyVerified,
} from "./p76CanonicalApplyReviewLabels.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const applyReviewPagePath = join(
  __dirname,
  "../pages/P76CanonicalSidecarApplyReviewPage.jsx",
);

test("canApply=false uses blocked tone", () => {
  assert.equal(canApplyTone(false), "blocked");
  assert.equal(getCanApplySummaryLabel(false, ["gate12_not_final"]), "Preview only — apply blocked");
});

test("canApply=true still does not imply production ready copy", () => {
  assert.equal(canApplyTone(true), "warning");
  const summary = getCanApplySummaryLabel(true, []);
  assert.match(summary, /hidden until/i);
  assert.equal(isForbiddenUiCopy("Production apply ready"), true);
});

test("no-write safety verified only when all flags false", () => {
  const safe = {
    writesDb: false,
    writesMatchResult: false,
    writesFinalScore: false,
    triggersWorker: false,
    changesPercent: false,
    productionRollout: false,
  };
  assert.equal(isNoWriteSafetyVerified(safe), true);
  assert.equal(getNoWriteSafetyLabel(safe), "No-write verified");
  assert.equal(isNoWriteSafetyVerified({ ...safe, writesDb: true }), false);
});

test("rollback token always redacted", () => {
  assert.equal(getRollbackTokenDisplay("redacted"), "redacted");
  assert.equal(getRollbackTokenDisplay("secret-token-abc"), "redacted");
  assert.equal(getRollbackTokenDisplay(null), "redacted");
});

test("rollback snapshot ready shows dry-run badge", () => {
  assert.equal(getRollbackSnapshotDryRunBadge(), "Dry-run snapshot");
  assert.equal(getSnapshotReadyLabel(true), "Snapshot ready (dry-run)");
  assert.equal(getSnapshotReadyLabel(false), "Snapshot blocked (dry-run)");
});

test("snapshot blockedReasons labels", () => {
  assert.equal(getBlockedReasonLabel("missing_current_match_result"), "MatchResult missing (snapshot)");
  assert.equal(getBlockedReasonLabel("preview_not_ready"), "Apply preview not ready");
});

test("rollback snapshot API unavailable detection", () => {
  assert.equal(isRollbackSnapshotApiUnavailable("无权限访问"), true);
  assert.equal(isRollbackSnapshotApiUnavailable("登录已失效"), true);
  assert.equal(isRollbackSnapshotApiUnavailable(""), false);
});

test("gate blocker labels", () => {
  assert.equal(getBlockedReasonLabel("gate12_not_final"), "Blocked by Gate 12");
  assert.equal(getBlockedReasonLabel("grafana_blocked"), "Grafana pending");
  assert.equal(getBlockedReasonLabel("production_write_blocked"), "Production write blocked");
});

test("Apply / Rollback / Promote not in allowed action list", () => {
  for (const label of FORBIDDEN_ACTION_LABELS) {
    assert.equal(isForbiddenActionLabel(label), true);
    assert.equal(isAllowedActionLabel(label), false);
  }
  for (const label of ALLOWED_ACTION_LABELS) {
    assert.equal(isAllowedActionLabel(label), true);
    assert.equal(isForbiddenActionLabel(label), false);
  }
});

test("forbidden UI copy list is stable", () => {
  assert.ok(FORBIDDEN_UI_COPY.includes("MatchResult updated"));
  assert.ok(FORBIDDEN_UI_COPY.length >= 5);
});

test("apply review page does not render Apply / Rollback / Promote buttons", () => {
  const source = readFileSync(applyReviewPagePath, "utf8");
  assert.doesNotMatch(source, /<button[^>]*>[\s\S]*?Apply[\s\S]*?<\/button>/i);
  assert.doesNotMatch(source, /<button[^>]*>[\s\S]*?Rollback[\s\S]*?<\/button>/i);
  assert.doesNotMatch(source, /<button[^>]*>[\s\S]*?Promote[\s\S]*?<\/button>/i);
  assert.doesNotMatch(source, /\bPOST\b.*apply/i);
  assert.doesNotMatch(source, /method:\s*["']POST["']/i);
  assert.match(source, /getP76CanonicalSidecarApplyPreview/);
  assert.match(source, /getP76CanonicalSidecarRollbackSnapshotPreview/);
  assert.match(source, /Preview only/i);
  assert.match(source, /getRollbackSnapshotDryRunBadge/);
});
