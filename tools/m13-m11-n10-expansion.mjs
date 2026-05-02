/**
 * M1.3-M11 — usableJobCount 8 → >=10 (repairable failed-reset and/or seed from real preview pools).
 *
 *   node --env-file=.env tools/m13-m11-n10-expansion.mjs
 *   node --env-file=.env tools/m13-m11-n10-expansion.mjs --jobIds=id1,id2
 *   node --env-file=.env tools/m13-m11-n10-expansion.mjs --poolIds=pool1,pool2
 *
 * Requires AI_SIMULATION_V1_TIMEOUT_MS >= 180000 in root `.env`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..");

function tryLoadMonorepoDotEnv() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(MONOREPO_ROOT, ".env");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!key || key.includes(" ")) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

tryLoadMonorepoDotEnv();

const impl = path.join(__dirname, "m13-m11-n10-expansion.impl.ts");
const args = ["--yes", "tsx", impl, ...process.argv.slice(2)];
const r = spawnSync("npx", args, {
  stdio: "inherit",
  cwd: MONOREPO_ROOT,
  env: process.env,
  shell: true,
});
if (r.error) {
  console.error(r.error instanceof Error ? r.error.message : String(r.error));
  process.exit(1);
}
process.exit(r.status === null ? 1 : r.status ?? 1);
