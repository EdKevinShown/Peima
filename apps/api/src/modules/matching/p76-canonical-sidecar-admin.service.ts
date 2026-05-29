/**
 * P7.7-r4.1 — read-only admin API for p76_canonical_match_result_meta.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isP76CanonicalSidecarAdminEnabled } from "./p76-canonical-sidecar-admin-env";
import {
  computeP76CanonicalSidecarAdminAggregate,
  decodeP76CanonicalSidecarAdminListCursor,
  deriveP76CanonicalSidecarAdminDetail,
  deriveP76CanonicalSidecarAdminListItem,
  encodeP76CanonicalSidecarAdminListCursor,
  normalizeP76CanonicalSidecarAdminListLimit,
} from "./p76-canonical-sidecar-admin.derive";
import type {
  P76CanonicalSidecarAdminAggregateResponse,
  P76CanonicalSidecarAdminDetailResponse,
  P76CanonicalSidecarAdminListQuery,
  P76CanonicalSidecarAdminListResponse,
} from "./p76-canonical-sidecar-admin.types";
import {
  P76_CANONICAL_SIDECAR_ADMIN_AGGREGATE_SCHEMA_VERSION,
  P76_CANONICAL_SIDECAR_ADMIN_DETAIL_SCHEMA_VERSION,
  P76_CANONICAL_SIDECAR_ADMIN_LIST_SCHEMA_VERSION,
} from "./p76-canonical-sidecar-admin.types";

@Injectable()
export class P76CanonicalSidecarAdminService {
  constructor(private readonly prisma: PrismaService) {}

  assertFeatureEnabled(): void {
    if (!isP76CanonicalSidecarAdminEnabled()) {
      throw new NotFoundException(
        "P76 canonical match result sidecar admin API is disabled",
      );
    }
  }

  private buildWhere(
    query: P76CanonicalSidecarAdminListQuery,
  ): Prisma.P76CanonicalMatchResultMetaWhereInput {
    const where: Prisma.P76CanonicalMatchResultMetaWhereInput = {};

    if (query.auditRunId?.trim()) {
      where.auditRunId = query.auditRunId.trim();
    }
    if (query.environment?.trim()) {
      where.environment = query.environment.trim();
    }
    if (query.viewerUserId?.trim()) {
      where.viewerUserId = query.viewerUserId.trim();
    }
    if (query.matchResultId?.trim()) {
      where.matchResultId = query.matchResultId.trim();
    }
    if (query.selectedCandidateId?.trim()) {
      where.selectedCandidateId = query.selectedCandidateId.trim();
    }
    if (query.sourceVersion?.trim()) {
      where.sourceVersion = query.sourceVersion.trim();
    }
    if (query.mode?.trim()) {
      where.mode = query.mode.trim();
    }
    if (query.promotionStatus?.trim()) {
      where.promotionStatus = query.promotionStatus.trim();
    }
    if (query.appliedToMatchResult !== undefined) {
      where.appliedToMatchResult = query.appliedToMatchResult;
    } else {
      where.appliedToMatchResult = false;
    }
    if (query.appliedToFinalScore !== undefined) {
      where.appliedToFinalScore = query.appliedToFinalScore;
    }
    if (query.appliedToWorkerRanking !== undefined) {
      where.appliedToWorkerRanking = query.appliedToWorkerRanking;
    }
    if (query.rolledBack !== undefined) {
      where.rolledBack = query.rolledBack;
    }
    if (query.activeOnly !== false) {
      where.supersededAt = null;
      if (!query.includeDeleted) {
        where.deletedAt = null;
      }
    } else if (!query.includeDeleted) {
      where.deletedAt = null;
    }

    if (query.generatedAtFrom?.trim() || query.generatedAtTo?.trim()) {
      where.createdAt = {};
      if (query.generatedAtFrom?.trim()) {
        where.createdAt.gte = new Date(query.generatedAtFrom.trim());
      }
      if (query.generatedAtTo?.trim()) {
        where.createdAt.lte = new Date(query.generatedAtTo.trim());
      }
    }

    return where;
  }

  private async fetchAllMatchingRows(query: P76CanonicalSidecarAdminListQuery) {
    return this.prisma.p76CanonicalMatchResultMeta.findMany({
      where: this.buildWhere(query),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async listP76CanonicalSidecarAdmin(
    query: P76CanonicalSidecarAdminListQuery,
  ): Promise<P76CanonicalSidecarAdminListResponse> {
    this.assertFeatureEnabled();

    const limit = normalizeP76CanonicalSidecarAdminListLimit(query.limit);
    const rows = await this.fetchAllMatchingRows(query);
    const items = rows.map((row) => deriveP76CanonicalSidecarAdminListItem(row));
    const aggregate = computeP76CanonicalSidecarAdminAggregate(items, rows);

    let pageItems = items;
    const decoded = query.cursor
      ? decodeP76CanonicalSidecarAdminListCursor(query.cursor)
      : null;
    if (decoded) {
      pageItems = items.filter((item) => {
        const t = new Date(item.createdAt).getTime();
        const c = decoded.createdAt.getTime();
        if (t < c) return true;
        if (t > c) return false;
        return item.id < decoded.id;
      });
    }

    const slice = pageItems.slice(0, limit);
    const hasMore = pageItems.length > limit;
    const nextCursor =
      hasMore && slice.length > 0
        ? encodeP76CanonicalSidecarAdminListCursor({
            createdAt: new Date(slice[slice.length - 1]!.createdAt),
            id: slice[slice.length - 1]!.id,
          })
        : null;

    return {
      schemaVersion: P76_CANONICAL_SIDECAR_ADMIN_LIST_SCHEMA_VERSION,
      featureEnabled: true,
      items: slice,
      pageInfo: {
        limit,
        nextCursor,
        totalCount: items.length,
      },
      aggregate,
    };
  }

  async getP76CanonicalSidecarAdminById(
    id: string,
  ): Promise<P76CanonicalSidecarAdminDetailResponse> {
    this.assertFeatureEnabled();

    const row = await this.prisma.p76CanonicalMatchResultMeta.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(
        `p76_canonical_match_result_meta not found: ${id}`,
      );
    }

    const detail = deriveP76CanonicalSidecarAdminDetail(row);
    const viewer = row.viewerUserId.trim();
    const matchResultId = row.matchResultId?.trim() || null;

    return {
      schemaVersion: P76_CANONICAL_SIDECAR_ADMIN_DETAIL_SCHEMA_VERSION,
      featureEnabled: true,
      row: detail,
      links: {
        rehearsalAdminPath: viewer
          ? `/admin/p76/canonical-rehearsal?viewerUserId=${encodeURIComponent(viewer)}`
          : null,
        allowlistApplyMetaAdminPath: matchResultId
          ? `/admin/p76/allowlist-apply-meta?matchResultId=${encodeURIComponent(matchResultId)}`
          : null,
      },
    };
  }

  async getP76CanonicalSidecarAdminAggregate(
    query: P76CanonicalSidecarAdminListQuery,
  ): Promise<P76CanonicalSidecarAdminAggregateResponse> {
    this.assertFeatureEnabled();
    const rows = await this.fetchAllMatchingRows(query);
    const items = rows.map((row) => deriveP76CanonicalSidecarAdminListItem(row));
    return {
      schemaVersion: P76_CANONICAL_SIDECAR_ADMIN_AGGREGATE_SCHEMA_VERSION,
      featureEnabled: true,
      ...computeP76CanonicalSidecarAdminAggregate(items, rows),
    };
  }
}
