import { HttpException, HttpStatus, NotFoundException, ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";

jest.mock("@tensorflow/tfjs", () => ({
  tensor3d: jest.fn(() => ({ dispose: jest.fn() })),
}));
jest.mock("@tensorflow-models/blazeface", () => ({
  load: jest.fn().mockResolvedValue({
    estimateFaces: jest.fn().mockResolvedValue([]),
  }),
}));

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { BlazeFaceDetectorAdapter } from "../src/modules/images/blaze-face-detector.adapter";
import { AiSimulationV1Service } from "../src/modules/ai-simulation-v1/ai-simulation-v1.service";
import type { RrmSimMultiCandidateDiagnostic } from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm-multi-candidate-diagnostic";
import type { RrmRankingProposal } from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";
import { MatchingRrmRankingProposalService } from "../src/modules/matching/matching-rrm-ranking-proposal.service";
import {
  AI_SIMULATION_RUN_SPEC_V1,
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
  ITEM_STATUS,
  JOB_STATUS,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION } from "../src/modules/preview-pool/preview-pool-shortlist-contract.v0";

function signUserToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, phone: "+8613800000000" });
}

const hasDb = Boolean(process.env.DATABASE_URL?.trim() && process.env.JWT_SECRET?.trim());
const describeDb = hasDb ? describe : describe.skip;

