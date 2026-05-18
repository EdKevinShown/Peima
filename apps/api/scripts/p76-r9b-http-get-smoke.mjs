/**
 * P7.6-r9b — HTTP GET /matching/result/:userId smoke (Nest in-process + supertest).
 * Dev/staging only. Requires nest build + DATABASE_URL + JWT_SECRET in .env.
 */
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
const outDir = join(root, "artifacts/p76/r9b");

const ALLOWLIST_ACTIVE = [
  "cmr4hm001016z64demo00m05a",
  "cmfemn00100016z64seed0001",
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
];
const ROLLED_BACK = "cmr4r7j4050025z64stag0001";
const NON_ALLOWLIST = "cmo7ksq8s00006znosryc9k0n";
const ALL_ALLOWLIST = [...ALLOWLIST_ACTIVE, ROLLED_BACK];

const SIDECAR_EXPECTED = {
  cmr4hm001016z64demo00m05a: "cmr4hf000916z64demo00f05a",
  cmfemn00100016z64seed0001: "cmr4hf000716z64demo00f04a",
  cmr4hf000716z64demo00f04a: "cmfemn00100016z64seed0001",
  cmr4hf000916z64demo00f05a: "cmr4hf000716z64demo00f04a",
};

const RESULT_STATE_CONTRACT_VERSION = "p7.10-r4a-result-state-contract-v1";
const VALID_RESULT_STATES = new Set([
  "ready",
  "safe_fallback",
  "matching_pending",
  "no_result",
]);
const MATCHING_PENDING_QUEUE_STATUSES = new Set(["waiting", "processing", "ready"]);

function expectResultStateContract() {
  return process.env.P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT === "1";
}

function setResultStateContractEnv() {
  process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED = "1";
}

/** @returns {{ ok: boolean, errors: string[] }} */
function assertResultStateContract(body) {
  const errors = [];
  if (body.contractVersion !== RESULT_STATE_CONTRACT_VERSION) {
    errors.push(
      `contractVersion expected ${RESULT_STATE_CONTRACT_VERSION}, got ${String(body.contractVersion)}`,
    );
  }
  if (!body.resultState || !VALID_RESULT_STATES.has(body.resultState)) {
    errors.push(`resultState missing or invalid: ${String(body.resultState)}`);
  }
  if (body.resultState === "matching_pending") {
    const qs = body.queue?.status;
    if (!qs || !MATCHING_PENDING_QUEUE_STATUSES.has(qs)) {
      errors.push(
        `matching_pending requires queue.status in waiting|processing|ready, got ${String(qs)}`,
      );
    }
  }
  if (body.resultState === "no_result") {
    if (!body.noResult?.reason) {
      errors.push("no_result requires noResult.reason");
    }
  }
  if (body.resultState === "ready" || body.resultState === "safe_fallback") {
    const hasCandidate =
      body.candidateUserId != null || body.displayCandidateUserId != null;
    if (!hasCandidate) {
      errors.push("ready/safe_fallback requires candidateUserId or displayCandidateUserId");
    }
  }
  return { ok: errors.length === 0, errors };
}

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

function setReadPathEnv() {
  process.env.PEIMA_P76_READ_PATH_ENABLED = "1";
  process.env.PEIMA_P76_READ_PATH_VIEWER_IDS = ALL_ALLOWLIST.join(",");
  process.env.PEIMA_P76_READ_PATH_SOURCE_VERSION = "p7.6-r7j3-staging-cohort-v1";
  process.env.PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF = "1";
  process.env.PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF = "1";
  process.env.PEIMA_P76_READ_PATH_SAFE_FALLBACK = "1";
  // Deprecated alias still supported: PEIMA_P76_READ_PATH_FALLBACK_LEGACY
  process.env.PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK = "1";
  process.env.PEIMA_P76_PRODUCTION_PERCENT_ENABLED = "0";
  process.env.PEIMA_P76_PRODUCTION_PERCENT = "0";
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

async function getLatestMatchResult(prisma, userId) {
  return prisma.matchResult.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      candidateUserId: true,
      finalScore: true,
      updatedAt: true,
    },
  });
}

function evaluateReadPathPass({ res, body, before, after, caseType, expectedDisplay }) {
  const meta = body.p76ReadPathMeta ?? null;
  return (
    res.status === 200 &&
    before &&
    after &&
    after.candidateUserId === before.candidateUserId &&
    after.finalScore === before.finalScore &&
    (caseType === "allowlist_active"
      ? body.displaySourceType === "p76_allowlist_sidecar_readonly" &&
        body.displayCandidateUserId === expectedDisplay &&
        meta?.enabled === true &&
        meta?.fallbackUsed === false
      : body.displaySourceType !== "p76_allowlist_sidecar_readonly" &&
        body.displayCandidateUserId === before.candidateUserId)
  );
}

