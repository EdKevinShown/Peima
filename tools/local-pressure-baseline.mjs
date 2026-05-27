#!/usr/bin/env node
/**
 * Local pressure baseline for key read endpoints.
 *
 * Usage:
 *   node tools/local-pressure-baseline.mjs --baseUrl http://127.0.0.1:3000 --token <jwt> --userId <id>
 *
 * Optional:
 *   --concurrency 20
 *   --requests 200
 *   --path status|result|preview
 */

function parseArgs(argv) {
  const out = {
    baseUrl: "http://127.0.0.1:3000",
    token: "",
    userId: "",
    concurrency: 20,
    requests: 200,
    path: "all",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === "--baseUrl" && val) out.baseUrl = val.replace(/\/$/, "");
    if (key === "--token" && val) out.token = val;
    if (key === "--userId" && val) out.userId = val;
    if (key === "--concurrency" && val) out.concurrency = Number(val);
    if (key === "--requests" && val) out.requests = Number(val);
    if (key === "--path" && val) out.path = val;
    if (key.startsWith("--") && val) i += 1;
  }
  if (!out.token || !out.userId) {
    throw new Error("--token and --userId are required");
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function pathsFor(userId, which) {
  const all = {
    status: `/matching/status/${userId}`,
    result: `/matching/result/${userId}`,
    preview: `/preview-pool/user/${userId}/latest`,
  };
  if (which === "all") return Object.values(all);
  if (which in all) return [all[which]];
  throw new Error(`unknown path: ${which}`);
}

async function oneRequest(baseUrl, token, route) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}${route}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ms = Date.now() - started;
  return { ok: res.ok, status: res.status, ms, route };
}

async function runPool(baseUrl, token, routes, concurrency, total) {
  let cursor = 0;
  const results = [];

  async function worker() {
    while (cursor < total) {
      const i = cursor;
      cursor += 1;
      const route = routes[i % routes.length];
      results.push(await oneRequest(baseUrl, token, route));
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );
  return results;
}

function summarize(results) {
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const byStatus = {};
  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  return {
    total: results.length,
    ok,
    fail,
    successRate: results.length ? (ok / results.length) * 100 : 0,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    maxMs: latencies.length ? latencies[latencies.length - 1] : 0,
    byStatus,
  };
}

async function main() {
  const cfg = parseArgs(process.argv);
  const routes = pathsFor(cfg.userId, cfg.path);
  const results = await runPool(
    cfg.baseUrl,
    cfg.token,
    routes,
    cfg.concurrency,
    cfg.requests,
  );
  const summary = summarize(results);
  console.log(
    JSON.stringify(
      {
        baseUrl: cfg.baseUrl,
        routes,
        concurrency: cfg.concurrency,
        requests: cfg.requests,
        ...summary,
      },
      null,
      2,
    ),
  );
  if (summary.fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
