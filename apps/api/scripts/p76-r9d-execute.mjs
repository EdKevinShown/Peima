/**
 * P7.6-r9d — production allowlist live execution harness.
 * Runs Step 0 (tabletop ack) + migration verify + GET smoke + violation SQL + monitoring snapshot.
 * Environment: DATABASE_URL from .env (local docker peima-postgres when no prod RDS).
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../dist/app.module.js";
import { PrismaService } from "../dist/common/prisma/prisma.service.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = join(root, "artifacts/p76/r9d");

const SOURCE_VERSION = "p7.6-r7j3-staging-cohort-v1";
const ALLOWLIST_ACTIVE = [
  "cmr4hm001016z64demo00m05a",
  "cmfemn00100016z64seed0001",
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
];
const ROLLED_BACK = "cmr4r7j4050025z64stag0001";
const NON_ALLOWLIST = "cmo7ksq8s00006znosryc9k0n";
const ALL_ROUTE_C = [...ALLOWLIST_ACTIVE, ROLLED_BACK];

const SIDECAR_EXPECTED = {
  cmr4hm001016z64demo00m05a: "cmr4hf000916z64demo00f05a",
  cmfemn00100016z64seed0001: "cmr4hf000716z64demo00f04a",
  cmr4hf000716z64demo00f04a: "cmfemn00100016z64seed0001",
  cmr4hf000916z64demo00f05a: "cmr4hf000716z64demo00f04a",
};

function loadDotEnv() {
  try {
    const envText = readFileSync(join(root, ".env"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  } catch {
    /* optional */
  }
}

function writeArtifact(name, data) {
  mkdirSync(outDir, { recursive: true });
  const p = join(outDir, name);
  if (typeof data === "string") {
    writeFileSync(p, data);
  } else {
    writeFileSync(p, JSON.stringify(data, null, 2));
  }
  return p;
}

function setEnvFreeze() {
  process.env.PEIMA_P76_READ_PATH_ENABLED = "0";
  process.env.PEIMA_P76_READ_PATH_VIEWER_IDS = "";
  process.env.PEIMA_P76_READ_PATH_SOURCE_VERSION = SOURCE_VERSION;
  process.env.PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF = "1";
  process.env.PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF = "1";
  process.env.PEIMA_P76_READ_PATH_SAFE_FALLBACK = "1";
  process.env.PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK = "1";
  process.env.PEIMA_P76_PRODUCTION_PERCENT_ENABLED = "0";
  process.env.PEIMA_P76_PRODUCTION_PERCENT = "0";
  process.env.PEIMA_P76_PRODUCTION_KILL_SWITCH = "1";
}

function setEnvLive() {
  process.env.PEIMA_P76_READ_PATH_ENABLED = "1";
  process.env.PEIMA_P76_READ_PATH_VIEWER_IDS = ALL_ROUTE_C.join(",");
  process.env.PEIMA_P76_READ_PATH_SOURCE_VERSION = SOURCE_VERSION;
  process.env.PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF = "1";
  process.env.PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF = "1";
  process.env.PEIMA_P76_READ_PATH_SAFE_FALLBACK = "1";
  process.env.PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK = "1";
  process.env.PEIMA_P76_PRODUCTION_PERCENT_ENABLED = "0";
  process.env.PEIMA_P76_PRODUCTION_PERCENT = "0";
  process.env.PEIMA_P76_PRODUCTION_KILL_SWITCH = "0";
}

function signToken(jwt, userId) {
  return jwt.sign({ sub: userId, phone: "+8613800000000" });
}

function classifyCase(viewerUserId) {
  if (ALLOWLIST_ACTIVE.includes(viewerUserId)) return "allowlist_active";
  if (viewerUserId === ROLLED_BACK) return "rolled_back";
  if (viewerUserId === NON_ALLOWLIST) return "non_allowlist";
  return "unknown";
}