async function runCase(httpServer, jwt, prisma, viewerUserId, contractMode) {
  const caseType = classifyCase(viewerUserId);
  const before = await getLatestMatchResult(prisma, viewerUserId);
  const token = signToken(jwt, viewerUserId);
  const res = await request(httpServer)
    .get(`/matching/result/${viewerUserId}`)
    .set("Authorization", `Bearer ${token}`);

  const after = await getLatestMatchResult(prisma, viewerUserId);
  const body = res.body ?? {};
  const meta = body.p76ReadPathMeta ?? null;

  const expectedDisplay =
    caseType === "allowlist_active"
      ? SIDECAR_EXPECTED[viewerUserId]
      : before?.candidateUserId;

  let pass;
  let resultStateContractPass = null;
  let resultStateContractErrors = [];
  let resultStateContractOnly = false;

  if (contractMode) {
    if (res.status !== 200) {
      pass = false;
      resultStateContractPass = false;
      resultStateContractErrors = [
        `contract mode expects HTTP 200, got ${res.status}`,
      ];
    } else {
      const contract = assertResultStateContract(body);
      resultStateContractPass = contract.ok;
      resultStateContractErrors = contract.errors;
      const rs = body.resultState;
      if (!contract.ok) {
        pass = false;
      } else if (rs === "matching_pending" || rs === "no_result") {
        pass = true;
        resultStateContractOnly = true;
      } else {
        pass = evaluateReadPathPass({
          res,
          body,
          before,
          after,
          caseType,
          expectedDisplay,
        });
      }
    }
  } else {
    pass = evaluateReadPathPass({
      res,
      body,
      before,
      after,
      caseType,
      expectedDisplay,
    });
  }

  return {
    caseType,
    viewerUserId,
    httpStatus: res.status,
    persistedCandidateUserId: before?.candidateUserId,
    finalScore: before?.finalScore,
    expectedDisplayCandidateUserId: expectedDisplay,
    actualDisplayCandidateUserId: body.displayCandidateUserId,
    actualDisplaySourceType: body.displaySourceType,
    fallbackUsed: meta?.fallbackUsed ?? null,
    fallbackReason: meta?.fallbackReason ?? null,
    p76Enabled: meta?.enabled ?? null,
    candidateUnchanged: after?.candidateUserId === before?.candidateUserId,
    finalScoreUnchanged: after?.finalScore === before?.finalScore,
    resultState: body.resultState ?? null,
    contractVersion: body.contractVersion ?? null,
    queueStatus: body.queue?.status ?? null,
    noResultReason: body.noResult?.reason ?? null,
    resultStateContractPass,
    resultStateContractErrors,
    resultStateContractOnly,
    passBlock: pass ? "PASS" : "BLOCK",
    error: res.status >= 400 ? body.message ?? JSON.stringify(body) : null,
    matchResultId: before?.id,
  };
}

async function main() {
  loadDotEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL required");
  }
  setReadPathEnv();
  const contractMode = expectResultStateContract();
  if (contractMode) {
    setResultStateContractEnv();
  }

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
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  const prisma = app.get(PrismaService);
  const httpServer = app.getHttpServer();

  const viewers = [...ALLOWLIST_ACTIVE, ROLLED_BACK, NON_ALLOWLIST];
  const results = [];
  for (const v of viewers) {
    results.push(await runCase(httpServer, jwt, prisma, v, contractMode));
  }

  const violation = await prisma.$queryRaw`
    select count(*)::int as violation_count from p76_allowlist_apply_meta
    where "appliedToMatchResult" = true or "appliedToFinalScore" = true
      or "appliedToWorkerRanking" = true or "appliedToDisplay" = true
  `;
  const routeC = await prisma.$queryRaw`
    select count(*)::int as route_c_rows from p76_allowlist_apply_meta
    where "viewerUserId" in (
      'cmr4hm001016z64demo00m05a','cmfemn00100016z64seed0001',
      'cmr4hf000716z64demo00f04a','cmr4hf000916z64demo00f05a','cmr4r7j4050025z64stag0001'
    )
  `;
  const rolledBack = await prisma.$queryRaw`
    select count(*)::int as rolled_back_count from p76_allowlist_apply_meta where "rolledBack" = true
  `;

  const resultStateCounts = {
    ready: 0,
    safe_fallback: 0,
    matching_pending: 0,
    no_result: 0,
    unset: 0,
  };
  for (const r of results) {
    if (r.resultState && VALID_RESULT_STATES.has(r.resultState)) {
      resultStateCounts[r.resultState] += 1;
    } else {
      resultStateCounts.unset += 1;
    }
  }

  const summary = {
    executedAt: new Date().toISOString(),
    apiBase: "in-process Nest (supertest)",
    auth: "JWT Bearer (sub=userId)",
    env: {
      PEIMA_P76_READ_PATH_ENABLED: process.env.PEIMA_P76_READ_PATH_ENABLED,
      PEIMA_P76_READ_PATH_SOURCE_VERSION: process.env.PEIMA_P76_READ_PATH_SOURCE_VERSION,
      PEIMA_P76_PRODUCTION_PERCENT: process.env.PEIMA_P76_PRODUCTION_PERCENT,
      P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT: contractMode ? "1" : "0",
      PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED: contractMode
        ? process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED
        : "0",
    },
    resultStateContractMode: contractMode,
    resultStateCounts,
    results,
    violationSql: violation[0],
    routeCRows: routeC[0],
    rolledBackCount: rolledBack[0],
    passCount: results.filter((r) => r.passBlock === "PASS").length,
    blockCount: results.filter((r) => r.passBlock === "BLOCK").length,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "http-get-smoke-results.json"), JSON.stringify(results, null, 2));
  writeFileSync(join(outDir, "http-get-smoke-summary.json"), JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  await app.close();
  process.exit(summary.blockCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
