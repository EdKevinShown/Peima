/**
 * CLI args for P7.5-r4-f onboarding vision sidecar backfill (dev-only).
 */

export type P75R4FVisionBackfillProvider = "rules" | "stub";

export type P75R4FVisionBackfillCliArgs = {
  limit: number;
  userId?: string;
  provider: P75R4FVisionBackfillProvider;
  dryRun: boolean;
  onlyMissingVision: boolean;
  includeBlocked: boolean;
};

function takeValue(argv: string[], i: number): string | undefined {
  const n = argv[i + 1];
  if (!n || n.startsWith("--")) return undefined;
  return n;
}

function parseBoolArg(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const s = raw.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return defaultValue;
}

export function parseP75R4FVisionBackfillCliArgs(
  argv: string[],
): P75R4FVisionBackfillCliArgs {
  let limit = 100;
  let userId: string | undefined;
  let provider: P75R4FVisionBackfillProvider = "rules";
  let dryRun = true;
  let onlyMissingVision = true;
  let includeBlocked = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--limit=")) {
      limit = Number.parseInt(a.slice("--limit=".length), 10);
    } else if (a === "--limit") {
      const v = takeValue(argv, i);
      if (v) limit = Number.parseInt(v, 10);
      if (v) i += 1;
    } else if (a.startsWith("--userId=")) {
      userId = a.slice("--userId=".length).trim() || undefined;
    } else if (a === "--userId") {
      const v = takeValue(argv, i);
      if (v) {
        userId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--provider=")) {
      const p = a.slice("--provider=".length).trim().toLowerCase();
      if (p === "stub") provider = "stub";
      else provider = "rules";
    } else if (a === "--provider") {
      const v = takeValue(argv, i);
      if (v) {
        const p = v.trim().toLowerCase();
        provider = p === "stub" ? "stub" : "rules";
        i += 1;
      }
    } else if (a.startsWith("--dryRun=")) {
      dryRun = parseBoolArg(a.slice("--dryRun=".length), dryRun);
    } else if (a === "--dryRun") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        dryRun = parseBoolArg(v, dryRun);
        i += 1;
      } else {
        dryRun = true;
      }
    } else if (a.startsWith("--onlyMissingVision=")) {
      onlyMissingVision = parseBoolArg(
        a.slice("--onlyMissingVision=".length),
        onlyMissingVision,
      );
    } else if (a === "--onlyMissingVision") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        onlyMissingVision = parseBoolArg(v, onlyMissingVision);
        i += 1;
      } else {
        onlyMissingVision = true;
      }
    } else if (a.startsWith("--includeBlocked=")) {
      includeBlocked = parseBoolArg(
        a.slice("--includeBlocked=".length),
        includeBlocked,
      );
    } else if (a === "--includeBlocked") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        includeBlocked = parseBoolArg(v, includeBlocked);
        i += 1;
      } else {
        includeBlocked = true;
      }
    }
  }

  if (!Number.isFinite(limit) || limit < 1) limit = 100;

  return {
    limit: Math.min(limit, 50_000),
    userId,
    provider,
    dryRun,
    onlyMissingVision,
    includeBlocked,
  };
}
