import type { MatchResult } from "@peima/database";
import {
  formatM55M4HookOutput,
  parseM55M4ProductionHookArgs,
  runM55M4ProductionHook,
} from "../src/dev-cli/m55-m4-rrm-top2-production-hook-runner";
import { writeRrmTop2DisplayMetaForMatchResult } from "../src/modules/matching/matching-rrm-top2-display-meta-writer";

jest.mock("../src/modules/matching/matching-rrm-top2-display-meta-writer", () => ({
  writeRrmTop2DisplayMetaForMatchResult: jest.fn(),
}));

const mockedWriter = jest.mocked(writeRrmTop2DisplayMetaForMatchResult);

function baseOpts(over: Partial<Parameters<typeof runM55M4ProductionHook>[0]> = {}) {
  return {
    matchResultId: "mr-m4",
    top2CandidateUserIdA: "cand-a",
    top2CandidateUserIdB: "cand-b",
    rrmWinnerCandidateUserId: "cand-b",
    top2Fingerprint: "fp-m4",
    guardrailsStatus: "pass" as const,
    mergeSummary: false,
    apply: false,
    pretty: false,
    ...over,
  };
}

function prismaWithRow(row: MatchResult | null) {
  return {
    matchResult: {
      findUnique: jest.fn().mockResolvedValue(row),
    },
    matchResultRrmTop2DisplayMeta: {},
    user: {},
  } as never;
}

