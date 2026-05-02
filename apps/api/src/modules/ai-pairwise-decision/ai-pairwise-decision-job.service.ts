import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AI_PAIRWISE_DECISION_SOURCE_VERSION } from "./ai-pairwise-decision.schema";
import type { AiPairwiseDecision, RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";
import { parseAndValidateAiPairwiseDecision, parseAndValidateRelationshipShortlistTop2 } from "./ai-pairwise-decision.validate";
import { AiPairwiseDecisionService, type GenerateAiPairwiseDecisionFailureDetail } from "./ai-pairwise-decision.service";
import { AiPairwiseTop2ShortlistService, RelationshipShortlistTop2Error } from "./ai-pairwise-top2-shortlist.service";
import {
  AI_PAIRWISE_DECISION_JOB_REUSABLE_STATUSES,
  AI_PAIRWISE_DECISION_JOB_STATUS,
} from "./ai-pairwise-decision-job.constants";
import { executeClaimedAiPairwiseDecisionJob } from "./ai-pairwise-decision-job-execution";
import type { PairwiseFinalSourceShadowRecord } from "./ai-pairwise-final-source-shadow";

/** DB row shape for `ai_pairwise_decision_jobs` (Prisma client picks this up after `prisma generate`). */
export type AiPairwiseDecisionJobRow = {
  id: string;
  viewerUserId: string;
  poolId: string;
  shortlistFingerprint: string;
  status: string;
  sourceVersion: string;
  shortlistSnapshot: unknown;
  decisionResult: unknown | null;
  failureDetail: unknown | null;
  fallbackUsed: boolean | null;
  finalSourceShadow?: unknown | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AiPairwiseDecisionJobDelegate = {
  findFirst(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc">;
  }): Promise<AiPairwiseDecisionJobRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<AiPairwiseDecisionJobRow>;
  findUnique(args: { where: { id: string } }): Promise<AiPairwiseDecisionJobRow | null>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<AiPairwiseDecisionJobRow>;
  updateMany(args: {
    where: { id: string; status?: string };
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<AiPairwiseDecisionJobRow>;
};

export type PairwiseDecisionJobPublicDto = {
  id: string;
  viewerUserId: string;
  poolId: string;
  shortlistFingerprint: string;
  status: string;
  sourceVersion: string;
  shortlistSnapshot: RelationshipShortlistTop2;
  decisionResult: AiPairwiseDecision | null;
  failureDetail: GenerateAiPairwiseDecisionFailureDetail | null;
  fallbackUsed: boolean | null;
  /** M3.8-M9: admin-only shadow record; omitted (null) for viewer reads. */
  finalSourceShadow: PairwiseFinalSourceShadowRecord | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
};

export type CreateOrReusePairwiseDecisionJobResult = {
  reused: boolean;
  job: PairwiseDecisionJobPublicDto;
};

export type RunPairwiseDecisionJobOutcome =
  | "ran"
  | "already_completed"
  | "already_running"
  | "failed_not_reusable"
  | "invalid_state";

export type RunPairwiseDecisionJobResult = {
  outcome: RunPairwiseDecisionJobOutcome;
  job: PairwiseDecisionJobPublicDto;
};

export type RequestAdminRunPairwiseDecisionJobReason =
  | "enqueued_for_worker"
  | "already_running"
  | "already_completed"
  | "failed_not_reusable"
  | "invalid_state";

export type RequestAdminRunPairwiseDecisionJobResponse = {
  ok: true;
  jobId: string;
  jobStatus: string;
  started: false;
  reason: RequestAdminRunPairwiseDecisionJobReason;
};

@Injectable()
export class AiPairwiseDecisionJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly top2: AiPairwiseTop2ShortlistService,
    private readonly pairwise: AiPairwiseDecisionService,
  ) {}

  private db(): AiPairwiseDecisionJobDelegate {
    return (this.prisma as unknown as { aiPairwiseDecisionJob: AiPairwiseDecisionJobDelegate }).aiPairwiseDecisionJob;
  }

  async createOrReusePairwiseDecisionJob(params: {
    viewerUserId: string;
    poolId: string;
  }): Promise<CreateOrReusePairwiseDecisionJobResult> {
    let shortlist: RelationshipShortlistTop2;
    try {
      shortlist = await this.top2.buildRelationshipShortlistTop2({
        viewerUserId: params.viewerUserId,
        poolId: params.poolId,
      });
    } catch (e) {
      if (e instanceof RelationshipShortlistTop2Error) {
        throw new ConflictException({ code: e.code, message: e.message });
      }
      throw e;
    }

    const snap = parseAndValidateRelationshipShortlistTop2(shortlist);
    if (!snap.ok) {
      throw new ConflictException({
        code: "shortlist_contract_invalid",
        message: `${snap.failureDetail.path}: ${snap.failureDetail.reason}`,
      });
    }

    const fp = snap.value.shortlistFingerprint ?? "";
    const sourceVersion = AI_PAIRWISE_DECISION_SOURCE_VERSION;

    const existing = await this.db().findFirst({
      where: {
        viewerUserId: params.viewerUserId,
        poolId: params.poolId,
        shortlistFingerprint: fp,
        sourceVersion,
        status: { in: [...AI_PAIRWISE_DECISION_JOB_REUSABLE_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return { reused: true, job: await this.toPublicDto(existing, { exposeFinalSourceShadow: false }) };
    }

    const row = await this.db().create({
      data: {
        viewerUserId: params.viewerUserId,
        poolId: params.poolId,
        shortlistFingerprint: fp,
        status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED,
        sourceVersion,
        shortlistSnapshot: snap.value as unknown as Prisma.InputJsonValue,
      },
    });

    return { reused: false, job: await this.toPublicDto(row, { exposeFinalSourceShadow: false }) };
  }

  /**
   * M3.8-M4A: admin HTTP — fast return; worker claims `queued` jobs and runs LLM.
   */
  async requestAdminRunPairwiseDecisionJob(jobId: string): Promise<RequestAdminRunPairwiseDecisionJobResponse> {
    const current = await this.db().findUnique({ where: { id: jobId } });
    if (!current) {
      throw new NotFoundException(`AiPairwiseDecisionJob not found: ${jobId}`);
    }

    if (current.status === AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED) {
      return {
        ok: true,
        jobId,
        jobStatus: current.status,
        started: false,
        reason: "already_completed",
      };
    }
    if (current.status === AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING) {
      return {
        ok: true,
        jobId,
        jobStatus: current.status,
        started: false,
        reason: "already_running",
      };
    }
    if (current.status === AI_PAIRWISE_DECISION_JOB_STATUS.FAILED) {
      return {
        ok: true,
        jobId,
        jobStatus: current.status,
        started: false,
        reason: "failed_not_reusable",
      };
    }
    if (current.status === AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED) {
      return {
        ok: true,
        jobId,
        jobStatus: current.status,
        started: false,
        reason: "enqueued_for_worker",
      };
    }

    return {
      ok: true,
      jobId,
      jobStatus: current.status,
      started: false,
      reason: "invalid_state",
    };
  }

  /**
   * M3.8-M3 / M4A: synchronous claim + LLM + persist (tests / internal); not used by admin HTTP.
   */
  async runPairwiseDecisionJobSync(jobId: string): Promise<RunPairwiseDecisionJobResult> {
    const current = await this.db().findUnique({ where: { id: jobId } });
    if (!current) {
      throw new NotFoundException(`AiPairwiseDecisionJob not found: ${jobId}`);
    }

    if (current.status === AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED) {
      return { outcome: "already_completed", job: await this.toPublicDto(current, { exposeFinalSourceShadow: true }) };
    }
    if (current.status === AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING) {
      return { outcome: "already_running", job: await this.toPublicDto(current, { exposeFinalSourceShadow: true }) };
    }
    if (current.status === AI_PAIRWISE_DECISION_JOB_STATUS.FAILED) {
      return { outcome: "failed_not_reusable", job: await this.toPublicDto(current, { exposeFinalSourceShadow: true }) };
    }
    if (current.status !== AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED) {
      return { outcome: "invalid_state", job: await this.toPublicDto(current, { exposeFinalSourceShadow: true }) };
    }

    const claimed = await this.db().updateMany({
      where: { id: jobId, status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED },
      data: {
        status: AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING,
        startedAt: new Date(),
        failureDetail: Prisma.JsonNull,
        decisionResult: Prisma.JsonNull,
        finalSourceShadow: Prisma.JsonNull,
      },
    });

    if (claimed.count === 0) {
      const again = await this.db().findUniqueOrThrow({ where: { id: jobId } });
      if (again.status === AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED) {
        return { outcome: "already_completed", job: await this.toPublicDto(again, { exposeFinalSourceShadow: true }) };
      }
      if (again.status === AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING) {
        return { outcome: "already_running", job: await this.toPublicDto(again, { exposeFinalSourceShadow: true }) };
      }
      return { outcome: "invalid_state", job: await this.toPublicDto(again, { exposeFinalSourceShadow: true }) };
    }

    await executeClaimedAiPairwiseDecisionJob({
      db: this.db(),
      jobId,
      viewerUserId: current.viewerUserId,
      poolId: current.poolId,
      shortlistSnapshot: current.shortlistSnapshot,
      generate: (sl) => this.pairwise.generateAiPairwiseDecision({ shortlist: sl }),
    });

    const done = await this.db().findUniqueOrThrow({ where: { id: jobId } });
    return { outcome: "ran", job: await this.toPublicDto(done, { exposeFinalSourceShadow: true }) };
  }

  async getPairwiseDecisionJob(jobId: string): Promise<PairwiseDecisionJobPublicDto> {
    const row = await this.db().findUnique({ where: { id: jobId } });
    if (!row) {
      throw new NotFoundException(`AiPairwiseDecisionJob not found: ${jobId}`);
    }
    return this.toPublicDto(row, { exposeFinalSourceShadow: true });
  }

  /**
   * M3.8-M5: viewer read — **404** if missing or not owned (no existence leak).
   */
  async getPairwiseDecisionJobForViewer(jobId: string, viewerUserId: string): Promise<PairwiseDecisionJobPublicDto> {
    const row = await this.db().findUnique({ where: { id: jobId } });
    if (!row || row.viewerUserId !== viewerUserId) {
      throw new NotFoundException(`AiPairwiseDecisionJob not found: ${jobId}`);
    }
    return this.toPublicDto(row, { exposeFinalSourceShadow: false });
  }

  /**
   * M3.8-M5: viewer async enqueue — same semantics as admin `requestAdminRunPairwiseDecisionJob`; no LLM await.
   */
  async requestViewerAsyncRunPairwiseDecisionJob(
    jobId: string,
    viewerUserId: string,
  ): Promise<RequestAdminRunPairwiseDecisionJobResponse> {
    const row = await this.db().findUnique({ where: { id: jobId } });
    if (!row || row.viewerUserId !== viewerUserId) {
      throw new NotFoundException(`AiPairwiseDecisionJob not found: ${jobId}`);
    }
    return this.requestAdminRunPairwiseDecisionJob(jobId);
  }

  private parseStoredFinalSourceShadow(raw: unknown): PairwiseFinalSourceShadowRecord | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.schemaVersion !== 1 || o.sourceVersion !== "pairwise-final-source-shadow-v1") return null;
    return raw as PairwiseFinalSourceShadowRecord;
  }

  private async toPublicDto(
    row: AiPairwiseDecisionJobRow,
    opts?: { exposeFinalSourceShadow?: boolean },
  ): Promise<PairwiseDecisionJobPublicDto> {
    const shortlistParsed = parseAndValidateRelationshipShortlistTop2(row.shortlistSnapshot);
    if (!shortlistParsed.ok) {
      throw new ConflictException({
        code: "stored_shortlist_corrupt",
        message: `${shortlistParsed.failureDetail.path}: ${shortlistParsed.failureDetail.reason}`,
      });
    }

    let decisionResult: AiPairwiseDecision | null = null;
    if (row.decisionResult != null && row.decisionResult !== Prisma.JsonNull) {
      const d = parseAndValidateAiPairwiseDecision(row.decisionResult);
      if (!d.ok) {
        throw new ConflictException({
          code: "stored_decision_corrupt",
          message: `${d.failureDetail.path}: ${d.failureDetail.reason}`,
        });
      }
      decisionResult = d.value;
    }

    let failureDetail: GenerateAiPairwiseDecisionFailureDetail | null = null;
    if (
      row.failureDetail != null &&
      row.failureDetail !== Prisma.JsonNull &&
      typeof row.failureDetail === "object"
    ) {
      failureDetail = row.failureDetail as unknown as GenerateAiPairwiseDecisionFailureDetail;
    }

    const exposeShadow = opts?.exposeFinalSourceShadow === true;
    const finalSourceShadow = exposeShadow ? this.parseStoredFinalSourceShadow(row.finalSourceShadow) : null;

    return {
      id: row.id,
      viewerUserId: row.viewerUserId,
      poolId: row.poolId,
      shortlistFingerprint: row.shortlistFingerprint,
      status: row.status,
      sourceVersion: row.sourceVersion,
      shortlistSnapshot: shortlistParsed.value,
      decisionResult,
      failureDetail,
      fallbackUsed: row.fallbackUsed,
      finalSourceShadow,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
    };
  }
}
