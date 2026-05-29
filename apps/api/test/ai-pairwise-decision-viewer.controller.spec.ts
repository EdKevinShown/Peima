import { Test } from "@nestjs/testing";
import { UnauthorizedException, NotFoundException } from "@nestjs/common";
import { AiPairwiseDecisionViewerController } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-viewer.controller";
import { AiPairwiseDecisionJobService } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.service";
import { mapPairwiseJobPublicToViewerDto } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-viewer.mapper";
import { AI_PAIRWISE_DECISION_JOB_STATUS } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.constants";
import { AI_PAIRWISE_DECISION_SOURCE_VERSION } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.schema";
import type { PairwiseDecisionJobPublicDto } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.service";

function publicJob(over: Partial<PairwiseDecisionJobPublicDto> = {}): PairwiseDecisionJobPublicDto {
  return {
    id: "job-1",
    viewerUserId: "user-a",
    poolId: "pool-1",
    shortlistFingerprint: "fp",
    status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED,
    sourceVersion: AI_PAIRWISE_DECISION_SOURCE_VERSION,
    shortlistSnapshot: {
      schemaVersion: 1,
      sourceVersion: "relationship-shortlist-top2-v1",
      viewerUserId: "user-a",
      poolId: "pool-1",
      shortlistFingerprint: "fp",
      candidates: [
        {
          candidateUserId: "c1",
          staticRank: 1,
          staticCompatibilityScore: 90,
          axisScoresSummary: { x: 0.9 },
          majorStrengths: ["a"],
          majorRisks: ["r1"],
          dealbreakerPassed: true,
          reasonSummary: "R1",
        },
        {
          candidateUserId: "c2",
          staticRank: 2,
          staticCompatibilityScore: 70,
          axisScoresSummary: { x: 0.5 },
          majorStrengths: [],
          majorRisks: [],
          dealbreakerPassed: true,
          reasonSummary: "R2",
        },
      ],
      generatedAt: "2026-05-01T12:00:00.000Z",
    },
    decisionResult: null,
    failureDetail: null,
    fallbackUsed: null,
    finalSourceShadow: null,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    ...over,
  };
}