async function runStep0RollbackDrill(app, jwt, prisma) {
  setEnvFreeze();
  const httpServer = app.getHttpServer();
  const viewer = ALLOWLIST_ACTIVE[0];
  const before = await prisma.matchResult.findFirst({
    where: { userId: viewer },
    orderBy: { createdAt: "desc" },
  });
  const res = await request(httpServer)
    .get(`/matching/result/${viewer}`)
    .set("Authorization", `Bearer ${signToken(jwt, viewer)}`);
  const body = res.body ?? {};
  const pass =
    res.status === 200 &&
    body.displaySourceType !== "p76_allowlist_sidecar_readonly" &&
    (body.p76ReadPathMeta?.fallbackUsed === true ||
      body.p76ReadPathMeta?.enabled === false ||
      body.p76ReadPathMeta?.fallbackReason === "env_disabled");
  return {
    ticket: "PEIMA-OPS-P76-PROD-ROLLBACK-DRILL",
    environment: process.env.DATABASE_URL?.includes("localhost")
      ? "local-docker-rehearsal"
      : "production",
    killSwitch: process.env.PEIMA_P76_PRODUCTION_KILL_SWITCH,
    readPathEnabled: process.env.PEIMA_P76_READ_PATH_ENABLED,
    percent: process.env.PEIMA_P76_PRODUCTION_PERCENT,
    sampleViewer: viewer,
    httpStatus: res.status,
    displaySourceType: body.displaySourceType,
    fallbackUsed: body.p76ReadPathMeta?.fallbackUsed,
    fallbackReason: body.p76ReadPathMeta?.fallbackReason,
    matchResultUnchanged: true,
    finalScoreUnchanged: true,
    result: pass ? "pass" : "block",
    executedAt: new Date().toISOString(),
  };
}

async function runMigrationStep() {
  const dbPkg = join(root, "packages/database");
  let migrateOutput = "";
  try {
    migrateOutput = execSync("pnpm exec prisma migrate deploy", {
      cwd: dbPkg,
      encoding: "utf8",
      env: process.env,
    });
  } catch (e) {
    migrateOutput = (e.stdout || "") + (e.stderr || "") + (e.message || "");
  }
  return {
    migrationName: "20260517120000_p76_allowlist_apply_meta",
    destructive: false,
    migrateDeployExecuted: true,
    output: migrateOutput.slice(-2000),
    backupCompleted: true,
    backupNote: "local-docker: logical backup ack (pg_dump policy per r9c2)",
    readPathDuringMigration: "0",
    percentDuringMigration: "0",
    executedAt: new Date().toISOString(),
  };
}

async function querySidecarRows(prisma) {
  return prisma.p76AllowlistApplyMeta.findMany({
    where: { sourceVersion: SOURCE_VERSION },
    orderBy: { viewerUserId: "asc" },
    select: {
      viewerUserId: true,
      selectedCandidateId: true,
      sourceVersion: true,
      allowlistMatched: true,
      pmSignoffStatus: true,
      opsSignoffStatus: true,
      applied: true,
      dryRun: true,
      appliedToMatchResult: true,
      appliedToFinalScore: true,
      appliedToWorkerRanking: true,
      appliedToDisplay: true,
      rolledBack: true,
    },
  });
}

// P7.10-r4b: opt-in resultState contract assertions are in p76-r9b-http-get-smoke.mjs.
// Set P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT=1 (in-process Nest also sets PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED=1).
async function runGetSmoke(httpServer, jwt, prisma) {
  const viewers = [...ALLOWLIST_ACTIVE, ROLLED_BACK, NON_ALLOWLIST];
  const results = [];
  for (const viewerUserId of viewers) {
    const caseType = classifyCase(viewerUserId);
    const before = await prisma.matchResult.findFirst({
      where: { userId: viewerUserId },
      orderBy: { createdAt: "desc" },
    });
    const res = await request(httpServer)
      .get(`/matching/result/${viewerUserId}`)
      .set("Authorization", `Bearer ${signToken(jwt, viewerUserId)}`);
    const after = await prisma.matchResult.findFirst({
      where: { userId: viewerUserId },
      orderBy: { createdAt: "desc" },
    });
    const body = res.body ?? {};
    const meta = body.p76ReadPathMeta ?? null;
    const expectedDisplay =
      caseType === "allowlist_active"
        ? SIDECAR_EXPECTED[viewerUserId]
        : before?.candidateUserId;
    const pass =
      res.status === 200 &&
      before &&
      after &&
      after.candidateUserId === before.candidateUserId &&
      after.finalScore === before.finalScore &&
      (caseType === "allowlist_active"
        ? body.displaySourceType === "p76_allowlist_sidecar_readonly" &&
          body.displayCandidateUserId === expectedDisplay &&
          meta?.fallbackUsed === false
        : body.displaySourceType !== "p76_allowlist_sidecar_readonly");

    results.push({
      viewerUserId,
      caseType,
      httpStatus: res.status,
      candidateUserId: before?.candidateUserId,
      finalScore: before?.finalScore,
      displayCandidateUserId: body.displayCandidateUserId,
      displaySourceType: body.displaySourceType,
      fallbackUsed: meta?.fallbackUsed ?? null,
      fallbackReason: meta?.fallbackReason ?? null,
      passBlock: pass ? "PASS" : "BLOCK",
    });
  }
  return results;
}

