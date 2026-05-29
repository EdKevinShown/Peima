#!/usr/bin/env node
/**
 * Quick API smoke against a running dev server (default http://127.0.0.1:3000).
 * Signs JWT with JWT_SECRET from monorepo .env unless --token is passed.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

loadEnvFile(resolve(repoRoot, ".env"));

function parseArgs(argv) {
  const out = {
    baseUrl: "http://127.0.0.1:3000",
    userId: "cmpi3k2dz000tvhdw5hgidlvv",
    token: "",
    runPressure: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === "--baseUrl" && val) out.baseUrl = val.replace(/\/$/, "");
    if (key === "--userId" && val) out.userId = val;
    if (key === "--token" && val) out.token = val;
    if (key === "--no-pressure") out.runPressure = false;
    if (key.startsWith("--") && val) i += 1;
  }
  return out;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Minimal HS256 JWT for smoke (no external deps). */
function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const head = base64url(JSON.stringify(header));
  const body = base64url(JSON.stringify(payload));
  const data = `${head}.${body}`;
  const sig = createHmac("sha256", secret).update(data).digest();
  return `${data}.${base64url(sig)}`;
}

async function apiGet(baseUrl, token, path) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, ms: Date.now() - started, body };
}

async function main() {
  const cfg = parseArgs(process.argv);
  const secret = process.env.JWT_SECRET;
  if (!cfg.token) {
    if (!secret) {
      throw new Error("JWT_SECRET missing in .env; pass --token");
    }
    const now = Math.floor(Date.now() / 1000);
    cfg.token = signJwt(
      { sub: cfg.userId, phone: "+8613800000000", iat: now, exp: now + 3600 },
      secret,
    );
  }

  const report = {
    baseUrl: cfg.baseUrl,
    userId: cfg.userId,
    at: new Date().toISOString(),
    checks: {},
  };

  const caps = await apiGet(
    cfg.baseUrl,
    cfg.token,
    "/test/matching/capabilities",
  );
  report.checks.capabilities = {
    status: caps.status,
    body: caps.body,
    pass:
      caps.ok &&
      caps.body?.testBatchMatchTrigger === true &&
      caps.body?.testPreviewPoolSeed === true,
  };

  const status = await apiGet(
    cfg.baseUrl,
    cfg.token,
    `/matching/status/${cfg.userId}`,
  );
  report.checks.matchingStatus = {
    status: status.status,
    body: status.body,
    pass: status.ok && ["ready", "waiting", "processing", "not_queued"].includes(status.body?.status),
  };

  const result = await apiGet(
    cfg.baseUrl,
    cfg.token,
    `/matching/result/${cfg.userId}`,
  );
  const hasRow = typeof result.body?.candidateUserId === "string";
  report.checks.matchingResult = {
    status: result.status,
    hasCandidate: hasRow,
    finalScore: result.body?.finalScore ?? null,
    pass: result.ok && hasRow,
  };

  const preview = await apiGet(
    cfg.baseUrl,
    cfg.token,
    `/preview-pool/user/${cfg.userId}/latest`,
  );
  report.checks.previewPoolLatest = {
    status: preview.status,
    itemCount: Array.isArray(preview.body?.items) ? preview.body.items.length : 0,
    poolStatus: preview.body?.previewPool?.status ?? null,
    pass: preview.ok && (preview.body?.items?.length ?? 0) >= 1,
  };

  report.allPass = Object.values(report.checks).every((c) => c.pass);

  if (cfg.runPressure) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const script = resolve(repoRoot, "tools/local-pressure-baseline.mjs");
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          script,
          "--baseUrl",
          cfg.baseUrl,
          "--token",
          cfg.token,
          "--userId",
          cfg.userId,
          "--concurrency",
          "20",
          "--requests",
          "120",
          "--path",
          "all",
        ],
        { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024 },
      );
      report.pressure = JSON.parse(stdout);
      report.pressurePass =
        report.pressure.fail === 0 && report.pressure.successRate >= 99;
      report.allPass = report.allPass && report.pressurePass;
    } catch (e) {
      report.pressure = { error: String(e?.message ?? e) };
      report.pressurePass = false;
      report.allPass = false;
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.allPass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
