import { ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";

function signUserToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, phone: "+8613800000000" });
}

/**
 * Integration smoke for dev-only test hooks and core matching read APIs.
 * Requires DATABASE_URL (same as other e2e specs).
 */
describe("Dev smoke hooks and matching read path (e2e)", () => {
  let app: import("@nestjs/common").INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let userId: string;
  const envBackup = { ...process.env };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for test-dev-smoke-hooks e2e.");
    }

    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED = "1";
    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS = "";
    process.env.PEIMA_TEST_MATCH_ENABLED = "1";
    process.env.PEIMA_TEST_MATCH_USER_IDS = "";

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
    const user = await prisma.user.create({
      data: {
        phone: `+86139smoke${suffix}`,
        nickname: "e2e-smoke-viewer",
      },
    });
    userId = user.id;

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

    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS = userId;
    process.env.PEIMA_TEST_MATCH_USER_IDS = userId;
  });

  afterAll(async () => {
    process.env = envBackup;
    if (app) {
      await app.close();
    }
  });

  it("GET /test/matching/capabilities returns allowlisted flags", async () => {
    const token = signUserToken(jwt, userId);
    const res = await request(app.getHttpServer())
      .get("/test/matching/capabilities")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      testBatchMatchTrigger: true,
      testPreviewPoolSeed: true,
    });
  });

  it("POST /test/preview-pool/seed-latest creates active pool", async () => {
    const token = signUserToken(jwt, userId);
    const res = await request(app.getHttpServer())
      .post("/test/preview-pool/seed-latest")
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(res.body.previewPool).toMatchObject({ status: "active" });
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(6);
  });

  it("GET /preview-pool/user/:userId/latest returns seeded pool", async () => {
    const token = signUserToken(jwt, userId);
    const res = await request(app.getHttpServer())
      .get(`/preview-pool/user/${userId}/latest`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.previewPool.status).toBe("active");
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /matching/status/:userId returns queue state", async () => {
    const token = signUserToken(jwt, userId);
    const res = await request(app.getHttpServer())
      .get(`/matching/status/${userId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(["not_queued", "waiting", "processing", "ready", "failed"]).toContain(
      res.body.status,
    );
    expect(typeof res.body.userMessage).toBe("string");
    expect(res.body.userMessage.length).toBeGreaterThan(0);
  });
});
