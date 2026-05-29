/**
 * P7.10-r6f1 — rehearsal writer dry-run (no DB).
 */
import {
  buildP76CanonicalWriterShadowPayloadV1,
} from "../src/modules/matching/p76-canonical-writer-shadow";
import type { P76CanonicalWriterShadowBuildInputV1 } from "../src/modules/matching/p76-canonical-writer-shadow.types";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";
import type { P76ReadPathEnv } from "../src/modules/matching/p76-read-path-env";
import {
  assertP76CanonicalWriterRehearsalPrivacySafe,
  dryRunP76CanonicalWriterRehearsalWriter,
  mapP76CanonicalWriterRehearsalRowToCreateInput,
  P76CanonicalWriterRehearsalWriterError,
  readP76RehearsalSidecarWriterEnv,
  resolveP76RehearsalSidecarWriterMode,
  validateP76CanonicalWriterRehearsalWriterInput,
} from "../src/modules/matching/p76-canonical-writer-rehearsal-writer";
import type {
  P76CanonicalWriterRehearsalWriterInput,
  P76CanonicalWriterRehearsalWriterRowInput,
} from "../src/modules/matching/p76-canonical-writer-rehearsal-writer.types";

const VIEWER = "viewer-r6f1";
const MATCH = "match-r6f1";
const AUDIT = "audit-run-r6f1";

function enabledReadPathEnv(
  over: Partial<P76ReadPathEnv> = {},
): P76ReadPathEnv {
  return {
    enabled: true,
    viewerAllowlist: [VIEWER],
    sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    requirePmSignoff: true,
    requireOpsSignoff: true,
    safeFallbackEnabled: true,
    fallbackLegacy: true,
    deprecatedAliasUsed: false,
    strictViolationBlock: true,
    ...over,
  };
}

function buildShadow(over: Partial<P76CanonicalWriterShadowBuildInputV1> = {}) {
  const readPathEnv = enabledReadPathEnv();
  return buildP76CanonicalWriterShadowPayloadV1(
    {
      viewerUserId: VIEWER,
      baseline: {
        candidateUserId: "base-cand",
        finalScore: 0.8,
      },
      sidecar: {
        id: "meta-r6f1",
        viewerUserId: VIEWER,
        selectedCandidateId: "prop-cand",
        sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
        allowlistMatched: true,
        pmSignoffStatus: "approved",
        opsSignoffStatus: "approved",
        applied: true,
        dryRun: false,
        rolledBack: false,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
        appliedToDisplay: false,
      },
      ...over,
    },
    {
      env: {
        PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED: "1",
        PEIMA_P76_READ_PATH_ENABLED: "1",
        PEIMA_P76_READ_PATH_VIEWER_IDS: VIEWER,
      } as NodeJS.ProcessEnv,
      readPathEnv,
    },
  );
}

function baseRow(
  over: Partial<P76CanonicalWriterRehearsalWriterRowInput> = {},
): P76CanonicalWriterRehearsalWriterRowInput {
  return {
    matchResultId: MATCH,
    viewerUserId: VIEWER,
    shadow: buildShadow(),
    ...over,
  };
}

function baseInput(
  over: Partial<P76CanonicalWriterRehearsalWriterInput> = {},
): P76CanonicalWriterRehearsalWriterInput {
  return {
    auditRunId: AUDIT,
    environment: "dev",
    readPathSourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    rows: [baseRow()],
    ...over,
  };
}

describe("readP76RehearsalSidecarWriterEnv (P7.10-r6f1)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to disabled, dry-run, no insert", () => {
    delete process.env.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED;
    const env = readP76RehearsalSidecarWriterEnv({});
    expect(env.enabled).toBe(false);
    expect(env.dryRun).toBe(true);
    expect(env.allowDbWrite).toBe(false);
    expect(env.killSwitch).toBe(false);
    expect(env.canInsert).toBe(false);
    expect(env.blockedReason).toBe("disabled");
    expect(resolveP76RehearsalSidecarWriterMode(env)).toBe("disabled");
  });

  it("maps local environment to dev", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENVIRONMENT: "local",
    });
    expect(env.environment).toBe("dev");
    expect(env.normalizedEnvironment).toBe("dev");
  });

  it("canInsert when all insert gates pass", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN: "0",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ALLOW_DB_WRITE: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_KILL_SWITCH: "0",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENVIRONMENT: "staging",
      NODE_ENV: "development",
    });
    expect(env.canInsert).toBe(true);
    expect(env.blockedReason).toBeNull();
    expect(resolveP76RehearsalSidecarWriterMode(env)).toBe("insert_only");
  });

  it("blocks production environment", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN: "0",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ALLOW_DB_WRITE: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENVIRONMENT: "production",
    });
    expect(env.canInsert).toBe(false);
    expect(env.blockedReason).toBe("production_blocked");
  });

  it("blocks NODE_ENV=production", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN: "0",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ALLOW_DB_WRITE: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENVIRONMENT: "dev",
      NODE_ENV: "production",
    });
    expect(env.canInsert).toBe(false);
    expect(env.blockedReason).toBe("production_blocked");
  });

  it("dry_run blockedReason when enabled but dry-run on", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ALLOW_DB_WRITE: "0",
    });
    expect(env.blockedReason).toBe("dry_run");
    expect(resolveP76RehearsalSidecarWriterMode(env)).toBe("dry_run");
  });

  it("kill_switch takes precedence", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_KILL_SWITCH: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
    });
    expect(env.blockedReason).toBe("kill_switch");
    expect(resolveP76RehearsalSidecarWriterMode(env)).toBe("kill_switch");
  });
});