describe("AiPairwiseDecisionViewerController", () => {
  let jobService: {
    createOrReusePairwiseDecisionJob: jest.Mock;
    getPairwiseDecisionJobForViewer: jest.Mock;
    requestViewerAsyncRunPairwiseDecisionJob: jest.Mock;
  };
  let ctrl: AiPairwiseDecisionViewerController;

  beforeEach(async () => {
    jobService = {
      createOrReusePairwiseDecisionJob: jest.fn(),
      getPairwiseDecisionJobForViewer: jest.fn(),
      requestViewerAsyncRunPairwiseDecisionJob: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      controllers: [AiPairwiseDecisionViewerController],
      providers: [{ provide: AiPairwiseDecisionJobService, useValue: jobService }],
    }).compile();
    ctrl = mod.get(AiPairwiseDecisionViewerController);
  });

  it("create uses JWT userId only (poolId from body)", async () => {
    const job = publicJob();
    jobService.createOrReusePairwiseDecisionJob.mockResolvedValue({ reused: false, job });
    const out = await ctrl.createJob({ user: { userId: "jwt-user" } } as never, { poolId: "pool-x" } as never);
    expect(jobService.createOrReusePairwiseDecisionJob).toHaveBeenCalledWith({
      viewerUserId: "jwt-user",
      poolId: "pool-x",
    });
    expect(out.job.viewerUserId).toBe("user-a");
    expect(out.job.poolId).toBe("pool-1");
  });

  it("create only needs poolId in contract (no body userId)", async () => {
    jobService.createOrReusePairwiseDecisionJob.mockResolvedValue({ reused: true, job: publicJob() });
    await ctrl.createJob({ user: { userId: "u1" } } as never, { poolId: "p" } as never);
    expect(jobService.createOrReusePairwiseDecisionJob).toHaveBeenCalledWith({ viewerUserId: "u1", poolId: "p" });
  });

  it("get own job returns viewer-safe DTO", async () => {
    const job = publicJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED, decisionResult: null });
    jobService.getPairwiseDecisionJobForViewer.mockResolvedValue(job);
    const out = await ctrl.getJob({ user: { userId: "user-a" } } as never, "job-1");
    expect(jobService.getPairwiseDecisionJobForViewer).toHaveBeenCalledWith("job-1", "user-a");
    expect(out.id).toBe("job-1");
    expect(out.shortlist.candidates).toHaveLength(2);
    expect(out.shortlist.candidates[0]).toEqual({
      candidateUserId: "c1",
      staticRank: 1,
      staticCompatibilityScore: 90,
      reasonSummary: "R1",
    });
  });

  it("get another user's job → NotFound from service", async () => {
    jobService.getPairwiseDecisionJobForViewer.mockRejectedValue(new NotFoundException());
    await expect(ctrl.getJob({ user: { userId: "intruder" } } as never, "job-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("run own queued job returns enqueued_for_worker", async () => {
    jobService.requestViewerAsyncRunPairwiseDecisionJob.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      jobStatus: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED,
      started: false,
      reason: "enqueued_for_worker",
    });
    const out = await ctrl.runJob({ user: { userId: "user-a" } } as never, "job-1");
    expect(jobService.requestViewerAsyncRunPairwiseDecisionJob).toHaveBeenCalledWith("job-1", "user-a");
    expect(out.reason).toBe("enqueued_for_worker");
  });

  it("run running → already_running", async () => {
    jobService.requestViewerAsyncRunPairwiseDecisionJob.mockResolvedValue({
      ok: true,
      jobId: "j",
      jobStatus: AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING,
      started: false,
      reason: "already_running",
    });
    const out = await ctrl.runJob({ user: { userId: "u" } } as never, "j");
    expect(out.reason).toBe("already_running");
  });

  it("run succeeded → already_completed", async () => {
    jobService.requestViewerAsyncRunPairwiseDecisionJob.mockResolvedValue({
      ok: true,
      jobId: "j",
      jobStatus: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED,
      started: false,
      reason: "already_completed",
    });
    const out = await ctrl.runJob({ user: { userId: "u" } } as never, "j");
    expect(out.reason).toBe("already_completed");
  });

  it("run failed → failed_not_reusable", async () => {
    jobService.requestViewerAsyncRunPairwiseDecisionJob.mockResolvedValue({
      ok: true,
      jobId: "j",
      jobStatus: AI_PAIRWISE_DECISION_JOB_STATUS.FAILED,
      started: false,
      reason: "failed_not_reusable",
    });
    const out = await ctrl.runJob({ user: { userId: "u" } } as never, "j");
    expect(out.reason).toBe("failed_not_reusable");
  });

  it("viewer DTO excludes raw dimensions / axisScores / majorRisks / scores", () => {
    const job = publicJob({
      status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED,
      decisionResult: {
        schemaVersion: 1,
        sourceVersion: "rrm-lite-pairwise-decision-v1",
        viewerUserId: "user-a",
        poolId: "pool-1",
        candidateAUserId: "c1",
        candidateBUserId: "c2",
        winnerCandidateId: "c1",
        loserCandidateId: "c2",
        decisionConfidence: 0.8,
        decisionScoreA: 88,
        decisionScoreB: 60,
        dimensions: {
          conversationFit: 0.9,
          emotionalSafety: 0.8,
          conflictRepair: 0.7,
          progressionFit: 0.7,
          longTermFit: 0.7,
          riskControl: 0.7,
        },
        candidateA: {
          conversationFit: 0.8,
          emotionalSafety: 0.8,
          conflictRepair: 0.7,
          progressionFit: 0.7,
          longTermFit: 0.7,
          riskControl: 0.7,
          strongRisk: false,
          suggestedAction: "maintain",
          progressionWindow: "open",
          reasonSummary: "A ok",
        },
        candidateB: {
          conversationFit: 0.6,
          emotionalSafety: 0.6,
          conflictRepair: 0.6,
          progressionFit: 0.6,
          longTermFit: 0.6,
          riskControl: 0.6,
          strongRisk: true,
          suggestedAction: "maintain",
          progressionWindow: "open",
          reasonSummary: "B",
        },
        decisionReason: "pair",
        fallbackUsed: false,
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
        generatedAt: "2026-05-01T12:01:00.000Z",
      },
    });
    const v = mapPairwiseJobPublicToViewerDto(job);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/decisionScore|"dimensions"|axisScoresSummary|majorRisks|conversationFit/);
    expect(v.decision?.winnerCandidateId).toBe("c1");
    expect((v.decision?.candidateB as { strongRisk?: boolean }).strongRisk).toBeUndefined();
  });

  it("viewer failure omits path / expected / actual / reason detail", () => {
    const job = publicJob({
      status: AI_PAIRWISE_DECISION_JOB_STATUS.FAILED,
      failureDetail: {
        code: "schema_validation",
        message: "bad",
        path: "root.x",
        reason: "nope",
        expected: "1",
        actual: "2",
      },
    });
    const v = mapPairwiseJobPublicToViewerDto(job);
    expect(v.failure).toEqual({ code: "schema_validation", message: "bad" });
    expect(v.failure).not.toHaveProperty("path");
    expect(v.failure).not.toHaveProperty("expected");
    expect(v.failure).not.toHaveProperty("actual");
    expect(v.failure).not.toHaveProperty("reason");
  });

  it("unauthenticated create throws", async () => {
    await expect(ctrl.createJob({ user: {} } as never, { poolId: "p" } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("jobService is not MatchResult / generateAiPairwiseDecision", () => {
    expect(jobService.createOrReusePairwiseDecisionJob).toBeDefined();
    expect((jobService as { matchResult?: unknown }).matchResult).toBeUndefined();
    expect((jobService as { generateAiPairwiseDecision?: unknown }).generateAiPairwiseDecision).toBeUndefined();
  });
});
