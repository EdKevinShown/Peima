import { ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";

function signUserToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, phone: "+8613800000000" });
}

describe("Profile suggestions and chat summary hardening (e2e)", () => {
  let app: import("@nestjs/common").INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  let viewerId: string;
  let candidateId: string;
  let conversationId: string;
  let suggestionId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is required for profile-suggestion-summary e2e.",
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
        phone: `+86139e2e${suffix}01`,
        nickname: "e2e-viewer-profile",
      },
    });
    const candidate = await prisma.user.create({
      data: {
        phone: `+86139e2e${suffix}02`,
        nickname: "e2e-candidate-profile",
      },
    });

    viewerId = viewer.id;
    candidateId = candidate.id;

    const conversation = await prisma.conversation.create({
      data: {
        viewerUserId: viewerId,
        candidateUserId: candidateId,
        status: "active",
      },
    });
    conversationId = conversation.id;

    const suggestion = await prisma.profileUpdateSuggestion.create({
      data: {
        userId: viewerId,
        status: "pending",
        sourceType: "rule_based",
        sourceVersion: "e2e-v1",
        proposedPatch: {
          socialEnergy: 0.82,
          confidence: 0.64,
        },
      },
    });
    suggestionId = suggestion.id;
  });

  afterAll(async () => {
    if (prisma && conversationId) {
      await prisma.conversation.deleteMany({ where: { id: conversationId } });
    }
    if (prisma && suggestionId) {
      await prisma.profileUpdateSuggestion.deleteMany({
        where: { id: suggestionId },
      });
    }
    if (prisma && viewerId) {
      await prisma.userProfile.deleteMany({ where: { userId: viewerId } });
    }
    if (prisma && viewerId && candidateId) {
      await prisma.user.deleteMany({
        where: { id: { in: [viewerId, candidateId] } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  it("accepts a pending profile suggestion once and rejects later processing with 409", async () => {
    const token = signUserToken(jwt, viewerId);

    const acceptRes = await request(app.getHttpServer())
      .post(`/profile-suggestions/${suggestionId}/accept`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(acceptRes.body).toMatchObject({
      id: suggestionId,
      userId: viewerId,
      status: "accepted",
    });

    const userProfile = await prisma.userProfile.findUnique({
      where: { userId: viewerId },
    });
    expect(userProfile).toMatchObject({
      userId: viewerId,
      socialEnergy: 0.82,
      confidence: 0.64,
    });

    await request(app.getHttpServer())
      .post(`/profile-suggestions/${suggestionId}/dismiss`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
  });

  it("reuses the latest persisted chat summary when no new messages arrived", async () => {
    const token = signUserToken(jwt, viewerId);

    const first = await request(app.getHttpServer())
      .post(`/chat/conversations/${conversationId}/summary/generate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(first.body.persisted).toBe(true);

    const countAfterFirst = await prisma.conversationSummary.count({
      where: { conversationId },
    });
    expect(countAfterFirst).toBe(1);

    const second = await request(app.getHttpServer())
      .post(`/chat/conversations/${conversationId}/summary/generate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(second.body).toMatchObject({
      persisted: true,
      generatedAt: first.body.generatedAt,
      summary: first.body.summary,
      chatStageHint: first.body.chatStageHint,
    });

    const countAfterSecond = await prisma.conversationSummary.count({
      where: { conversationId },
    });
    expect(countAfterSecond).toBe(1);

    await prisma.message.create({
      data: {
        conversationId,
        senderUserId: viewerId,
        content: "hello after first summary",
      },
    });

    const third = await request(app.getHttpServer())
      .post(`/chat/conversations/${conversationId}/summary/generate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(third.body.persisted).toBe(true);
    expect(third.body.generatedAt).not.toBe(first.body.generatedAt);

    const countAfterThird = await prisma.conversationSummary.count({
      where: { conversationId },
    });
    expect(countAfterThird).toBe(2);
  });
});
