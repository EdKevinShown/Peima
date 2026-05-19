/**
 * P7.10-r7j — read-only rollback snapshot preview (dry-run; no DB / MatchResult writes).
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildP76CanonicalApplyRollbackSnapshotV1 } from "./p76-canonical-apply-rollback-snapshot-builder";
import type { P76CanonicalApplyRollbackSnapshotV1 } from "./p76-canonical-apply-rollback-snapshot.types";
import type { P76CanonicalApplyRollbackSnapshotBuildInputV1 } from "./p76-canonical-apply-rollback-snapshot.types";
import {
  P76CanonicalApplyPreviewService,
  type P76CanonicalApplyPreviewServiceOptions,
} from "./p76-canonical-apply-preview.service";
import type { P76CanonicalMatchResultMetaDbRow } from "./p76-canonical-sidecar-admin.types";

function mapSidecarRowToSnapshotInput(
  row: P76CanonicalMatchResultMetaDbRow,
): NonNullable<P76CanonicalApplyRollbackSnapshotBuildInputV1["sidecar"]> {
  return {
    id: row.id,
    auditRunId: row.auditRunId,
    environment: row.environment,
    viewerUserId: row.viewerUserId,
    matchResultId: row.matchResultId,
    selectedCandidateId: row.selectedCandidateId,
    score: row.score,
    reasonSummary: row.reasonSummary,
    sourceVersion: row.sourceVersion,
    promotionStatus: row.promotionStatus,
    appliedToMatchResult: row.appliedToMatchResult,
    appliedToFinalScore: row.appliedToFinalScore,
    appliedToWorkerRanking: row.appliedToWorkerRanking,
    rolledBack: row.rolledBack,
    deletedAt: row.deletedAt,
    supersededAt: row.supersededAt,
    pmSignoffStatus: row.pmSignoffStatus,
    opsSignoffStatus: row.opsSignoffStatus,
  };
}

export type P76CanonicalRollbackSnapshotPreviewServiceOptions =
  P76CanonicalApplyPreviewServiceOptions;

@Injectable()
export class P76CanonicalRollbackSnapshotPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly p76CanonicalApplyPreviewService: P76CanonicalApplyPreviewService,
  ) {}

  async getRollbackSnapshotPreviewBySidecarId(
    sidecarId: string,
    options: P76CanonicalRollbackSnapshotPreviewServiceOptions = {},
  ): Promise<P76CanonicalApplyRollbackSnapshotV1> {
    this.p76CanonicalApplyPreviewService.assertFeatureEnabled();

    const row = await this.prisma.p76CanonicalMatchResultMeta.findUnique({
      where: { id: sidecarId },
    });
    if (!row) {
      throw new NotFoundException(
        `p76_canonical_match_result_meta not found: ${sidecarId}`,
      );
    }

    const preview =
      await this.p76CanonicalApplyPreviewService.getApplyPreviewBySidecarId(
        sidecarId,
        options,
      );

    const matchResultId = row.matchResultId?.trim() || null;
    let currentMatchResult: P76CanonicalApplyRollbackSnapshotBuildInputV1["currentMatchResult"] =
      null;

    if (matchResultId) {
      const mr = await this.prisma.matchResult.findUnique({
        where: { id: matchResultId },
        select: {
          id: true,
          userId: true,
          candidateUserId: true,
          finalScore: true,
          reasonSummary: true,
          matchInsights: true,
          updatedAt: true,
        },
      });
      if (mr) {
        currentMatchResult = {
          id: mr.id,
          viewerUserId: mr.userId,
          candidateUserId: mr.candidateUserId,
          finalScore: mr.finalScore,
          reasonSummary: mr.reasonSummary,
          matchInsights: mr.matchInsights,
          updatedAt: mr.updatedAt,
        };
      }
    }

    const snapshot = buildP76CanonicalApplyRollbackSnapshotV1({
      sidecar: mapSidecarRowToSnapshotInput(row),
      currentMatchResult,
      previewPayload: {
        canApply: preview.canApply,
        blockedReasons: preview.blockedReasons,
      },
      environment: row.environment,
      capturedBy: options.previewRequestedBy ?? null,
    });

    return snapshot;
  }
}
