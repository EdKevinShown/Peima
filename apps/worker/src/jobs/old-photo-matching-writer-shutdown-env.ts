/**
 * P7.10-r9 — gate legacy PreviewPool / photo-style batch-match MatchResult writes.
 * Default: shutdown ON, writer OFF. Read paths and PreviewPool generation are unaffected.
 */

import type { Prisma } from "@peima/database";

export const OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_REASON =
  "old_photo_matching_writer_shutdown" as const;

export const OLD_PHOTO_MATCHING_WRITER_DISABLED_REASON =
  "old_photo_matching_writer_disabled" as const;

export const OLD_PHOTO_MATCHING_WRITER_PRODUCTION_BLOCKED_REASON =
  "old_photo_matching_writer_production_blocked" as const;
export const TEST_MATCH_RESULT_WRITER_ALLOWED_REASON =
  "test_match_result_writer_allowlist" as const;
export const TEST_MATCH_RESULT_WRITER_USER_NOT_ALLOWED_REASON =
  "test_match_result_writer_user_not_allowed" as const;

const TRUTHY = new Set(["1", "true", "yes"]);
const FALSY = new Set(["0", "false", "no"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return defaultValue;
}

function parseIds(raw: string | undefined): Set<string> {
  const ids = (raw ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

export function normalizeOldPhotoMatchingWriterEnvironment(
  raw: string | undefined,
): string {
  const v = (raw ?? "dev").trim().toLowerCase();
  if (v === "local") return "dev";
  if (v === "production" || v === "prod" || v === "customer_production") {
    return "production";
  }
  return v;
}

export type OldPhotoMatchingWriterSafetyV1 = {
  writesMatchResult: boolean;
  triggersWorker: boolean;
  changesCanonical: boolean;
  changesPercent: boolean;
};

export type OldPhotoMatchingWriterGateV1 = {
  writerEnabled: boolean;
  shutdownEnabled: boolean;
  configuredEnvironment: string;
  nodeEnv: string;
  productionPercent: number;
  percentEnabled: boolean;
  productionBlocked: boolean;
  environmentAllowed: boolean;
  canWriteMatchResult: boolean;
  mode: "allowed" | "blocked";
  written: false;
  reason: string;
  safety: OldPhotoMatchingWriterSafetyV1;
};

export function readOldPhotoMatchingWriterGate(
  env: NodeJS.ProcessEnv = process.env,
): OldPhotoMatchingWriterGateV1 {
  const writerEnabled = parseTruthy(
    env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED,
    false,
  );
  const shutdownEnabled = parseTruthy(
    env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED,
    true,
  );
  const configuredEnvironment = normalizeOldPhotoMatchingWriterEnvironment(
    env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENVIRONMENT,
  );
  const nodeEnv = (env.NODE_ENV ?? "development").trim().toLowerCase();
  const productionPercent = Number(env.PEIMA_P76_PRODUCTION_PERCENT ?? "0");
  const percentEnabled = parseTruthy(env.PEIMA_P76_PRODUCTION_PERCENT_ENABLED, false);

  const productionBlocked =
    configuredEnvironment === "production" ||
    configuredEnvironment === "customer_production" ||
    nodeEnv === "production";

  const environmentAllowed =
    configuredEnvironment === "dev" ||
    configuredEnvironment === "staging" ||
    configuredEnvironment === "production-like-staging";

  const percentBlocked =
    percentEnabled ||
    !Number.isFinite(productionPercent) ||
    productionPercent > 0;

  let reason: string = OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_REASON;
  if (productionBlocked) {
    reason = OLD_PHOTO_MATCHING_WRITER_PRODUCTION_BLOCKED_REASON;
  } else if (shutdownEnabled) {
    reason = OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_REASON;
  } else if (!writerEnabled) {
    reason = OLD_PHOTO_MATCHING_WRITER_DISABLED_REASON;
  } else if (percentBlocked) {
    reason = "old_photo_matching_writer_percent_blocked";
  } else if (!environmentAllowed) {
    reason = "old_photo_matching_writer_environment_blocked";
  } else {
    reason = "old_photo_matching_writer_allowed";
  }

  const canWriteMatchResult =
    writerEnabled &&
    !shutdownEnabled &&
    environmentAllowed &&
    !productionBlocked &&
    !percentBlocked;

  if (canWriteMatchResult) {
    return {
      writerEnabled,
      shutdownEnabled,
      configuredEnvironment,
      nodeEnv,
      productionPercent: Number.isFinite(productionPercent) ? productionPercent : 0,
      percentEnabled,
      productionBlocked,
      environmentAllowed,
      canWriteMatchResult: true,
      mode: "allowed",
      written: false,
      reason: "old_photo_matching_writer_allowed",
      safety: {
        writesMatchResult: true,
        triggersWorker: false,
        changesCanonical: false,
        changesPercent: false,
      },
    };
  }

  return {
    writerEnabled,
    shutdownEnabled,
    configuredEnvironment,
    nodeEnv,
    productionPercent: Number.isFinite(productionPercent) ? productionPercent : 0,
    percentEnabled,
    productionBlocked,
    environmentAllowed,
    canWriteMatchResult: false,
    mode: "blocked",
    written: false,
    reason,
    safety: {
      writesMatchResult: false,
      triggersWorker: false,
      changesCanonical: false,
      changesPercent: false,
    },
  };
}

/**
 * Dev/QA-only override: allows local smoke-test users to exercise the legacy
 * PreviewPool -> MatchResult writer without reopening it globally.
 */
export function readOldPhotoMatchingWriterGateForUser(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): OldPhotoMatchingWriterGateV1 {
  const base = readOldPhotoMatchingWriterGate(env);
  if (base.canWriteMatchResult) {
    return base;
  }

  const testWriterEnabled = parseTruthy(
    env.PEIMA_TEST_MATCH_RESULT_WRITER_ENABLED,
    false,
  );
  if (!testWriterEnabled) {
    return base;
  }
  if (parseTruthy(env.PEIMA_TEST_MATCH_RESULT_WRITER_DISABLED, false)) {
    return {
      ...base,
      reason: OLD_PHOTO_MATCHING_WRITER_DISABLED_REASON,
    };
  }
  if (base.productionBlocked || base.percentEnabled || base.productionPercent > 0) {
    return base;
  }

  const openForAll = parseTruthy(env.PEIMA_TEST_MATCH_OPEN_FOR_ALL, false);
  if (!openForAll) {
    const allow = parseIds(env.PEIMA_TEST_MATCH_RESULT_WRITER_USER_IDS);
    if (!allow.has(userId)) {
      return {
        ...base,
        reason: TEST_MATCH_RESULT_WRITER_USER_NOT_ALLOWED_REASON,
      };
    }
  }

  return {
    ...base,
    writerEnabled: true,
    canWriteMatchResult: true,
    mode: "allowed",
    reason: TEST_MATCH_RESULT_WRITER_ALLOWED_REASON,
    safety: {
      writesMatchResult: true,
      triggersWorker: false,
      changesCanonical: false,
      changesPercent: false,
    },
  };
}

export type LegacyPhotoMatchResultWriteInput = {
  userId: string;
  candidateUserId: string;
  batchId: string;
  finalScore: number;
  reasonSummary: string;
  matchInsights: Prisma.InputJsonValue;
  status: string;
};

export type LegacyPhotoMatchResultWriteResult =
  | { mode: "written"; written: true; reason: "old_photo_matching_writer_wrote" }
  | {
      mode: "blocked" | "skipped";
      written: false;
      reason: string;
      safety: OldPhotoMatchingWriterSafetyV1;
    };

export type MatchResultCreateClient = {
  matchResult: {
    create: (args: { data: LegacyPhotoMatchResultWriteInput }) => Promise<unknown>;
  };
};

/**
 * Single write choke-point for legacy photo batch-match MatchResult creation.
 */
export async function writeLegacyPhotoMatchResultIfAllowed(
  prisma: MatchResultCreateClient,
  data: LegacyPhotoMatchResultWriteInput,
  gate: OldPhotoMatchingWriterGateV1 = readOldPhotoMatchingWriterGate(),
): Promise<LegacyPhotoMatchResultWriteResult> {
  if (!gate.canWriteMatchResult) {
    return {
      mode: "blocked",
      written: false,
      reason: gate.reason,
      safety: gate.safety,
    };
  }

  await prisma.matchResult.create({ data });
  return {
    mode: "written",
    written: true,
    reason: "old_photo_matching_writer_wrote",
  };
}
