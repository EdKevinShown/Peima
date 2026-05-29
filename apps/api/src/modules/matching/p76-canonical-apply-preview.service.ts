/**
 * P7.10-r7f — read-only apply-preview for canonical sidecar rows (no DB / MatchResult writes).
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  assertP76CanonicalApplyPreviewNeverWrites,
  buildP76CanonicalApplyPreviewPayloadV1,
} from "./p76-canonical-apply-preview-builder";
import { buildP76CanonicalApplyPreviewConservativeContext } from "./p76-canonical-apply-preview-context";
import type {
  P76CanonicalApplyPreviewInputV1,
  P76CanonicalApplyPreviewPayloadV1,
} from "./p76-canonical-apply-preview.types";
import { isP76CanonicalSidecarAdminEnabled } from "./p76-canonical-sidecar-admin-env";
import type { P76CanonicalMatchResultMetaDbRow } from "./p76-canonical-sidecar-admin.types";

function mapSidecarRowToPreviewInput(
  row: P76CanonicalMatchResultMetaDbRow,
): NonNullable<P76CanonicalApplyPreviewInputV1["sidecar"]> {
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

export type P76CanonicalApplyPreviewServiceOptions = {
  context?: P76CanonicalApplyPreviewInputV1["context"];
  previewRequestedBy?: string;
};

@Injectable()
export class P76CanonicalApplyPreviewService {
  constructor(private readonly prisma: PrismaService) {}

  assertFeatureEnabled(): void {
    if (!isP76CanonicalSidecarAdminEnabled()) {
      throw new NotFoundException(
        "P76 canonical match result sidecar admin API is disabled",
      );
    }
  }

  async getApplyPreviewBySidecarId(
    sidecarId: string,
    options: P76CanonicalApplyPreviewServiceOptions = {},
  ): Promise<P76CanonicalApplyPreviewPayloadV1> {
    this.assertFeatureEnabled();

    const row = await this.prisma.p76CanonicalMatchResultMeta.findUnique({
      where: { id: sidecarId },
    });
    if (!row) {
      throw new NotFoundException(
        `p76_canonical_match_result_meta not found: ${sidecarId}`,
      );
    }

    const matchResultId = row.matchResultId?.trim() || null;
    let currentMatchResult: P76CanonicalApplyPreviewInputV1["currentMatchResult"] =
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
        };
      }
    }

    const context =
      options.context ?? buildP76CanonicalApplyPreviewConservativeContext();

    const input: P76CanonicalApplyPreviewInputV1 = {
      sidecar: mapSidecarRowToPreviewInput(row),
      currentMatchResult,
      context: {
        ...context,
        previewRequestedBy: options.previewRequestedBy,
      },
    };

    const payload = buildP76CanonicalApplyPreviewPayloadV1(input);
    assertP76CanonicalApplyPreviewNeverWrites(payload);
    return payload;
  }
}