describe("p76 canonical writer rehearsal writer dry-run (P7.10-r6f1)", () => {
  it("validate rejects empty auditRunId", () => {
    expect(() =>
      validateP76CanonicalWriterRehearsalWriterInput(
        baseInput({ auditRunId: "  " }),
      ),
    ).toThrow(P76CanonicalWriterRehearsalWriterError);
  });

  it("row validate rejects appliedToMatchResult=true on shadow", () => {
    const shadow = buildShadow();
    (shadow as { appliedToMatchResult: boolean }).appliedToMatchResult = true;
    expect(() =>
      validateP76CanonicalWriterRehearsalWriterInput(baseInput()),
    ).not.toThrow();
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
    });
    const result = dryRunP76CanonicalWriterRehearsalWriter(
      baseInput({ rows: [baseRow({ shadow })] }),
      env,
    );
    expect(result.skippedCount).toBe(1);
    expect(result.errors[0]?.message).toMatch(/appliedToMatchResult/);
  });

  it("privacy rejects forbidden keys", () => {
    expect(() =>
      assertP76CanonicalWriterRehearsalPrivacySafe({ rawPrompt: "secret" }),
    ).toThrow(/forbidden key/);
  });

  it("map row sets appliedToMatchResult false and rehearsalMode", () => {
    const create = mapP76CanonicalWriterRehearsalRowToCreateInput(baseRow(), {
      auditRunId: AUDIT,
      environment: "dev",
      readPathSourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    });
    expect(create.appliedToMatchResult).toBe(false);
    expect(create.rehearsalMode).toBe("sidecar_rehearsal");
    expect(create.auditRunId).toBe(AUDIT);
    expect(create.matchResultId).toBe(MATCH);
    expect(create.guardrailReason).toBe("ok");
  });

  it("dry-run returns summary without DB insert", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN: "1",
    });
    const result = dryRunP76CanonicalWriterRehearsalWriter(baseInput(), env);
    expect(result.mode).toBe("dry_run");
    expect(result.insertedCount).toBe(0);
    expect(result.appliedToMatchResultCount).toBe(0);
    expect(result.attemptedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.dryRunRowSummaries).toHaveLength(1);
    expect(result.dryRunRowSummaries[0].guardrailReason).toBe("ok");
    expect(result.reasonCounts.ok).toBe(1);
  });

  it("disabled env blocks all rows", () => {
    const env = readP76RehearsalSidecarWriterEnv({});
    const result = dryRunP76CanonicalWriterRehearsalWriter(baseInput(), env);
    expect(result.mode).toBe("disabled");
    expect(result.blockedCount).toBe(1);
    expect(result.dryRunRowSummaries).toHaveLength(0);
  });

  it("insert_only env requires insertOnly API (dryRun does not write)", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN: "0",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ALLOW_DB_WRITE: "1",
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENVIRONMENT: "dev",
      NODE_ENV: "development",
    });
    expect(() =>
      dryRunP76CanonicalWriterRehearsalWriter(baseInput(), env),
    ).toThrow(/insertOnlyP76CanonicalWriterRehearsalWriter/);
  });

  it("skips invalid row but continues batch", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
    });
    const badShadow = buildShadow();
    (badShadow as { appliedToMatchResult: boolean }).appliedToMatchResult =
      true;
    const result = dryRunP76CanonicalWriterRehearsalWriter(
      baseInput({
        rows: [baseRow(), baseRow({ matchResultId: "m2", shadow: badShadow })],
      }),
      env,
    );
    expect(result.skippedCount).toBe(1);
    expect(result.dryRunRowSummaries).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });

  it("includes ineligible rows in dry-run summary", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
    });
    const shadow = buildShadow({ viewerUserId: VIEWER, sidecar: null });
    const result = dryRunP76CanonicalWriterRehearsalWriter(
      baseInput({ rows: [baseRow({ shadow })] }),
      env,
    );
    expect(result.dryRunRowSummaries[0].eligible).toBe(false);
    expect(result.reasonCounts.missing_sidecar).toBe(1);
  });

  it("result sourceVersion is p7.10-r6f-rehearsal-writer-v1", () => {
    const env = readP76RehearsalSidecarWriterEnv({
      PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED: "1",
    });
    const result = dryRunP76CanonicalWriterRehearsalWriter(baseInput(), env);
    expect(result.sourceVersion).toBe("p7.10-r6f-rehearsal-writer-v1");
    expect(result.schemaVersion).toBe(1);
  });
});