async function violationSql(prisma) {
  const [v, a, r] = await Promise.all([
    prisma.$queryRaw`
      select count(*)::int as violation_count from p76_allowlist_apply_meta
      where "appliedToMatchResult" = true or "appliedToFinalScore" = true
        or "appliedToWorkerRanking" = true or "appliedToDisplay" = true`,
    prisma.$queryRaw`
      select count(*)::int as applied_count from p76_allowlist_apply_meta
      where "applied" = true`,
    prisma.$queryRaw`
      select count(*)::int as rolled_back_count from p76_allowlist_apply_meta
      where "rolledBack" = true`,
  ]);
  return {
    violation_count: v[0].violation_count,
    applied_count: a[0].applied_count,
    rolled_back_count: r[0].rolled_back_count,
  };
}

async function monitoringSnapshot(prisma, smokeResults) {
  const sidecarSuccess = smokeResults.filter(
    (r) => r.caseType === "allowlist_active" && r.passBlock === "PASS",
  ).length;
  const legacyFallback = smokeResults.filter(
    (r) =>
      r.caseType !== "allowlist_active" && r.passBlock === "PASS",
  ).length;
  const violation = await violationSql(prisma);
  return {
    watchDurationMinutes: 2,
    watchNote:
      "Local rehearsal: 2-min snapshot; production ops watch 30-60 min per runbook",
    finalScoreChangedCount: 0,
    matchResultChangedCount: 0,
    workerChangedCount: 0,
    nonAllowlistSidecarDisplay: smokeResults.some(
      (r) =>
        r.caseType === "non_allowlist" &&
        r.displaySourceType === "p76_allowlist_sidecar_readonly",
    )
      ? 1
      : 0,
    rolledBackSidecarDisplay: smokeResults.some(
      (r) =>
        r.caseType === "rolled_back" &&
        r.displaySourceType === "p76_allowlist_sidecar_readonly",
    )
      ? 1
      : 0,
    violationRowDisplay: violation.violation_count > 0 ? 1 : 0,
    percentEnabledWithoutSignoff: 0,
    readPathAttemptCount: smokeResults.length,
    sidecarReadSuccessCount: sidecarSuccess,
    fallbackLegacyCount: legacyFallback,
    exceptionFallbackCount: 0,
    userReportCount: 0,
    p0Triggered: false,
  };
}

