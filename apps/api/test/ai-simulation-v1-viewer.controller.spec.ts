import { CanActivate, ExecutionContext, Injectable, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AiSimulationV1ViewerController } from "../src/modules/ai-simulation-v1/ai-simulation-v1-viewer.controller";
import { AiSimulationV1Service } from "../src/modules/ai-simulation-v1/ai-simulation-v1.service";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";

const viewerPayload = {
  simulationJobId: "job_stub",
  viewerUserId: "viewer_stub",
  jobStatus: "completed",
  poolId: "pool_stub",
  simulationQueueActual: ["a", "b"],
  hintSnapshot: {},
  results: [
    {
      candidateUserId: "a",
      status: "succeeded",
      attemptCount: 1,
      transcriptLite: {},
      evaluator: {},
      failureDetail: null,
      errorCode: null,
      rrmSimResult: { fallbackUsed: false, scores: { simulatedRhythmScore: 1 } },
    },
  ],
};

@Injectable()
class StubJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { userId: "viewer_stub" };
    return true;
  }
}

describe("AiSimulationV1ViewerController (M4.0.1)", () => {
  let app: INestApplication;
  const getJobForViewer = jest.fn().mockResolvedValue(viewerPayload);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AiSimulationV1ViewerController],
      providers: [
        {
          provide: AiSimulationV1Service,
          useValue: { getJobForViewer },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(StubJwtGuard)
      .compile();

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
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /ai-simulation/v1/jobs/:jobId delegates to getJobForViewer with JWT user id", async () => {
    const res = await request(app.getHttpServer()).get("/ai-simulation/v1/jobs/job-abc");
    expect(res.status).toBe(200);
    expect(getJobForViewer).toHaveBeenCalledWith("job-abc", "viewer_stub");
  });

  it("viewer route response is whatever getJobForViewer returns (no extra admin-only keys in controller)", async () => {
    const res = await request(app.getHttpServer()).get("/ai-simulation/v1/jobs/job-abc");
    expect(res.body).toEqual(viewerPayload);
    expect(res.body).not.toHaveProperty("rrmRankingProposal");
    expect(res.body).not.toHaveProperty("rrmSimMultiCandidateDiagnostic");
  });
});
