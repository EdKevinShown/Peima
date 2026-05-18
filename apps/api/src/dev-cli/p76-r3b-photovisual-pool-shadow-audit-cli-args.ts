/**
 * P7.6-r3b: CLI args for PhotoVisual pool shadow audit (read-only).
 */

import type { PhotoVisualPoolSourceType } from "../modules/onboarding/vision/p76-photovisual-first-pool.types";

export const P76_R3B_DEFAULT_SOURCE_POOL_TYPE: PhotoVisualPoolSourceType =
  "onboarding_gated_cohort";

export type P76R3bPhotovisualPoolShadowAuditCliArgs = {
  viewerUserId: string;
  sourcePoolType: PhotoVisualPoolSourceType;
  limit: number;
  selectionLimit: number;
  dryRun: true;
};

export class P76R3bCliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76R3bCliArgsError";
  }
}

function takeValue(argv: string[], i: number): string | undefined {
  const n = argv[i + 1];
  if (!n || n.startsWith("--")) return undefined;
  return n;
}

function parseBooleanFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes"].includes(v)) return true;
  if (["0", "false", "no"].includes(v)) return false;
  throw new P76R3bCliArgsError(`invalid boolean value: ${raw}`);
}

function parsePositiveInt(raw: string, name: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new P76R3bCliArgsError(`${name} must be a positive integer`);
  }
  return n;
}

export function parseP76R3bPhotovisualPoolShadowAuditCliArgs(
  argv: string[],
): P76R3bPhotovisualPoolShadowAuditCliArgs {
  let viewerUserId: string | undefined;
  let sourcePoolType: PhotoVisualPoolSourceType = P76_R3B_DEFAULT_SOURCE_POOL_TYPE;
  let limit = 20;
  let selectionLimit = 6;
  let dryRun: boolean | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;

    if (a.startsWith("--viewerUserId=")) {
      viewerUserId = a.slice("--viewerUserId=".length).trim() || undefined;
    } else if (a === "--viewerUserId") {
      const v = takeValue(argv, i);
      if (v) {
        viewerUserId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--sourcePoolType=")) {
      sourcePoolType = a.slice("--sourcePoolType=".length).trim() as PhotoVisualPoolSourceType;
    } else if (a === "--sourcePoolType") {
      const v = takeValue(argv, i);
      if (v) {
        sourcePoolType = v.trim() as PhotoVisualPoolSourceType;
        i += 1;
      }
    } else if (a.startsWith("--limit=")) {
      limit = parsePositiveInt(a.slice("--limit=".length), "--limit");
    } else if (a === "--limit") {
      const v = takeValue(argv, i);
      if (v) {
        limit = parsePositiveInt(v, "--limit");
        i += 1;
      }
    } else if (a.startsWith("--selectionLimit=")) {
      selectionLimit = parsePositiveInt(
        a.slice("--selectionLimit=".length),
        "--selectionLimit",
      );
    } else if (a === "--selectionLimit") {
      const v = takeValue(argv, i);
      if (v) {
        selectionLimit = parsePositiveInt(v, "--selectionLimit");
        i += 1;
      }
    } else if (a.startsWith("--dryRun=")) {
      dryRun = parseBooleanFlag(a.slice("--dryRun=".length));
    } else if (a === "--dryRun") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        dryRun = parseBooleanFlag(v);
        i += 1;
      } else {
        dryRun = true;
      }
    }
  }

  if (!viewerUserId) {
    throw new P76R3bCliArgsError("--viewerUserId is required");
  }

  if (sourcePoolType !== P76_R3B_DEFAULT_SOURCE_POOL_TYPE) {
    throw new P76R3bCliArgsError(
      `P7.6-r3b only supports --sourcePoolType=${P76_R3B_DEFAULT_SOURCE_POOL_TYPE}`,
    );
  }

  if (dryRun !== true) {
    throw new P76R3bCliArgsError(
      "P7.6-r3b requires --dryRun=true (read-only audit; no DB writes)",
    );
  }

  return {
    viewerUserId,
    sourcePoolType,
    limit,
    selectionLimit,
    dryRun: true,
  };
}
