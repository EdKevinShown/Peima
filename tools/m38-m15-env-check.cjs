/**
 * M3.8-M15: print pairwise-related .env keys without secret values.
 * Usage: node tools/m38-m15-env-check.cjs
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
let text = "";
try {
  text = fs.readFileSync(envPath, "utf8");
} catch {
  console.log("ENV_FILE: missing");
  process.exit(0);
}
/** @type {Record<string, string>} */
const m = {};
for (const line of text.split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i < 0) continue;
  const k = s.slice(0, i).trim();
  let v = s.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  m[k] = v;
}
const secret = (k) => ((m[k] || "").length > 0 ? "[configured]" : "[empty]");
const pub = (k) => (m[k] !== undefined ? String(m[k]).slice(0, 120) : "[missing]");
const keys = [
  "AI_PAIRWISE_DECISION_ENABLED",
  "AI_PAIRWISE_DECISION_WORKER_ENABLED",
  "AI_PAIRWISE_DECISION_API_KEY",
  "AI_PAIRWISE_DECISION_BASE_URL",
  "AI_PAIRWISE_DECISION_MODEL",
  "PAIRWISE_FINAL_MATCH_ENABLED",
  "PAIRWISE_FINAL_MATCH_MODE",
];
for (const k of keys) {
  if (k.includes("API_KEY")) console.log(`${k}: ${secret(k)}`);
  else console.log(`${k}: ${pub(k)}`);
}