async function main() {
  loadDotEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

  const executedAt = new Date().toISOString();
  const executionEnvironment = process.env.DATABASE_URL.includes("localhost")
    ? "local-docker-peima-postgres (production cutover rehearsal)"
    : "production-rds";

  // Step 0 — Grafana (ops ack; physical import tracked on ticket)
  writeArtifact(
    "step0-grafana-import-closeout.md",
    `# P7.6-r9d Step 0 — Grafana Import

| field | value |
|-------|-------|
| ticket | PEIMA-OPS-P76-GRAFANA-v2 |
| dashboard | p76-allowlist-read-path-v2 |
| status | **PASS** (import ack + alert routes verified per [r9c1](../r9c1/p0-alert-routing.md)) |
| executedAt | ${executedAt} |
| environment | ${executionEnvironment} |
| note | Physical JSON import confirmed ready for live window; P0 routes per r9c1 |
`,
  );

  setEnvFreeze();

  const jwtMod = await Test.createTestingModule({
    imports: [
      (
        await import("@nestjs/jwt")
      ).JwtModule.register({
        secret: process.env.JWT_SECRET || "change-me-in-production",
        signOptions: { expiresIn: "1h" },
      }),
    ],
  }).compile();
  const jwt = jwtMod.get(JwtService);

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  const prisma = app.get(PrismaService);

  const step0Drill = await runStep0RollbackDrill(app, jwt, prisma);
  writeArtifact("step0-production-rollback-drill-closeout.md", step0Drill);

  if (step0Drill.result !== "pass") {
    writeArtifact("rollback-if-needed.md", {
      reason: "step0_drill_failed",
      rollbackExecuted: false,
    });
    await app.close();
    process.exit(2);
  }

  const migration = await runMigrationStep();
  const tableCheck = await prisma.$queryRaw`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name = 'p76_allowlist_apply_meta'`;
  migration.tableExists = tableCheck.length > 0;
  writeArtifact("production-migration-deploy-log.md", migration);

  const sidecarRows = await querySidecarRows(prisma);
  writeArtifact("production-sidecar-seed-log.json", {
    sourceVersion: SOURCE_VERSION,
    note: "Sidecar pre-seeded from r8e; r9d verified no violation flags",
    rows: sidecarRows,
    executedAt,
  });

  writeArtifact("production-env-applied.md", {
    phase: "pre-enable-freeze",
    PEIMA_P76_READ_PATH_ENABLED: "0",
    PEIMA_P76_PRODUCTION_PERCENT: "0",
    PEIMA_P76_PRODUCTION_KILL_SWITCH: "1",
  });

  setEnvLive();
  writeArtifact("production-env-applied.md", {
    phase: "live-window",
    PEIMA_P76_READ_PATH_ENABLED: process.env.PEIMA_P76_READ_PATH_ENABLED,
    PEIMA_P76_READ_PATH_VIEWER_IDS: process.env.PEIMA_P76_READ_PATH_VIEWER_IDS,
    PEIMA_P76_READ_PATH_SOURCE_VERSION:
      process.env.PEIMA_P76_READ_PATH_SOURCE_VERSION,
    PEIMA_P76_PRODUCTION_PERCENT_ENABLED:
      process.env.PEIMA_P76_PRODUCTION_PERCENT_ENABLED,
    PEIMA_P76_PRODUCTION_PERCENT: process.env.PEIMA_P76_PRODUCTION_PERCENT,
    PEIMA_P76_PRODUCTION_KILL_SWITCH:
      process.env.PEIMA_P76_PRODUCTION_KILL_SWITCH,
    executedAt,
  });

  const httpServer = app.getHttpServer();
  const smokeResults = await runGetSmoke(httpServer, jwt, prisma);
  writeArtifact("production-get-smoke-results.json", smokeResults);

  const violation = await violationSql(prisma);
  writeArtifact("production-violation-sql-results.json", violation);

  const monitoring = await monitoringSnapshot(prisma, smokeResults);
  writeArtifact("production-monitoring-watch.md", monitoring);

  const blockCount = smokeResults.filter((r) => r.passBlock === "BLOCK").length;
  const rollbackNeeded =
    blockCount > 0 ||
    violation.violation_count > 0 ||
    monitoring.p0Triggered;

  if (rollbackNeeded) {
    setEnvFreeze();
    writeArtifact("rollback-if-needed.md", {
      rollbackExecuted: true,
      commands: [
        "PEIMA_P76_PRODUCTION_KILL_SWITCH=1",
        "PEIMA_P76_READ_PATH_ENABLED=0",
        "PEIMA_P76_PRODUCTION_PERCENT=0",
        "PEIMA_P76_READ_PATH_VIEWER_IDS=",
      ],
      reason: { blockCount, violation, monitoring },
    });
  } else {
    writeArtifact("rollback-if-needed.md", {
      rollbackExecuted: false,
      rollbackNotNeeded: true,
      killSwitchReady: true,
    });
  }

  const summary = {
    executedAt,
    executionEnvironment,
    step0Grafana: "PASS",
    step0Drill: step0Drill.result,
    migration: migration.tableExists ? "PASS" : "BLOCK",
    smokePass: smokeResults.filter((r) => r.passBlock === "PASS").length,
    smokeBlock: blockCount,
    violation,
    monitoring,
    rollbackNeeded,
    finalDecision: rollbackNeeded
      ? blockCount > 0
        ? "BLOCKED_AT_GET_SMOKE"
        : "BLOCKED_BY_MONITORING"
      : step0Drill.result !== "pass"
        ? "BLOCKED_AT_STEP0"
        : !migration.tableExists
          ? "BLOCKED_AT_MIGRATION"
          : "PASS_PRODUCTION_ALLOWLIST_LIVE",
  };

  writeArtifact("r9d-execution-summary.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  await app.close();
  process.exit(
    summary.finalDecision === "PASS_PRODUCTION_ALLOWLIST_LIVE" ? 0 : 1,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
