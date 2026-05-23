import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  buildMatchingObservabilitySummary,
  clampMatchingObservabilityLimit,
  clampMatchingObservabilitySinceDays,
  MATCHING_OBSERVABILITY_DEFAULT_LIMIT,
  MATCHING_OBSERVABILITY_DEFAULT_SINCE_DAYS,
  MATCHING_OBSERVABILITY_MAX_LIMIT,
  MATCHING_OBSERVABILITY_MAX_SINCE_DAYS,
  type MatchingObservabilitySummaryReport,
} from "@peima/database";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaService } from "../../common/prisma/prisma.service";

function resolveMonorepoRoot(): string {
  const env = process.env.PEIMA_MONOREPO_ROOT?.trim();
  if (env) {
    return resolve(env);
  }
  const cwd = process.cwd();
  const base = join(cwd, "..", "..");
  if (existsSync(join(base, "apps", "worker", "package.json"))) {
    return base;
  }
  if (existsSync(join(cwd, "apps", "worker", "package.json"))) {
    return cwd;
  }
  throw new ServiceUnavailableException(
    "Cannot resolve monorepo root (expected apps/worker). Set PEIMA_MONOREPO_ROOT.",
  );
}

export function parseMatchingObservabilityLimitQuery(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") {
    return MATCHING_OBSERVABILITY_DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException("limit must be a positive integer");
  }
  if (parsed < 1 || parsed > MATCHING_OBSERVABILITY_MAX_LIMIT) {
    throw new BadRequestException(
      `limit must be between 1 and ${MATCHING_OBSERVABILITY_MAX_LIMIT}`,
    );
  }
  return clampMatchingObservabilityLimit(parsed);
}

export function parseMatchingObservabilitySinceDaysQuery(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") {
    return MATCHING_OBSERVABILITY_DEFAULT_SINCE_DAYS;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException("sinceDays must be a positive integer");
  }
  if (parsed < 1 || parsed > MATCHING_OBSERVABILITY_MAX_SINCE_DAYS) {
    throw new BadRequestException(
      `sinceDays must be between 1 and ${MATCHING_OBSERVABILITY_MAX_SINCE_DAYS}`,
    );
  }
  return clampMatchingObservabilitySinceDays(parsed);
}

@Injectable()
export class MatchingObservabilitySummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(query: {
    limit?: string;
    sinceDays?: string;
  }): Promise<MatchingObservabilitySummaryReport> {
    const limit = parseMatchingObservabilityLimitQuery(query.limit);
    const sinceDays = parseMatchingObservabilitySinceDaysQuery(query.sinceDays);
    const root = resolveMonorepoRoot();
    const m42Sanitized = join(
      root,
      "docs",
      "M4",
      "M4.2-batch-regression-sanitized-run-record.md",
    );

    return buildMatchingObservabilitySummary(this.prisma, {
      limit,
      sinceDays,
      m42SanitizedRunRecordExists: existsSync(m42Sanitized),
    });
  }
}
