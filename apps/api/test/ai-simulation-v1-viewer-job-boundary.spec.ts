import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  AI_SIMULATION_RUN_SPEC_V1,
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
  ITEM_STATUS,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION } from "../src/modules/preview-pool/preview-pool-shortlist-contract.v0";

function signUserToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, phone: "+8613800000000" });
}

function firstAdminUserIdFromEnv(): string | undefined {
  const raw = (process.env.PEIMA_ADMIN_USER_IDS ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return raw[0];
}

/** AdminService allowlist is parsed at module init — mutating env after AppModule boot does not refresh it; use an id already in PEIMA_ADMIN_USER_IDS. */
const hasDb = Boolean(process.env.DATABASE_URL?.trim());
const hasAdminAllowlist = Boolean(firstAdminUserIdFromEnv());
const describeDb = hasDb && hasAdminAllowlist ? describe : describe.skip;

describeDb("M4.0.1 AI simulation viewer vs admin job boundary (integration)", () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let adminTokenSub: string;
  let viewerId: string;
  let strangerId: string;
  let candA: string;
  let candB: string;
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
    adminTokenSub = firstAdminUserIdFromEnv() as string;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    viewerId = (
      await prisma.user.create({
        data: { phone: `+86138m401v${suffix}`, nickname: "m401-viewer" },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { phone: `+86138m401s${suffix}`, nickname: "m401-stranger" },
      })
    ).id;
    candA = (
      await prisma.user.create({
        data: { phone: `+86138m401c1${suffix}`, nickname: "m401-c1" },
      })
    ).id;
    candB = (
      await prisma.user.create({
        data: { phone: `+86138m401c2${suffix}`, nickname: "m401-c2" },
      })
    ).id;

    const poolId = `pool_m401_${suffix}`;
    const binding = {
      previewPoolId: poolId,
      shortlistSchemaVersion: PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION,
      shortlistFingerprint: `fp_m401_${suffix}`,
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
        jobStatus: "completed",
      },
    });
    jobId = job.id;

    await prisma.aiSimulationV1Item.createMany({
      data: [
        {
          jobId,
          candidateUserId: candA,
          status: ITEM_STATUS.QUEUED,
          attemptCount: 0,
        },
        {
          jobId,
          candidateUserId: candB,
          status: ITEM_STATUS.QUEUED,
          attemptCount: 0,
        },
      ],
    });
  });

  afterAll(async () => {
    if (prisma && jobId) {
      await prisma.aiSimulationV1Item.deleteMany({ where: { jobId } });
      await prisma.aiSimulationV1Job.deleteMany({ where: { id: jobId } });
    }
    if (prisma) {
      await prisma.user.deleteMany({
        where: { id: { in: [viewerId, strangerId, candA, candB].filter(Boolean) } },
      });
    }
    await app?.close();
  });

  it("admin GET includes rrmRankingProposal and rrmSimMultiCandidateDiagnostic", async () => {
    const server = app.getHttpServer();
    const adminRes = await request(server)
      .get(`/admin/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}`)
      .set("Authorization", `Bearer ${signUserToken(jwt, adminTokenSub)}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body).toHaveProperty("rrmRankingProposal");
    expect(adminRes.body).toHaveProperty("rrmSimMultiCandidateDiagnostic");
    expect(adminRes.body.rrmRankingProposal?.appliedToFinalScore).toBe(false);
    expect(adminRes.body.rrmRankingProposal?.appliedToWorkerRanking).toBe(false);
  });

  it("viewer GET omits rrmRankingProposal and rrmSimMultiCandidateDiagnostic", async () => {
    const server = app.getHttpServer();
    const viewerRes = await request(server)
      .get(`/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}`)
      .set("Authorization", `Bearer ${signUserToken(jwt, viewerId)}`);
    expect(viewerRes.status).toBe(200);
    expect(viewerRes.body).not.toHaveProperty("rrmRankingProposal");
    expect(viewerRes.body).not.toHaveProperty("rrmSimMultiCandidateDiagnostic");
    expect(viewerRes.body).toHaveProperty("results");
    expect(viewerRes.body.simulationJobId).toBe(jobId);
  });

  it("viewer GET returns 404 for non-owner", async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .get(`/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}`)
      .set("Authorization", `Bearer ${signUserToken(jwt, strangerId)}`);
    expect(res.status).toBe(404);
  });
});
