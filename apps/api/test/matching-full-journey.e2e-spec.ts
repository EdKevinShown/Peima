import { ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { isMatchResultViewerPayload } from "../src/modules/matching/matching.service";

const execFileAsync = promisify(execFile);

function signUserToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, phone: "+8613800000000" });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function applyAllowlistEnv(userId: string): void {
  process.env.PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED = "1";
  process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS = userId;
  process.env.PEIMA_TEST_MATCH_ENABLED = "1";
  process.env.PEIMA_TEST_MATCH_USER_IDS = userId;
  process.env.PEIMA_TEST_MATCH_RESULT_WRITER_ENABLED = "1";
  process.env.PEIMA_TEST_MATCH_RESULT_WRITER_USER_IDS = userId;
}

async function pollUntilReady(
  server: import("http").Server,
  token: string,
  userId: string,
  timeoutMs: number,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await request(server)
      .get(`/matching/status/${userId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    if (res.body.status === "ready") {
      return;
    }
    await sleep(1500);
  }
  throw new Error(`matching status did not become ready within ${timeoutMs}ms`);
}

const describeOrSkip = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Full journey: seed pool → enqueue → worker batch-match → GET result.
 * Optional pressure baseline against the same Nest HTTP listener.
 *
 * Requires DATABASE_URL and monorepo layout (apps/worker). Skipped when DATABASE_URL unset.
 */
describeOrSkip("Matching full journey (e2e)", () => {
  let app: import("@nestjs/common").INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let userId: string;
  let token: string;
  let baseUrl: string;
  const envBackup = { ...process.env };

  jest.setTimeout(300_000);

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

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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
    await app.listen(0, "127.0.0.1");

    const addr = app.getHttpServer().address();
    const port =
      typeof addr === "object" && addr && "port" in addr ? addr.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = app.get(PrismaService);

    const user = await prisma.user.create({
      data: {
        phone: `+86139fj${suffix}`,
        nickname: "e2e-full-journey-viewer",
      },
    });
    userId = user.id;
    applyAllowlistEnv(userId);
    token = signUserToken(jwt, userId);

    await prisma.userProfile.create({
      data: {
        userId,
        socialEnergy: 0.5,
        emotionalExpression: 0.5,
        relationshipPace: 0.5,
        initiativeLevel: 0.5,
        decisionOrientation: 0.5,
        conflictResponse: 0.5,
        confidence: 0.8,
      },
    });
  });

  afterAll(async () => {
    process.env = envBackup;
    if (prisma && userId) {
      await prisma.matchResult.deleteMany({ where: { userId } });
      await prisma.batchMatchQueue.deleteMany({ where: { userId } });
      await prisma.previewPoolItem.deleteMany({
        where: { previewPool: { userId } },
      });
      await prisma.previewPool.deleteMany({ where: { userId } });
      await prisma.userProfile.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (app) {
      await app.close();
    }
  });

  it("seed → enqueue → batch-match → status ready → result row", async () => {
    const server = app.getHttpServer();

    await request(server)
      .post("/test/preview-pool/seed-latest")
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const enqueueRes = await request(server)
      .post("/matching/enqueue")
      .set("Authorization", `Bearer ${token}`)
      .send({ userId })
      .expect(201);

    expect(enqueueRes.body).toMatchObject({ userId, status: "waiting" });

    await request(server)
      .post("/test/matching/run-batch-once")
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await pollUntilReady(server, token, userId, 120_000);

    const resultRes = await request(server)
      .get(`/matching/result/${userId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(isMatchResultViewerPayload(resultRes.body)).toBe(true);
    if (isMatchResultViewerPayload(resultRes.body)) {
      expect(typeof resultRes.body.candidateUserId).toBe("string");
      expect(resultRes.body.candidateUserId.length).toBeGreaterThan(0);
      expect(typeof resultRes.body.finalScore).toBe("number");
    }

    const queue = await prisma.batchMatchQueue.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    expect(queue?.status).toBe("matched");
  });

  it("pressure baseline on read paths meets local success threshold", async () => {
    const script = resolve(
      __dirname,
      "../../../tools/local-pressure-baseline.mjs",
    );
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        script,
        "--baseUrl",
        baseUrl,
        "--token",
        token,
        "--userId",
        userId,
        "--concurrency",
        "10",
        "--requests",
        "60",
        "--path",
        "all",
      ],
      { cwd: resolve(__dirname, "../../.."), maxBuffer: 2 * 1024 * 1024 },
    );

    const summary = JSON.parse(stdout) as {
      successRate: number;
      p50Ms: number;
      p95Ms: number;
      fail: number;
    };
    expect(summary.fail).toBe(0);
    expect(summary.successRate).toBeGreaterThanOrEqual(99);
    expect(summary.p95Ms).toBeLessThan(30_000);
  });
});
