/**
 * CLI args for P7.5-r4-g candidate vision coverage audit (read-only).
 */

export type R4GVisionCoverageCliArgs = {
  limitPools: number;
  userId?: string;
  poolId?: string;
  since?: Date;
  until?: Date;
  includeArchived: boolean;
  debugIds: boolean;
};

/** Parse yyyy-mm-dd -> UTC start of day */
function parseYmdUtc(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
}

function takeValue(argv: string[], i: number): string | undefined {
  const n = argv[i + 1];
  if (!n || n.startsWith("--")) return undefined;
  return n;
}

function parseBoolArg(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const s = raw.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return fallback;
}

export function parseR4GVisionCoverageCliArgs(
  argv: string[],
): R4GVisionCoverageCliArgs {
  let limitPools = 100;
  let userId: string | undefined;
  let poolId: string | undefined;
  let sinceStr: string | undefined;
  let untilStr: string | undefined;
  let includeArchived = false;
  let debugIds = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--limit=")) {
      limitPools = Number.parseInt(a.slice("--limit=".length), 10);
    } else if (a === "--limit") {
      const v = takeValue(argv, i);
      if (v) {
        limitPools = Number.parseInt(v, 10);
        i += 1;
      }
    } else if (a.startsWith("--userId=")) {
      userId = a.slice("--userId=".length).trim() || undefined;
    } else if (a === "--userId") {
      const v = takeValue(argv, i);
      if (v) {
        userId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--poolId=")) {
      poolId = a.slice("--poolId=".length).trim() || undefined;
    } else if (a === "--poolId") {
      const v = takeValue(argv, i);
      if (v) {
        poolId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--since=")) {
      sinceStr = a.slice("--since=".length).trim();
    } else if (a === "--since") {
      const v = takeValue(argv, i);
      if (v) {
        sinceStr = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--until=")) {
      untilStr = a.slice("--until=".length).trim();
    } else if (a === "--until") {
      const v = takeValue(argv, i);
      if (v) {
        untilStr = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--includeArchived=")) {
      includeArchived = parseBoolArg(
        a.slice("--includeArchived=".length),
        includeArchived,
      );
    } else if (a === "--includeArchived") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        includeArchived = parseBoolArg(v, includeArchived);
        i += 1;
      } else {
        includeArchived = true;
      }
    } else if (a.startsWith("--debugIds=")) {
      debugIds = parseBoolArg(a.slice("--debugIds=".length), debugIds);
    } else if (a === "--debugIds") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        debugIds = parseBoolArg(v, debugIds);
        i += 1;
      } else {
        debugIds = true;
      }
    }
  }

  if (!Number.isFinite(limitPools) || limitPools < 1) limitPools = 100;
  limitPools = Math.min(limitPools, 5_000);

  const since = sinceStr ? parseYmdUtc(sinceStr) : undefined;
  const untilRaw = untilStr ? parseYmdUtc(untilStr) : undefined;
  const until =
    untilRaw === undefined
      ? undefined
      : new Date(
          Date.UTC(
            untilRaw.getUTCFullYear(),
            untilRaw.getUTCMonth(),
            untilRaw.getUTCDate(),
            23,
            59,
            59,
            999,
          ),
        );

  return {
    limitPools,
    userId,
    poolId,
    since,
    until,
    includeArchived,
    debugIds,
  };
}
