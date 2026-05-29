import type { MatchResult } from "@peima/database";
import { RRM_SIM_SOURCE_VERSION } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import {
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
  type RrmSimReadonlySummaryPayloadV1,
} from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import {
  writeRrmTop2DisplayMetaForMatchResult,
  type WriteRrmTop2DisplayMetaForMatchResultPrisma,
} from "../src/modules/matching/matching-rrm-top2-display-meta-writer";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "../src/modules/matching/rrm-top2-display-meta.types";

const META_KEY = "PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED";
const SUM_KEY = "PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED";

function passGuardrails(over: Partial<RrmTop2DisplayMetaGuardrailsV1> = {}): RrmTop2DisplayMetaGuardrailsV1 {
  return {
    status: "pass",
    blockReasons: [],
    cautionReasons: [],
    sourceVersion: "m5-test-guardrails-v1",
    ...over,
  };
}

function rrmSummary(winner: string, baseline: string): RrmSimReadonlySummaryPayloadV1 {
  return {
    schemaVersion: 1,
    sourceType: RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
    sourceVersion: RRM_SIM_SOURCE_VERSION,
    candidateUserId: baseline,
    winnerUserId: winner,
    proposalCandidateUserId: winner,
    scenarioKey: null,
    suggestedAction: "maintain",
    progressionWindow: null,
    simulatedRhythmScore: 1,
    recommendation: "ok",
    confidenceBucket: "high" as const,
    fallbackUsed: false,
    unavailableReason: null,
    cautionFlags: [],
    generatedAt: "2026-05-03T00:00:00.000Z",
    frozenAt: null,
  };
}

