import type { PrismaClient } from "@peima/database";
import {
  FINALIZE_META_ROW_MALFORMED_STRING,
  FINALIZE_META_ROW_NULL_META,
  FINALIZE_META_ROW_WOULD_CHANGE,
} from "./fixtures";

export type MatchingObservabilityPrismaMockProfile =
  | "empty"
  | "rich";

/**
 * Minimal PrismaClient stub for `buildMatchingObservabilitySummary` unit tests.
 * Not a full Prisma mock — only methods used by the aggregator.
 */
export function createMatchingObservabilityPrismaMock(
  profile: MatchingObservabilityPrismaMockProfile = "empty",
): PrismaClient {
  const rich = profile === "rich";

  const pairwiseTotal = rich ? 4 : 0;
  const pwStatus = rich
    ? [
        { status: "succeeded", _count: 2 },
        { status: "failed", _count: 1 },
        { status: "queued", _count: 1 },
      ]
    : [];
  const pwSource = rich ? [{ sourceVersion: "pairwise-v1", _count: 4 }] : [];
  const failureCodes = rich
    ? [
        { code: "schema_validation", c: 1 },
        { code: "(null)", c: 1 },
      ]
    : [];

  const simJobStatus = rich ? [{ jobStatus: "succeeded", _count: 2 }] : [];
  const itemStatus = rich
    ? [
        { status: "succeeded", _count: 3 },
        { status: "failed", _count: 1 },
      ]
    : [];
  const itemErrors = rich
    ? [
        { errorCode: "schema_validation", _count: 1 },
        { errorCode: null, _count: 1 },
      ]
    : [];

  const finalizeWindow = rich ? 3 : 0;
  const finalizeAll = rich ? 10 : 0;
  const finRows = rich
    ? [FINALIZE_META_ROW_WOULD_CHANGE, FINALIZE_META_ROW_MALFORMED_STRING, FINALIZE_META_ROW_NULL_META]
    : [];

  return {
    aiPairwiseDecisionJob: {
      count: jest.fn(async (args?: { where?: { fallbackUsed?: boolean | null } }) => {
        if (!rich) return 0;
        if (args?.where?.fallbackUsed === true) return 1;
        if (args?.where?.fallbackUsed === false) return 2;
        if (args?.where?.fallbackUsed === null) return 1;
        return pairwiseTotal;
      }),
      groupBy: jest.fn(async (args: { by: string[] }) => {
        if (args.by.includes("status")) return pwStatus;
        if (args.by.includes("sourceVersion")) return pwSource;
        return [];
      }),
    },
    aiSimulationV1Job: {
      groupBy: jest.fn(async () => simJobStatus),
    },
    aiSimulationV1Item: {
      groupBy: jest.fn(async (args: { by: string[] }) => {
        if (args.by.includes("status")) return itemStatus;
        if (args.by.includes("errorCode")) return itemErrors;
        return [];
      }),
      count: jest.fn(async (args?: { where?: { status?: string } }) => {
        if (!rich) return 0;
        if (args?.where?.status === "failed") return 1;
        return 4;
      }),
    },
    pairwisePoolFinalizeMeta: {
      count: jest.fn(
        async (args?: { where?: { updatedAt?: unknown; frozen?: boolean } }) => {
          if (!rich) return 0;
          const w = args?.where;
          if (!w) return finalizeAll;
          const inWindow = w.updatedAt != null;
          if (inWindow && w.frozen === true) return 1;
          if (inWindow) return finalizeWindow;
          if (w.frozen === true) return 3;
          return finalizeAll;
        },
      ),
      findMany: jest.fn(async (args?: { take?: number }) => {
        const take = args?.take ?? finRows.length;
        return finRows.slice(0, take);
      }),
    },
    matchResult: {
      count: jest.fn(async () => (rich ? 7 : 0)),
    },
    previewPool: {
      count: jest.fn(async () => (rich ? 2 : 0)),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join("");
      if (sql.includes("failureDetail")) {
        return failureCodes;
      }
      if (sql.includes("ai_simulation_v1_items") && sql.includes("schema_validation")) {
        return [{ c: rich ? 1 : 0 }];
      }
      if (sql.includes("pairwise_pool_finalize_meta") && sql.includes("preview_pools")) {
        return [{ c: rich ? 2 : 0 }];
      }
      if (sql.includes("ai_simulation_v1_jobs") && sql.includes("DISTINCT")) {
        return [{ c: rich ? 1 : 0 }];
      }
      return [];
    }),
  } as unknown as PrismaClient;
}
