import { ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";

/**
 * GET /chat/conversations/:conversationId/timeline — contract regression (P3-1).
 * Requires DATABASE_URL (PostgreSQL with migrations applied).
 */

function signUserToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, phone: "+8613800000000" });
}

describe("Chat timeline (e2e)", () => {
  let app: import("@nestjs/common").INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  let viewerId: string;
  let candidateId: string;
  let outsiderId: string;
  let conversationId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is required for chat-timeline e2e (point at a dev/test Postgres with migrations applied).",
      );
    }

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
        phone: `+86138e2e${suffix}01`,
        nickname: "e2e-viewer",
      },
    });
    const candidate = await prisma.user.create({
      data: {
        phone: `+86138e2e${suffix}02`,
        nickname: "e2e-candidate",
      },
    });
    const outsider = await prisma.user.create({
      data: {
        phone: `+86138e2e${suffix}03`,
        nickname: "e2e-outsider",
      },
    });

    viewerId = viewer.id;
    candidateId = candidate.id;
    outsiderId = outsider.id;

    const conv = await prisma.conversation.create({
      data: {
        viewerUserId: viewerId,
        candidateUserId: candidateId,
        status: "active",
      },
    });
    conversationId = conv.id;

    await prisma.userFeedback.create({
      data: {
        userId: viewerId,
        subjectKind: "conversation",
        subjectId: conversationId,
        sourceType: "rule_based",
        sourceVersion: "e2e-v1",
        rating: 4,
        tags: [],
        comment: "viewer feedback on this conversation",
        recordedAt: new Date(),
      },
    });

    await prisma.userFeedback.create({
      data: {
        userId: candidateId,
        subjectKind: "conversation",
        subjectId: conversationId,
        sourceType: "rule_based",
        sourceVersion: "e2e-v1",
        rating: 2,
        tags: [],
        comment: "candidate feedback — must not appear on viewer timeline",
        recordedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (prisma && conversationId) {
      await prisma.conversation.deleteMany({ where: { id: conversationId } });
    }
    if (prisma && viewerId && candidateId && outsiderId) {
      await prisma.user.deleteMany({
        where: { id: { in: [viewerId, candidateId, outsiderId] } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  it("rejects without Authorization (401)", async () => {
    await request(app.getHttpServer())
      .get(`/chat/conversations/${conversationId}/timeline`)
      .expect(401);
  });

  it("returns 404 for non-existent conversationId", async () => {
    const token = signUserToken(jwt, viewerId);
    await request(app.getHttpServer())
      .get("/chat/conversations/clxxxxxxxxxxxxxxxxxxxxxxxx/timeline")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("rejects non-participant with 401", async () => {
    const token = signUserToken(jwt, outsiderId);
    await request(app.getHttpServer())
      .get(`/chat/conversations/${conversationId}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("returns 200 with contract shape and conversation_opened for participant (viewer)", async () => {
    const token = signUserToken(jwt, viewerId);
    const res = await request(app.getHttpServer())
      .get(`/chat/conversations/${conversationId}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      conversationId?: string;
      generatedAt?: string;
      items?: Array<{ type?: string; id?: string }>;
      messagePagination?: { skip: number; limit: number; hasMore: boolean };
    };

    expect(body.conversationId).toBe(conversationId);
    expect(typeof body.generatedAt).toBe("string");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items!.length).toBeGreaterThan(0);

    const opened = body.items!.find((i) => i.type === "conversation_opened");
    expect(opened).toBeDefined();
    expect(opened!.id).toContain("conversation_opened:");

    expect(body.messagePagination).toMatchObject({
      skip: 0,
      limit: 200,
      hasMore: false,
    });
  });

  it("rejects invalid messageSkip with 400 (P3-3)", async () => {
    const token = signUserToken(jwt, viewerId);
    await request(app.getHttpServer())
      .get(`/chat/conversations/${conversationId}/timeline?messageSkip=abc`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("messageSkip>0 returns only message slice with no conversation_opened (P3-3)", async () => {
    const token = signUserToken(jwt, viewerId);
    const res = await request(app.getHttpServer())
      .get(`/chat/conversations/${conversationId}/timeline?messageSkip=200`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      items?: Array<{ type?: string }>;
      messagePagination?: { skip: number; limit: number; hasMore: boolean };
    };
    expect(body.items).toEqual([]);
    expect(body.messagePagination).toMatchObject({
      skip: 200,
      limit: 200,
      hasMore: false,
    });
    const opened = body.items!.find((i) => i.type === "conversation_opened");
    expect(opened).toBeUndefined();
  });

  it("includes only current user feedback_on_conversation for that conversation (viewer)", async () => {
    const token = signUserToken(jwt, viewerId);
    const res = await request(app.getHttpServer())
      .get(`/chat/conversations/${conversationId}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const items = res.body.items as Array<{ type: string; detail?: string }>;
    const feedbackItems = items.filter((i) => i.type === "feedback_on_conversation");
    expect(feedbackItems).toHaveLength(1);
    expect(feedbackItems[0].detail).toContain("viewer feedback");

    const candidateLeak = items.some(
      (i) =>
        i.type === "feedback_on_conversation" &&
        String(i.detail).includes("candidate feedback"),
    );
    expect(candidateLeak).toBe(false);
  });

  it("candidate participant sees only their own feedback_on_conversation", async () => {
    const token = signUserToken(jwt, candidateId);
    const res = await request(app.getHttpServer())
      .get(`/chat/conversations/${conversationId}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const items = res.body.items as Array<{ type: string; detail?: string }>;
    const feedbackItems = items.filter((i) => i.type === "feedback_on_conversation");
    expect(feedbackItems).toHaveLength(1);
    expect(feedbackItems[0].detail).toContain("candidate feedback");
  });
});