function mr(over: Partial<MatchResult> = {}): MatchResult {
  return {
    id: "mr-w1",
    userId: "viewer-1",
    candidateUserId: "cand-a",
    batchId: "b1",
    finalScore: 0.7,
    reasonSummary: "ok",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    matchInsights: { [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-b", "cand-a") },
    ...over,
  } as MatchResult;
}

function prismaFactory(over: {
  row?: MatchResult | null;
  sidecar?: { frozen: boolean; meta: unknown } | null;
  upsert?: jest.Mock;
  update?: jest.Mock;
  userIds?: Set<string>;
}): WriteRrmTop2DisplayMetaForMatchResultPrisma {
  const userIds = over.userIds ?? new Set(["cand-a", "cand-b"]);
  const row = over.row === undefined ? mr() : over.row;
  return {
    matchResult: {
      findUnique: jest.fn(async () => row),
      update: over.update ?? jest.fn(async () => ({})),
    },
    matchResultRrmTop2DisplayMeta: {
      findUnique: jest.fn(async () => over.sidecar ?? null),
      upsert: over.upsert ?? jest.fn(async () => ({})),
    },
    user: {
      findUnique: jest.fn(async ({ where: { id } }) => (userIds.has(id) ? { id } : null)),
    },
  };
}

describe("writeRrmTop2DisplayMetaForMatchResult (M5.5-M2)", () => {
  const prevMeta = process.env[META_KEY];
  const prevSum = process.env[SUM_KEY];

  afterEach(() => {
    if (prevMeta === undefined) delete process.env[META_KEY];
    else process.env[META_KEY] = prevMeta;
    if (prevSum === undefined) delete process.env[SUM_KEY];
    else process.env[SUM_KEY] = prevSum;
  });

  it("no-op writer_disabled when meta env off", async () => {
    delete process.env[META_KEY];
    const p = prismaFactory({});
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
    });
    expect(r.ok).toBe(false);
    expect(r.noOpReasonCode).toBe("writer_disabled");
    expect(p.matchResultRrmTop2DisplayMeta.upsert).not.toHaveBeenCalled();
  });

  it("no-op match_result_missing when MatchResult missing", async () => {
    process.env[META_KEY] = "1";
    const p = prismaFactory({ row: null });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "missing",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("match_result_missing");
  });

  it("no-op existing_meta_frozen when sidecar frozen", async () => {
    const p = prismaFactory({ sidecar: { frozen: true, meta: {} } });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("existing_meta_frozen");
    expect(p.matchResultRrmTop2DisplayMeta.upsert).not.toHaveBeenCalled();
  });

  it("no-op rrm_summary_missing when no summary on row and no payload", async () => {
    const p = prismaFactory({ row: mr({ matchInsights: {} }) });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("rrm_summary_missing");
  });

  it("no-op rrm_summary_invalid when payload merge does not parse", async () => {
    const p = prismaFactory({ row: mr({ matchInsights: {} }) });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
      summaryWriteEnabled: true,
      rrmSimReadonlySummaryPayload: { schemaVersion: 99 } as never,
    });
    expect(r.noOpReasonCode).toBe("rrm_summary_invalid");
  });

  it("no-op static_top2_missing when ids empty", async () => {
    const p = prismaFactory({});
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("static_top2_missing");
  });

  it("no-op top2_duplicate when two ids equal", async () => {
    const p = prismaFactory({});
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-a"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("top2_duplicate");
  });

  it("no-op baseline_mismatch when baseline not in pair", async () => {
    const p = prismaFactory({});
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-b", "cand-c"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("baseline_mismatch");
  });

  it("no-op guardrails_invalid when guardrails missing pass", async () => {
    const p = prismaFactory({});
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: { status: "caution", blockReasons: [], cautionReasons: ["x"] },
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("guardrails_invalid");
  });

  it("no-op guardrails_invalid when pass status but blockReasons non-empty", async () => {
    const p = prismaFactory({});
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: { status: "pass", blockReasons: ["x"], cautionReasons: [] },
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("guardrails_invalid");
  });

  it("no-op guardrails_invalid when status not_evaluated", async () => {
    const p = prismaFactory({});
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: { status: "not_evaluated", blockReasons: [], cautionReasons: [] },
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("guardrails_invalid");
  });

  it("eligible upserts meta and keeps applied flags false", async () => {
    const upsert = jest.fn(async () => ({}));
    const p = prismaFactory({ upsert });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.ok).toBe(true);
    expect(r.wroteMeta).toBe(true);
    expect(r.noOpReasonCode).toBeNull();
    expect(upsert).toHaveBeenCalled();
    const firstCall = upsert.mock.calls[0] as unknown as [{ create: { meta: Record<string, unknown> } }];
    const meta = firstCall[0].create.meta;
    expect(meta.appliedToFinalScore).toBe(false);
    expect(meta.appliedToWorkerRanking).toBe(false);
    expect(meta.decisionRule).toBe("rrm_top2_bounded_selector");
  });

  it("dryRun does not call upsert", async () => {
    const upsert = jest.fn();
    const p = prismaFactory({ upsert });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
      dryRun: true,
    });
    expect(r.ok).toBe(true);
    expect(r.wroteMeta).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("eligible keeps candidateUserId and finalScore unchanged", async () => {
    const upsert = jest.fn(async () => ({}));
    const stable = mr();
    const findUnique = jest.fn(async () => stable);
    const p: WriteRrmTop2DisplayMetaForMatchResultPrisma = {
      ...prismaFactory({ upsert }),
      matchResult: {
        findUnique,
        update: jest.fn(),
      },
    };
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.candidateUserIdUnchanged).toBe(true);
    expect(r.finalScoreUnchanged).toBe(true);
  });

  it("no-op proposed_user_not_found when display user missing", async () => {
    const p = prismaFactory({ userIds: new Set(["cand-a"]) });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("proposed_user_not_found");
  });

  it("mode 2: writes summary then meta when summaryWriteEnabled", async () => {
    process.env[SUM_KEY] = "1";
    const upsert = jest.fn(async () => ({}));
    const update = jest.fn(async () => ({}));
    const rowNoSummary = mr({ matchInsights: {} });
    const rowWithSummary = mr({
      matchInsights: { [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-b", "cand-a") },
    });
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(rowNoSummary)
      .mockResolvedValueOnce(rowWithSummary)
      .mockResolvedValueOnce(rowWithSummary);
    const p: WriteRrmTop2DisplayMetaForMatchResultPrisma = {
      matchResult: { findUnique, update },
      matchResultRrmTop2DisplayMeta: {
        findUnique: jest.fn(async () => null),
        upsert,
      },
      user: prismaFactory({}).user,
    };
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
      summaryWriteEnabled: true,
      rrmSimReadonlySummaryPayload: rrmSummary("cand-b", "cand-a"),
    });
    expect(r.ok).toBe(true);
    expect(r.wroteSummary).toBe(true);
    expect(r.wroteMeta).toBe(true);
    expect(update).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
  });

  it("no-op summary_write_disabled when payload without summary env and no on-disk summary", async () => {
    delete process.env[SUM_KEY];
    const p = prismaFactory({ row: mr({ matchInsights: {} }) });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
      rrmSimReadonlySummaryPayload: rrmSummary("cand-b", "cand-a"),
    });
    expect(r.noOpReasonCode).toBe("summary_write_disabled");
  });

  it("no-op rrm_confidence_low when summary bucket is low", async () => {
    const low = { ...rrmSummary("cand-b", "cand-a"), confidenceBucket: "low" as const };
    const p = prismaFactory({ row: mr({ matchInsights: { [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: low } }) });
    const r = await writeRrmTop2DisplayMetaForMatchResult({
      prisma: p,
      matchResultId: "mr-w1",
      staticTop2CandidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      guardrails: passGuardrails(),
      metaWriteEnabled: true,
    });
    expect(r.noOpReasonCode).toBe("rrm_confidence_low");
  });
});
