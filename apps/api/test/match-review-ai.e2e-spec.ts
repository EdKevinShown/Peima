import { ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { getQuestionKeys } from "../src/modules/questionnaire/data/questions";

/**
 * POST /match-review-ai/review — contract + main chain (with DATABASE_URL).
 * Rule-only path: forces MATCH_REVIEW_AI_ENABLED=0 (no real LLM).
 */

function signUserToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, phone: "+8613800000000" });
}

function buildFullAnswers() {
  return getQuestionKeys().map((questionKey) => ({
    questionKey,
    answerValue: "A" as const,
  }));
}

describe("Match Review AI (e2e)", () => {
  let app: import("@nestjs/common").INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  let viewerId: string;
  let candidateId: string;
  let wrongCandidateId: string;
  let batchId: string;
  let savedMatchReviewAiEnabled: string | undefined;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is required for match-review-ai e2e (PostgreSQL with migrations applied).",
      );
    }

    savedMatchReviewAiEnabled = process.env.MATCH_REVIEW_AI_ENABLED;
    process.env.MATCH_REVIEW_AI_ENABLED = "0";

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
    const viewer = await prisma.user.create({
      data: {
        phone: `+86138mr${suffix}01`,
        nickname: "e2e-mr-viewer",
      },
    });
    const candidate = await prisma.user.create({
      data: {
        phone: `+86138mr${suffix}02`,
        nickname: "e2e-mr-candidate",
      },
    });
    const wrong = await prisma.user.create({
      data: {
        phone: `+86138mr${suffix}03`,
        nickname: "e2e-mr-wrong",
      },
    });

    viewerId = viewer.id;
    candidateId = candidate.id;
    wrongCandidateId = wrong.id;

    const answers = buildFullAnswers();
    const server = app.getHttpServer();

    for (const uid of [viewerId, candidateId]) {
      const token = signUserToken(jwt, uid);
      const res = await request(server)
        .post("/questionnaire/submit")
        .set("Authorization", `Bearer ${token}`)
        .send({ userId: uid, answers })
        .expect(201);
      expect(res.body?.profile?.userId).toBe(uid);
    }

    const batch = await prisma.matchBatch.create({
      data: {
        batchDate: new Date(),
        status: "completed",
        totalUsers: 1,
        successCount: 1,
        failedCount: 0,
      },
    });
    batchId = batch.id;

    await prisma.matchResult.create({
      data: {
        userId: viewerId,
        candidateUserId: candidateId,
        batchId,
        finalScore: 0.72,
        reasonSummary: "e2e match review seed",
        status: "ready",
      },
    });
  });

  afterAll(async () => {
    if (savedMatchReviewAiEnabled === undefined) {
      delete process.env.MATCH_REVIEW_AI_ENABLED;
    } else {
      process.env.MATCH_REVIEW_AI_ENABLED = savedMatchReviewAiEnabled;
    }

    if (prisma && viewerId) {
      await prisma.matchResult.deleteMany({ where: { userId: viewerId } });
    }
    if (prisma && batchId) {
      await prisma.matchBatch.deleteMany({ where: { id: batchId } });
    }
    if (prisma && viewerId && candidateId) {
      await prisma.questionnaireAnswer.deleteMany({
        where: { userId: { in: [viewerId, candidateId] } },
      });
      await prisma.userProfile.deleteMany({
        where: { userId: { in: [viewerId, candidateId] } },
      });
    }
    if (prisma && viewerId && candidateId && wrongCandidateId) {
      await prisma.user.deleteMany({
        where: { id: { in: [viewerId, candidateId, wrongCandidateId] } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  it("POST /match-review-ai/review without JWT returns 401", async () => {
    await request(app.getHttpServer())
      .post("/match-review-ai/review")
      .send({ candidateUserId: "some-candidate-id" })
      .expect(401);
  });

  it("POST /match-review-ai/review returns 201 with aiReview when candidate matches latest MatchResult (rule-only)", async () => {
    const token = signUserToken(jwt, viewerId);
    const res = await request(app.getHttpServer())
      .post("/match-review-ai/review")
      .set("Authorization", `Bearer ${token}`)
      .send({ candidateUserId: candidateId })
      .expect(201);

    const body = res.body as {
      viewerUserId?: string;
      candidateUserId?: string;
      reviewStaticScore?: number;
      aiReview?: {
        finalScore?: number;
        recommendation?: string;
        strengths?: unknown[];
        risks?: unknown[];
        explanation?: string;
        confidence?: string;
      };
      debug?: {
        sourceType?: string;
        fallbackUsed?: boolean;
        meta?: { reason?: string };
      };
    };

    expect(body.viewerUserId).toBe(viewerId);
    expect(body.candidateUserId).toBe(candidateId);
    expect(typeof body.reviewStaticScore).toBe("number");
    expect(body.aiReview).toBeDefined();
    expect(typeof body.aiReview?.finalScore).toBe("number");
    expect(typeof body.aiReview?.recommendation).toBe("string");
    expect(Array.isArray(body.aiReview?.strengths)).toBe(true);
    expect(Array.isArray(body.aiReview?.risks)).toBe(true);
    expect(typeof body.aiReview?.explanation).toBe("string");
    expect(typeof body.aiReview?.confidence).toBe("string");

    expect(body.debug?.fallbackUsed).toBe(false);
    expect(body.debug?.sourceType).toBe("match_review_rule_based");
    expect(body.debug?.meta?.reason).toBe("disabled");
  });

  it("POST /match-review-ai/review returns 403 when candidateUserId does not match latest MatchResult", async () => {
    const token = signUserToken(jwt, viewerId);
    await request(app.getHttpServer())
      .post("/match-review-ai/review")
      .set("Authorization", `Bearer ${token}`)
      .send({ candidateUserId: wrongCandidateId })
      .expect(403);
  });
});