describe("m55-m4 production hook runner", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const META = "PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED";
  const SUM = "PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED";
  const prevMeta = process.env[META];
  const prevSum = process.env[SUM];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env[META] = "1";
    process.env[SUM] = "1";
  });

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevMeta === undefined) delete process.env[META];
    else process.env[META] = prevMeta;
    if (prevSum === undefined) delete process.env[SUM];
    else process.env[SUM] = prevSum;
  });

  it("refuses when NODE_ENV is production", async () => {
    process.env.NODE_ENV = "production";
    const row = {
      id: "mr-m4",
      candidateUserId: "cand-a",
      userId: "u1",
    } as MatchResult;
    const r = await runM55M4ProductionHook(baseOpts(), prismaWithRow(row));
    expect(r).toEqual({ refused: true, reason: "node_env_production" });
    expect(mockedWriter).not.toHaveBeenCalled();
    process.env.NODE_ENV = "test";
  });

  it("dry-run invokes writer with dryRun true", async () => {
    process.env.NODE_ENV = "test";
    mockedWriter.mockResolvedValue({
      ok: true,
      dryRun: true,
      wroteSummary: false,
      wroteMeta: false,
      noOpReasonCode: null,
      matchResultId: "mr-m4",
      sourceVersion: "m5.5-m4-production-hook-v1",
      displayCandidateUserId: "cand-b",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
    const row = {
      id: "mr-m4",
      candidateUserId: "cand-a",
      userId: "u1",
    } as MatchResult;
    await runM55M4ProductionHook(baseOpts({ apply: false }), prismaWithRow(row));
    expect(mockedWriter).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it("--apply invokes writer with dryRun false", async () => {
    mockedWriter.mockResolvedValue({
      ok: true,
      dryRun: false,
      wroteSummary: true,
      wroteMeta: true,
      noOpReasonCode: null,
      matchResultId: "mr-m4",
      sourceVersion: "m5.5-m4-production-hook-v1",
      displayCandidateUserId: "cand-b",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
    const row = {
      id: "mr-m4",
      candidateUserId: "cand-a",
      userId: "u1",
    } as MatchResult;
    await runM55M4ProductionHook(baseOpts({ apply: true }), prismaWithRow(row));
    expect(mockedWriter).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
  });

  it("missing MatchResult does not call writer", async () => {
    const r = await runM55M4ProductionHook(baseOpts(), prismaWithRow(null));
    expect(r.refused === true).toBe(false);
    if (r.refused !== true) {
      expect(r.ok).toBe(false);
      expect(r.noOpReasonCode).toBe("match_result_missing");
    }
    expect(mockedWriter).not.toHaveBeenCalled();
  });

  it("guardrails block yields writer no-op path", async () => {
    mockedWriter.mockResolvedValue({
      ok: false,
      dryRun: true,
      wroteSummary: false,
      wroteMeta: false,
      noOpReasonCode: "guardrails_invalid",
      matchResultId: "mr-m4",
      sourceVersion: "m5.5-m4-production-hook-v1",
      displayCandidateUserId: null,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
    const row = { id: "mr-m4", candidateUserId: "cand-a", userId: "u1" } as MatchResult;
    await runM55M4ProductionHook(baseOpts({ guardrailsStatus: "block" }), prismaWithRow(row));
    expect(mockedWriter).toHaveBeenCalled();
  });

  it("guardrails caution yields writer no-op path", async () => {
    mockedWriter.mockResolvedValue({
      ok: false,
      dryRun: true,
      wroteSummary: false,
      wroteMeta: false,
      noOpReasonCode: "guardrails_invalid",
      matchResultId: "mr-m4",
      sourceVersion: "m5.5-m4-production-hook-v1",
      displayCandidateUserId: null,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
    const row = { id: "mr-m4", candidateUserId: "cand-a", userId: "u1" } as MatchResult;
    const r = await runM55M4ProductionHook(baseOpts({ guardrailsStatus: "caution" }), prismaWithRow(row));
    if (r.refused !== true) {
      expect(r.ok).toBe(false);
      expect(r.noOpReasonCode).toBe("guardrails_invalid");
    }
    expect(mockedWriter).toHaveBeenCalled();
  });

  it("mergeSummary on apply without summary env skips writer", async () => {
    delete process.env[SUM];
    const row = { id: "mr-m4", candidateUserId: "cand-a", userId: "u1" } as MatchResult;
    const r = await runM55M4ProductionHook(
      baseOpts({ mergeSummary: true, apply: true }),
      prismaWithRow(row),
    );
    if (r.refused !== true) {
      expect(r.noOpReasonCode).toBe("summary_write_disabled");
      expect(r.ok).toBe(false);
    }
    expect(mockedWriter).not.toHaveBeenCalled();
  });

  it("eligible pass surfaces writer ok and invariants", async () => {
    mockedWriter.mockResolvedValue({
      ok: true,
      dryRun: true,
      wroteSummary: false,
      wroteMeta: false,
      noOpReasonCode: null,
      matchResultId: "mr-m4",
      sourceVersion: "m5.5-m4-production-hook-v1",
      displayCandidateUserId: "cand-b",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
    const row = { id: "mr-m4", candidateUserId: "cand-a", userId: "u1" } as MatchResult;
    const r = await runM55M4ProductionHook(baseOpts(), prismaWithRow(row));
    if (r.refused !== true) {
      expect(r.candidateUserIdUnchanged).toBe(true);
      expect(r.finalScoreUnchanged).toBe(true);
      expect(r.ok).toBe(true);
    }
  });

  it("formatted output omits sensitive tokens", async () => {
    const out = {
      refused: false as const,
      mode: "dry_run" as const,
      dryRun: true,
      ok: true,
      noOpReasonCode: null,
      wroteSummary: false,
      wroteMeta: false,
      sourceVersion: "m5.5-m4-production-hook-v1",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
      metaWriteEnvOn: true,
      summaryWriteEnvOn: true,
      nextVerificationHint: "Read-only GET check after enabling display env.",
    };
    const s = formatM55M4HookOutput(out, false);
    expect(s.toLowerCase()).not.toMatch(/prompt|transcript|formula|c_pred|api_key|openai/i);
  });

  it("parseM55M4ProductionHookArgs reads guardrailsStatus and pretty", () => {
    const o = parseM55M4ProductionHookArgs([
      "--matchResultId=x",
      "--top2CandidateUserIdA=a",
      "--top2CandidateUserIdB=b",
      "--rrmWinnerCandidateUserId=b",
      "--guardrailsStatus=block",
      "--pretty",
    ]);
    expect(o?.guardrailsStatus).toBe("block");
    expect(o?.pretty).toBe(true);
  });
});
