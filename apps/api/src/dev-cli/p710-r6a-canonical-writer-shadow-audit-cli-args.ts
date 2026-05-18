/**
 * P7.10-r6a — CLI args for canonical writer shadow dev audit (read-only).
 */

import * as path from "path";

export const P710_R6A_DEFAULT_LIMIT = 20;
export const P710_R6A_MAX_LIMIT = 200;
export const P710_R6A_DEFAULT_OUTPUT = path.join(
  "artifacts",
  "p76",
  "r6a",
  "canonical-writer-shadow-audit.json",
);

export type P710R6aCanonicalWriterShadowAuditCliArgs = {
  limit: number;
  outputPath: string;
  viewerUserId?: string;
  batchId?: string;
  includeBlocked: boolean;
  /** Label only — runner never writes DB regardless. */
  dryRun: true;
  pretty: boolean;
};

export class P710R6aCliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P710R6aCliArgsError";
  }
}

function takeValue(argv: string[], i: number): string | undefined {
  const n = argv[i + 1];
  if (!n || n.startsWith("--")) return undefined;
  return n;
}

function parseBooleanFlag(raw: string, field: string): boolean {
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes"].includes(v)) return true;
  if (["0", "false", "no"].includes(v)) return false;
  throw new P710R6aCliArgsError(`invalid boolean for ${field}: ${raw}`);
}

export function parseP710R6aCanonicalWriterShadowAuditCliArgs(
  argv: string[],
): P710R6aCanonicalWriterShadowAuditCliArgs {
  let limit = P710_R6A_DEFAULT_LIMIT;
  let outputPath = P710_R6A_DEFAULT_OUTPUT;
  let viewerUserId: string | undefined;
  let batchId: string | undefined;
  let includeBlocked = true;
  let dryRun = true;
  let pretty = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;

    if (a === "--pretty") {
      pretty = true;
    } else if (a.startsWith("--limit=")) {
      limit = Number.parseInt(a.slice("--limit=".length), 10);
    } else if (a === "--limit") {
      const v = takeValue(argv, i);
      if (v) {
        limit = Number.parseInt(v, 10);
        i += 1;
      }
    } else if (a.startsWith("--output=")) {
      outputPath = a.slice("--output=".length).trim() || outputPath;
    } else if (a === "--output") {
      const v = takeValue(argv, i);
      if (v) {
        outputPath = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--viewerUserId=")) {
      viewerUserId = a.slice("--viewerUserId=".length).trim() || undefined;
    } else if (a === "--viewerUserId") {
      const v = takeValue(argv, i);
      if (v) {
        viewerUserId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--batchId=")) {
      batchId = a.slice("--batchId=".length).trim() || undefined;
    } else if (a === "--batchId") {
      const v = takeValue(argv, i);
      if (v) {
        batchId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--poolId=")) {
      batchId = a.slice("--poolId=".length).trim() || undefined;
    } else if (a === "--poolId") {
      const v = takeValue(argv, i);
      if (v) {
        batchId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--includeBlocked=")) {
      includeBlocked = parseBooleanFlag(a.slice("--includeBlocked=".length), "includeBlocked");
    } else if (a === "--includeBlocked") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        includeBlocked = parseBooleanFlag(v, "includeBlocked");
        i += 1;
      }
    } else if (a.startsWith("--dryRun=")) {
      const dr = parseBooleanFlag(a.slice("--dryRun=".length), "dryRun");
      if (!dr) {
        throw new P710R6aCliArgsError(
          "P7.10-r6a runner is always read-only; --dryRun must be true",
        );
      }
    } else if (a === "--dryRun") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        if (!parseBooleanFlag(v, "dryRun")) {
          throw new P710R6aCliArgsError(
            "P7.10-r6a runner is always read-only; --dryRun must be true",
          );
        }
        i += 1;
      }
    }
  }

  if (!Number.isFinite(limit)) limit = P710_R6A_DEFAULT_LIMIT;
  limit = Math.min(P710_R6A_MAX_LIMIT, Math.max(1, limit));

  return {
    limit,
    outputPath,
    viewerUserId,
    batchId,
    includeBlocked,
    dryRun: true,
    pretty,
  };
}
