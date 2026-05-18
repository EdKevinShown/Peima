/**
 * P7.7-r2 — validate canonical writer shadow audit artifact (read-only).
 * Usage: node scripts/p77-r2-local-smoke-artifact-check.mjs <path-to-json>
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node p77-r2-local-smoke-artifact-check.mjs <audit-json-path>");
  process.exit(2);
}

const raw = readFileSync(path, "utf8");
const j = JSON.parse(raw);

if (j.sourceType !== "p76_canonical_writer_shadow_audit") {
  throw new Error(`expected sourceType p76_canonical_writer_shadow_audit, got ${j.sourceType}`);
}
if (j.sourceVersion !== "p7.10-r6a-canonical-writer-shadow-audit-v1") {
  throw new Error(`unexpected sourceVersion ${j.sourceVersion}`);
}
if (j.mode !== "dev_audit") {
  throw new Error(`expected mode dev_audit, got ${j.mode}`);
}
if (j.appliedToMatchResultCount !== 0) {
  throw new Error("appliedToMatchResultCount must be 0");
}

const text = JSON.stringify(j);
const forbidden = /rawPrompt|transcript|imageFeatures|rawImage|fullPrompt/;
if (forbidden.test(text)) {
  throw new Error("forbidden sensitive key found in audit JSON");
}

for (const row of j.rows ?? []) {
  if (row.shadow?.appliedToMatchResult !== false) {
    throw new Error(`row ${row.matchResultId} shadow.appliedToMatchResult not false`);
  }
}

console.log(
  JSON.stringify({
    ok: true,
    totalRows: j.totalRows,
    eligibleCount: j.eligibleCount,
    blockedCount: j.blockedCount,
    wouldChangeCandidateCount: j.wouldChangeCandidateCount,
    appliedToMatchResultCount: j.appliedToMatchResultCount,
    reasonCounts: j.reasonCounts,
    scoreDeltaBandCounts: j.scoreDeltaBandCounts,
    generatedAt: j.generatedAt,
  }),
);
