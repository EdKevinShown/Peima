/**
 * P7.6-r7g2 / r7g3: CLI args for Route C Stage1 clean pool adapter audit.
 */

import {
  P76_ROUTE_C_DEFAULT_POOL_SOURCE_VERSION,
  P76_ROUTE_C_SOURCE_POOL_TYPE,
  type RouteCStage1AdapterCliInput,
  type RouteCStage1SourcePoolType,
} from "../modules/onboarding/vision/p76-route-c-stage1-adapter.types";

export type P76R7g2RouteCStage1AdapterAuditCliArgs = RouteCStage1AdapterCliInput;

export class P76R7g2CliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76R7g2CliArgsError";
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
  throw new P76R7g2CliArgsError(`invalid boolean value: ${raw}`);
}

function parsePositiveInt(raw: string, name: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new P76R7g2CliArgsError(`${name} must be a positive integer`);
  }
  return n;
}

export function parseP76R7g2RouteCStage1AdapterAuditCliArgs(
  argv: string[],
): P76R7g2RouteCStage1AdapterAuditCliArgs {
  let viewerUserId: string | undefined;
  let sourcePoolType: RouteCStage1SourcePoolType = P76_ROUTE_C_SOURCE_POOL_TYPE;
  let poolSourceVersion: string = P76_ROUTE_C_DEFAULT_POOL_SOURCE_VERSION;
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
      sourcePoolType = a.slice("--sourcePoolType=".length).trim() as RouteCStage1SourcePoolType;
    } else if (a === "--sourcePoolType") {
      const v = takeValue(argv, i);
      if (v) {
        sourcePoolType = v.trim() as RouteCStage1SourcePoolType;
        i += 1;
      }
    } else if (a.startsWith("--poolSourceVersion=")) {
      poolSourceVersion = a.slice("--poolSourceVersion=".length).trim();
    } else if (a === "--poolSourceVersion") {
      const v = takeValue(argv, i);
      if (v) {
        poolSourceVersion = v.trim();
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
    throw new P76R7g2CliArgsError("--viewerUserId is required");
  }

  if (sourcePoolType !== P76_ROUTE_C_SOURCE_POOL_TYPE) {
    throw new P76R7g2CliArgsError(
      `P7.6-r7g2 only supports --sourcePoolType=${P76_ROUTE_C_SOURCE_POOL_TYPE}`,
    );
  }

  if (!poolSourceVersion.trim()) {
    throw new P76R7g2CliArgsError("--poolSourceVersion must be non-empty");
  }

  if (dryRun !== true) {
    throw new P76R7g2CliArgsError(
      "P7.6-r7g2 requires --dryRun=true (read-only audit; no DB writes)",
    );
  }

  return {
    viewerUserId,
    sourcePoolType,
    poolSourceVersion: poolSourceVersion.trim(),
    selectionLimit,
    dryRun: true,
  };
}
