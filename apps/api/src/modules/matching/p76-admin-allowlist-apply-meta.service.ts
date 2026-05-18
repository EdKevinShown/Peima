/**
 * P7.6-r8g1 — read-only admin API for p76_allowlist_apply_meta.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  computeP76AdminAggregate,
  decodeP76AdminListCursor,
  deriveP76AdminStatuses,
  encodeP76AdminListCursor,
  buildP76StageSummary,
  normalizeP76AdminListLimit,
  toP76AdminSafeRow,
} from "./p76-admin-allowlist-apply-meta.derive";
import type {
  P76AdminAllowlistApplyMetaAggregateResponseV1,
  P76AdminAllowlistApplyMetaDetailResponseV1,
  P76AdminAllowlistApplyMetaListQuery,
  P76AdminAllowlistApplyMetaListResponseV1,
  P76AdminAllowlistApplyMetaRowV1,
  P76AdminArtifactPathChecker,
  P76AllowlistApplyMetaDbRow,
} from "./p76-admin-allowlist-apply-meta.types";
import {
  P76_ADMIN_AGGREGATE_SCHEMA_VERSION,
  P76_ADMIN_CURRENT_COHORT_SOURCE_VERSION,
  P76_ADMIN_DETAIL_SCHEMA_VERSION,
  P76_ADMIN_LIST_SCHEMA_VERSION,
  P76_ADMIN_MAX_LIST_LIMIT,
} from "./p76-admin-allowlist-apply-meta.types";

@Injectable()
export class P76AdminAllowlistApplyMetaService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly artifactPathChecker: P76AdminArtifactPathChecker = (
    relativePath,
  ) => {
    if (!relativePath?.trim()) return false;
    const repoRoot = path.resolve(__dirname, "../../../..");
    const full = path.join(repoRoot, relativePath.replace(/\\/g, "/"));
    return fs.existsSync(full);
  };

  private deriveOpts() {
    return {
      currentSourceVersion: P76_ADMIN_CURRENT_COHORT_SOURCE_VERSION,
      artifactPathChecker: this.artifactPathChecker,
    };
  }

  private buildWhere(
    query: Pick<
      P76AdminAllowlistApplyMetaListQuery,
      "viewerUserId" | "applied" | "rolledBack" | "sourceVersion"
    >,
  ): Prisma.P76AllowlistApplyMetaWhereInput {
    const where: Prisma.P76AllowlistApplyMetaWhereInput = {};
    if (query.viewerUserId?.trim()) {
      where.viewerUserId = query.viewerUserId.trim();
    }
    if (query.applied !== undefined) {
      where.applied = query.applied;
    }
    if (query.rolledBack !== undefined) {
      where.rolledBack = query.rolledBack;
    }
    if (query.sourceVersion?.trim()) {
      where.sourceVersion = query.sourceVersion.trim();
    }
    return where;
  }

  private mapRow(row: P76AllowlistApplyMetaDbRow): P76AdminAllowlistApplyMetaRowV1 {
    const derived = deriveP76AdminStatuses(row, this.deriveOpts());
    return toP76AdminSafeRow(row, derived) as P76AdminAllowlistApplyMetaRowV1;
  }

  private async fetchAllMatchingRows(
    query: P76AdminAllowlistApplyMetaListQuery,
  ): Promise<P76AdminAllowlistApplyMetaRowV1[]> {
    const where = this.buildWhere(query);
    const rows = await this.prisma.p76AllowlistApplyMeta.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    let mapped = rows.map((r) => this.mapRow(r));
    if (query.violationOnly) {
      mapped = mapped.filter((r) => r.violationStatus !== "ok");
    }
    return mapped;
  }

  async listP76AllowlistApplyMeta(
    query: P76AdminAllowlistApplyMetaListQuery,
  ): Promise<P76AdminAllowlistApplyMetaListResponseV1> {
    const limit = normalizeP76AdminListLimit(query.limit);
    const allRows = await this.fetchAllMatchingRows(query);
    const aggregate = computeP76AdminAggregate(allRows);

    let pageRows = allRows;
    const decoded = query.cursor
      ? decodeP76AdminListCursor(query.cursor)
      : null;
    if (decoded) {
      pageRows = allRows.filter((row) => {
        const t = row.createdAt.getTime();
        const c = decoded.createdAt.getTime();
        if (t < c) return true;
        if (t > c) return false;
        return row.id < decoded.id;
      });
    }

    const slice = pageRows.slice(0, limit);
    const hasMore = pageRows.length > limit;
    const nextCursor =
      hasMore && slice.length > 0
        ? encodeP76AdminListCursor(slice[slice.length - 1]!)
        : null;

    return {
      schemaVersion: P76_ADMIN_LIST_SCHEMA_VERSION,
      rows: slice,
      aggregate,
      pagination: { limit, nextCursor },
    };
  }

  async getP76AllowlistApplyMetaById(
    id: string,
  ): Promise<P76AdminAllowlistApplyMetaDetailResponseV1> {
    const row = await this.prisma.p76AllowlistApplyMeta.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(`p76_allowlist_apply_meta not found: ${id}`);
    }
    const mapped = this.mapRow(row);
    const derived = deriveP76AdminStatuses(row, this.deriveOpts());
    return {
      schemaVersion: P76_ADMIN_DETAIL_SCHEMA_VERSION,
      row: mapped,
      derived,
      stageSummary: buildP76StageSummary(row),
      violationStatus: derived.violationStatus,
    };
  }

  async getP76AllowlistApplyMetaAggregate(
    query: Pick<
      P76AdminAllowlistApplyMetaListQuery,
      "viewerUserId" | "applied" | "rolledBack" | "sourceVersion" | "violationOnly"
    >,
  ): Promise<P76AdminAllowlistApplyMetaAggregateResponseV1> {
    const rows = await this.fetchAllMatchingRows({
      ...query,
      limit: P76_ADMIN_MAX_LIST_LIMIT,
    });
    return {
      schemaVersion: P76_ADMIN_AGGREGATE_SCHEMA_VERSION,
      ...computeP76AdminAggregate(rows),
    };
  }
}