describeDb("GET /matching/rrm-ranking-proposal/:poolId (M4.0 contract)", () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let viewerId: string;
  let candA: string;
  let candB: string;
  let poolId: string;
  let jobId: string;

  beforeAll(async () => {
    const jwtFixture = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: "1h" },
        }),
      ],
    }).compile();
    jwt = jwtFixture.get(JwtService);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    viewerId = (await prisma.user.create({ data: { phone: `+86138m4rpv${suffix}`, nickname: "m4rp-viewer" } })).id;
    candA = (await prisma.user.create({ data: { phone: `+86138m4rp1${suffix}`, nickname: "m4rp-c1" } })).id;
    candB = (await prisma.user.create({ data: { phone: `+86138m4rp2${suffix}`, nickname: "m4rp-c2" } })).id;

    poolId = `pool_m4rp_${suffix}`;
    await prisma.previewPool.create({
      data: {
        id: poolId,
        userId: viewerId,
        status: "active",
      },
    });

    const binding = {
      previewPoolId: poolId,
      shortlistSchemaVersion: PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION,
      shortlistFingerprint: `fp_m4rp_${suffix}`,
      shortlistCandidateUserIds: [candA, candB],
    };

    const job = await prisma.aiSimulationV1Job.create({
      data: {
        viewerUserId: viewerId,
        poolId,
        schemaVersion: AI_SIMULATION_V1_SCHEMA,
        runSpecVersion: AI_SIMULATION_RUN_SPEC_V1,
        hintSource: AI_SIMULATION_V1_HINT_SOURCE,
        hintSnapshot: {},
        shortlistBinding: binding,
        simulationQueueActual: [candA, candB],
        jobStatus: JOB_STATUS.COMPLETED,
      },
    });
    jobId = job.id;

    await prisma.aiSimulationV1Item.createMany({
      data: [
        {
          jobId,
          candidateUserId: candA,
          status: ITEM_STATUS.SUCCEEDED,
          attemptCount: 1,
          transcriptLite: {},
          evaluator: {
            simulationRankScore: 0.6,
            continue_recommendation: "hold",
            risk_tags: [],
            mitigation_hints: [],
          },
        },
        {
          jobId,
          candidateUserId: candB,
          status: ITEM_STATUS.SUCCEEDED,
          attemptCount: 1,
          transcriptLite: {},
          evaluator: {
            simulationRankScore: 0.4,
            continue_recommendation: "hold",
            risk_tags: [],
            mitigation_hints: [],
          },
        },
      ],
    });
  });

  afterAll(async () => {
    if (prisma && jobId) {
      await prisma.aiSimulationV1Item.deleteMany({ where: { jobId } });
      await prisma.aiSimulationV1Job.deleteMany({ where: { id: jobId } });
    }
    if (prisma && poolId) {
      await prisma.previewPool.deleteMany({ where: { id: poolId } });
    }
    if (prisma) {
      await prisma.user.deleteMany({
        where: { id: { in: [viewerId, candA, candB].filter(Boolean) } },
      });
    }
    await app?.close();
    process.exitCode = undefined;
  });

  it("returns readonly proposal with ranking array", async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .get(`/matching/rrm-ranking-proposal/${encodeURIComponent(poolId)}`)
      .set("Authorization", `Bearer ${signUserToken(jwt, viewerId)}`);
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("readonly");
    expect(res.body.sourceVersion).toBe("m4.0-readonly-rrm-ranking-proposal-v1");
    expect(res.body.appliedToMatchResult).toBe(false);
    expect(res.body.appliedToFinalScore).toBe(false);
    expect(res.body.appliedToDisplayCandidate).toBe(false);
    expect(Array.isArray(res.body.ranking)).toBe(true);
    expect(res.body.ranking.length).toBeGreaterThanOrEqual(1);
    expect(res.body.simulationJobId).toBe(jobId);
    expect(res.body.viewerUserId).toBe(viewerId);
    expect(res.body.poolId).toBe(poolId);
    expect(res.body.staticTop1CandidateUserId).toBe(candA);
    for (const row of res.body.ranking) {
      expect(row).toHaveProperty("candidateUserId");
      expect(row).toHaveProperty("rank");
      expect(row).toHaveProperty("confidence");
      expect(row).toHaveProperty("riskLevel");
      expect(Array.isArray(row.reasonCodes)).toBe(true);
    }
  });

  it("returns 404 NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL when no completed job", async () => {
    const suffix = `${Date.now()}-orphan`;
    const orphanViewer = (await prisma.user.create({ data: { phone: `+86138m4ro${suffix}`, nickname: "m4rp-orphan" } }))
      .id;
    const orphanPoolId = `pool_m4ro_${suffix}`;
    await prisma.previewPool.create({
      data: { id: orphanPoolId, userId: orphanViewer, status: "active" },
    });

    const server = app.getHttpServer();
    const res = await request(server)
      .get(`/matching/rrm-ranking-proposal/${encodeURIComponent(orphanPoolId)}`)
      .set("Authorization", `Bearer ${signUserToken(jwt, orphanViewer)}`);
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe("NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL");

    await prisma.previewPool.deleteMany({ where: { id: orphanPoolId } });
    await prisma.user.delete({ where: { id: orphanViewer } });
  });
});

