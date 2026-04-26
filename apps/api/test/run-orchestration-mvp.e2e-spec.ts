import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AI_SIMULATION_V1_ENQUEUE_HTTP_DEPRECATED_CODE } from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { POST_POOL_ORCHESTRATION_MVP_SCHEMA } from "../src/modules/post-pool-deep-screen/post-pool-deep-screen.constants";
import { getQuestionKeys } from "../src/modules/questionnaire/data/questions";

/**
 * POST /admin/post-pool-deep-screen/run-orchestration-mvp — minimal happy-path contract (DATABASE_URL + admin allowlist).
 * Fixture pool has a single shortlist candidate → Phase C v0 shortlist gate skips AI with `shortlist_size_lt_2` (no 6-person fallback).
 * Nest default POST success status is **201** (not 200).
 */

const ORCH_ADMIN_USER_ID = "e2e_orch_mvp_admin";

function signAdminToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, phone: "+8613800000999" });
}

function buildFullAnswers() {
  return getQuestionKeys().map((questionKey) => ({
    questionKey,
    answerValue: "A" as const,
  }));
}

const describeOrSkip = process.env.DATABASE_URL ? describe : describe.skip;

describeOrSkip("POST /admin/post-pool-deep-screen/run-orchestration-mvp (e2e contract)", () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let savedAdminIds: string | undefined;
  let poolId: string;
  let candidateId: string;

  beforeAll(async () => {
    savedAdminIds = process.env.PEIMA_ADMIN_USER_IDS;
    process.env.PEIMA_ADMIN_USER_IDS = [savedAdminIds, ORCH_ADMIN_USER_ID].filter(Boolean).join(",");

    const { AppModule } = await import("../src/app.module");

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
    const server = app.getHttpServer();

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    await prisma.previewPool.deleteMany({ where: { userId: ORCH_ADMIN_USER_ID } });
    await prisma.questionnaireAnswer.deleteMany({ where: { userId: ORCH_ADMIN_USER_ID } });
    await prisma.userProfile.deleteMany({ where: { userId: ORCH_ADMIN_USER_ID } });
    await prisma.user.deleteMany({ where: { id: ORCH_ADMIN_USER_ID } });

    await prisma.user.create({
      data: {
        id: ORCH_ADMIN_USER_ID,
        phone: `+86139orch${suffix}`,
        nickname: "e2e-orch-admin",
      },
    });

    const cand = await prisma.user.create({
      data: {
        phone: `+86139orchc${suffix}`,
        nickname: "e2e-orch-cand-no-prof",
      },
    });
    candidateId = cand.id;

    const answers = buildFullAnswers();
    const token = signAdminToken(jwt, ORCH_ADMIN_USER_ID);
    const subRes = await request(server)
      .post("/questionnaire/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: ORCH_ADMIN_USER_ID, answers })
      .expect(201);
    expect(subRes.body?.profile?.userId).toBe(ORCH_ADMIN_USER_ID);

    const pool = await prisma.previewPool.create({
      data: {
        userId: ORCH_ADMIN_USER_ID,
        status: "active",
        items: {
          create: [
            {
              userId: ORCH_ADMIN_USER_ID,
              candidateUserId: candidateId,
              candidateType: "compat",
              displayMode: "full",
              rankInPool: 1,
            },
          ],
        },
      },
    });
    poolId = pool.id;
  });

  afterAll(async () => {
    if (savedAdminIds === undefined) {
      delete process.env.PEIMA_ADMIN_USER_IDS;
    } else {
      process.env.PEIMA_ADMIN_USER_IDS = savedAdminIds;
    }

    if (prisma && poolId) {
      await prisma.previewPool.deleteMany({ where: { id: poolId } });
    }
    if (prisma && ORCH_ADMIN_USER_ID) {
      await prisma.questionnaireAnswer.deleteMany({ where: { userId: ORCH_ADMIN_USER_ID } });
      await prisma.userProfile.deleteMany({ where: { userId: ORCH_ADMIN_USER_ID } });
    }
    if (prisma && candidateId) {
      await prisma.user.deleteMany({ where: { id: candidateId } });
    }
    if (prisma) {
      await prisma.user.deleteMany({ where: { id: ORCH_ADMIN_USER_ID } });
    }
    if (app) {
      await app.close();
    }
  });

  it("returns 2xx MVP envelope: schemaVersion, skipped aiSimulation, deeplink shape", async () => {
    const token = signAdminToken(jwt, ORCH_ADMIN_USER_ID);
    const res = await request(app.getHttpServer())
      .post("/admin/post-pool-deep-screen/run-orchestration-mvp")
      .set("Authorization", `Bearer ${token}`)
      .send({
        viewerUserId: ORCH_ADMIN_USER_ID,
        poolId,
        runMode: "mvp",
      })
      .expect(201);

    const body = res.body as Record<string, unknown>;

    expect(body.schemaVersion).toBe(POST_POOL_ORCHESTRATION_MVP_SCHEMA);

    const ai = body.stages as { aiSimulation?: Record<string, unknown> } | undefined;
    expect(ai?.aiSimulation?.status).toBe("skipped");
    expect(ai?.aiSimulation?.reason).toBe("shortlist_size_lt_2");
    expect(ai?.aiSimulation?.runTriggered).toBe(false);

    const deeplink = body.deeplink as {
      finalMatchPath?: string;
      finalMatchUrl?: string;
      query?: { userId?: string; aiSimJobId?: string | null };
      ready?: boolean;
    };
    expect(deeplink?.finalMatchPath).toBe("/final-match");
    expect(typeof deeplink?.finalMatchUrl).toBe("string");
    expect(deeplink?.finalMatchUrl).toContain("/final-match");
    expect(deeplink?.query?.userId).toBe(ORCH_ADMIN_USER_ID);
    expect(deeplink?.query).toHaveProperty("aiSimJobId");
    expect(deeplink?.query?.aiSimJobId).toBeNull();
    expect(deeplink?.ready).toBe(false);
  });

  it("POST /admin/ai-simulation/v1/enqueue is retired (410 Gone)", async () => {
    const token = signAdminToken(jwt, ORCH_ADMIN_USER_ID);
    const res = await request(app.getHttpServer())
      .post("/admin/ai-simulation/v1/enqueue")
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(410);
    const raw = JSON.stringify(res.body);
    expect(res.body?.statusCode ?? res.status).toBe(410);
    expect(raw).toContain(AI_SIMULATION_V1_ENQUEUE_HTTP_DEPRECATED_CODE);
    expect(raw).toContain("run-orchestration-mvp");
  });
});
