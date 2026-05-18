/**
 * P7.7-r3.1 — read-only admin API for p76_canonical_writer_rehearsal_meta.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isP76RehearsalAdminEnabled } from "./p76-canonical-rehearsal-admin-env";
import {
  computeP76RehearsalAdminAggregate,
  decodeP76RehearsalAdminListCursor,
  encodeP76RehearsalAdminListCursor,
  normalizeP76RehearsalAdminListLimit,
  sanitizeP76RehearsalAdminJson,
  toP76RehearsalAdminListItem,
} from "./p76-canonical-rehearsal-admin.derive";
import type {
  P76CanonicalRehearsalAdminDetailResponse,
  P76CanonicalRehearsalAdminListResponse,
  P76CanonicalRehearsalAdminListItem,
  P76RehearsalAdminAggregateResponse,
  P76RehearsalAdminListQuery,
} from "./p76-canonical-rehearsal-admin.types";
import {
  P76_REHEARSAL_ADMIN_AGGREGATE_SCHEMA_VERSION,
  P76_REHEARSAL_ADMIN_DETAIL_SCHEMA_VERSION,
  P76_REHEARSAL_ADMIN_LIST_SCHEMA_VERSION,
} from "./p76-canonical-rehearsal-admin.types";

@Injectable()
export class P76CanonicalRehearsalAdminService {
  constructor(private readonly prisma: PrismaService) {}

  assertFeatureEnabled(): void {
    if (!isP76RehearsalAdminEnabled()) {
      throw new NotFoundException("P76 canonical rehearsal admin API is disabled");
    }
  }

  private buildWhere(query: P76RehearsalAdminListQuery): Prisma.P76CanonicalWriterRehearsalMetaWhereInput {
    const where: Prisma.P76CanonicalWriterRehearsalMetaWhereInput = {};

    if (query.auditRunId?.trim()) {
      where.auditRunId = query.auditRunId.trim();
    }
    if (query.sourceVersion?.trim()) {
      where.sourceVersion = query.sourceVersion.trim();
    }
    if (query.readPathSourceVersion?.trim()) {
      where.readPathSourceVersion = query.readPathSourceVersion.trim();
    }
    if (query.environment?.trim()) {
      where.environment = query.environment.trim();
    }
    if (query.eligible !== undefined) {
      where.eligible = query.eligible;
    }
    if (query.guardrailReason?.trim()) {
      where.guardrailReason = query.guardrailReason.trim();
    }
    if (query.wouldChangeCandidate !== undefined) {
      where.wouldChangeCandidate = query.wouldChangeCandidate;
    }
    if (query.appliedToMatchResult !== undefined) {
      where.appliedToMatchResult = query.appliedToMatchResult;
    } else {
      where.appliedToMatchResult = false;
    }
    if (query.viewerUserId?.trim()) {
      where.viewerUserId = query.viewerUserId.trim();
    }
    if (query.matchResultId?.trim()) {
      where.matchResultId = query.matchResultId.trim();
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
      where.generatedAt = {};
      if (query.generatedAtFrom?.trim()) {
        where.generatedAt.gte = new Date(query.generatedAtFrom.trim());
      }
      if (query.generatedAtTo?.trim()) {
        where.generatedAt.lte = new Date(query.generatedAtTo.trim());
      }
    }

    return where;
  }

  private async fetchAllMatchingItems(
    query: P76RehearsalAdminListQuery,
  ): Promise<P76CanonicalRehearsalAdminListItem[]> {
    const rows = await this.prisma.p76CanonicalWriterRehearsalMeta.findMany({
      where: this.buildWhere(query),
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => toP76RehearsalAdminListItem(row));
  }

  async listP76CanonicalRehearsalAdmin(
    query: P76RehearsalAdminListQuery,
  ): Promise<P76CanonicalRehearsalAdminListResponse> {
    this.assertFeatureEnabled();

    const limit = normalizeP76RehearsalAdminListLimit(query.limit);
    const allItems = await this.fetchAllMatchingItems(query);
    const aggregate = computeP76RehearsalAdminAggregate(allItems);

    let pageItems = allItems;
    const decoded = query.cursor
      ? decodeP76RehearsalAdminListCursor(query.cursor)
      : null;
    if (decoded) {
      pageItems = allItems.filter((item) => {
        const t = new Date(item.generatedAt).getTime();
        const c = decoded.generatedAt.getTime();
        if (t < c) return true;
        if (t > c) return false;
        return item.id < decoded.id;
      });
    }

    const slice = pageItems.slice(0, limit);
    const hasMore = pageItems.length > limit;
    const nextCursor =
      hasMore && slice.length > 0
        ? encodeP76RehearsalAdminListCursor({
            generatedAt: new Date(slice[slice.length - 1]!.generatedAt),
            id: slice[slice.length - 1]!.id,
          })
        : null;

    return {
      schemaVersion: P76_REHEARSAL_ADMIN_LIST_SCHEMA_VERSION,
      featureEnabled: true,
      items: slice,
      pageInfo: {
        limit,
        nextCursor,
        totalCount: allItems.length,
      },
      aggregate,
    };
  }

  async getP76CanonicalRehearsalAdminById(
    id: string,
  ): Promise<P76CanonicalRehearsalAdminDetailResponse> {
    this.assertFeatureEnabled();

    const row = await this.prisma.p76CanonicalWriterRehearsalMeta.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(
        `p76_canonical_writer_rehearsal_meta not found: ${id}`,
      );
    }

    const listItem = toP76RehearsalAdminListItem(row);
    const allowlistApplyMetaId = row.allowlistApplyMetaId?.trim() || null;

    return {
      schemaVersion: P76_REHEARSAL_ADMIN_DETAIL_SCHEMA_VERSION,
      featureEnabled: true,
      row: listItem,
      shadow: sanitizeP76RehearsalAdminJson(row.shadowPayload) as Record<
        string,
        unknown
      >,
      summary:
        row.summary == null
          ? null
          : (sanitizeP76RehearsalAdminJson(row.summary) as Record<
              string,
              unknown
            >),
      derived: {
        rehearsalStatus: listItem.rehearsalStatus,
        productApplyStatus: listItem.productApplyStatus,
        mainChainApplyStatus: listItem.mainChainApplyStatus,
        violationStatus: listItem.violationStatus,
      },
      links: {
        allowlistApplyMetaId,
        allowlistApplyMetaAdminPath: allowlistApplyMetaId
          ? `/admin/p76/allowlist-apply-meta/${allowlistApplyMetaId}`
          : null,
      },
    };
  }

  async getP76CanonicalRehearsalAdminAggregate(
    query: P76RehearsalAdminListQuery,
  ): Promise<P76RehearsalAdminAggregateResponse> {
    this.assertFeatureEnabled();
    const items = await this.fetchAllMatchingItems(query);
    return {
      schemaVersion: P76_REHEARSAL_ADMIN_AGGREGATE_SCHEMA_VERSION,
      featureEnabled: true,
      ...computeP76RehearsalAdminAggregate(items),
    };
  }
}