describe("MatchingRrmRankingProposalService (unit, no DB)", () => {
  const viewerUserId = "viewer_u1";
  const poolId = "pool_p1";

  function minimalDiagnostic(): RrmSimMultiCandidateDiagnostic {
    return {
      jobId: "job1",
      viewerUserId,
      sourceVersion: "test",
      items: [
        {
          candidateUserId: "cand_a",
          status: "succeeded",
          existingRank: 1,
          simulationRankScore: 0.9,
          aiSimulationV2Full: false,
          simulatedRhythmScore: 70,
          suggestedAction: null,
          progressionWindow: null,
          fallbackUsed: false,
          rrmUnavailableReason: null,
        },
        {
          candidateUserId: "cand_b",
          status: "succeeded",
          existingRank: 2,
          simulationRankScore: 0.5,
          aiSimulationV2Full: false,
          simulatedRhythmScore: 85,
          suggestedAction: null,
          progressionWindow: null,
          fallbackUsed: false,
          rrmUnavailableReason: null,
        },
      ],
      rankings: {
        existingSimulationRank: ["cand_a", "cand_b"],
        rrmRhythmRank: ["cand_b", "cand_a"],
      },
      diagnostics: {
        rrmAvailableCount: 2,
        fallbackCount: 0,
        scoreRange: { min: 70, max: 85, spread: 15 },
        scoreDistributionFlag: "ok",
        topCandidateChangedIfRrmOnly: true,
      },
    };
  }

  function minimalProposal(): RrmRankingProposal {
    const d = minimalDiagnostic();
    return {
      schemaVersion: 1,
      sourceVersion: "m4.0-readonly-rrm-ranking-proposal-v1",
      mode: "readonly",
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      existingTopCandidateUserId: d.rankings.existingSimulationRank[0] ?? null,
      rrmTopCandidateUserId: d.rankings.rrmRhythmRank[0] ?? null,
      topCandidateChanged: d.diagnostics.topCandidateChangedIfRrmOnly,
      scoreDistributionFlag: d.diagnostics.scoreDistributionFlag,
      confidenceLevel: "medium",
      recommendation: "diagnostic_only",
      items: [],
      warnings: [],
    };
  }

  it("throws NotFoundException when pool not found", async () => {
    const prisma = {
      previewPool: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const ai = { getRrmRankingProposalReadonlyForPool: jest.fn() } as unknown as AiSimulationV1Service;
    const svc = new MatchingRrmRankingProposalService(prisma, ai);
    await expect(svc.getReadonlyProposal(viewerUserId, poolId)).rejects.toBeInstanceOf(NotFoundException);
    expect(ai.getRrmRankingProposalReadonlyForPool).not.toHaveBeenCalled();
  });

  it("maps payload to HTTP DTO with applied flags false", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: poolId, userId: viewerUserId, status: "active" }),
      },
    } as unknown as PrismaService;
    const diagnostic = minimalDiagnostic();
    const proposal = minimalProposal();
    const ai = {
      getRrmRankingProposalReadonlyForPool: jest.fn().mockResolvedValue({
        simulationJobId: "sim_job_1",
        rrmRankingProposal: proposal,
        rrmSimMultiCandidateDiagnostic: diagnostic,
        shortlistBinding: { shortlistCandidateUserIds: ["cand_a", "cand_b"] },
      }),
    } as unknown as AiSimulationV1Service;
    const svc = new MatchingRrmRankingProposalService(prisma, ai);
    const out = await svc.getReadonlyProposal(viewerUserId, poolId);
    expect(out.mode).toBe("readonly");
    expect(out.sourceVersion).toBe("m4.0-readonly-rrm-ranking-proposal-v1");
    expect(out.appliedToMatchResult).toBe(false);
    expect(out.appliedToFinalScore).toBe(false);
    expect(out.appliedToDisplayCandidate).toBe(false);
    expect(out.staticTop1CandidateUserId).toBe("cand_a");
    expect(out.rrmTop1CandidateUserId).toBe("cand_b");
    expect(out.wouldChangeStaticResult).toBe(true);
    expect(out.ranking).toEqual([
      expect.objectContaining({ candidateUserId: "cand_b", rank: 1, confidence: "medium" }),
      expect.objectContaining({ candidateUserId: "cand_a", rank: 2, confidence: "medium" }),
    ]);
  });

  it("rethrows HttpException with NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL from AiSimulationV1Service", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: poolId, userId: viewerUserId, status: "active" }),
      },
    } as unknown as PrismaService;
    const ai = {
      getRrmRankingProposalReadonlyForPool: jest.fn().mockRejectedValue(
        new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: "No completed AI simulation job exists for this pool.",
            code: "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL",
          },
          HttpStatus.NOT_FOUND,
        ),
      ),
    } as unknown as AiSimulationV1Service;
    const svc = new MatchingRrmRankingProposalService(prisma, ai);
    const err = await svc.getReadonlyProposal(viewerUserId, poolId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    const res = (err as HttpException).getResponse() as Record<string, unknown>;
    expect(res.code).toBe("NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL");
  });
});
