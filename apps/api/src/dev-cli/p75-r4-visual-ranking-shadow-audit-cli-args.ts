/**
 * CLI args for P7.5-r4-c visual ranking shadow audit.
 */

import { VISUAL_RANKING_SHADOW_SOURCE_VERSION } from "../modules/onboarding/vision/visual-ranking-shadow.types";

export type P75R4ShadowAuditCliArgs = {
  limit: number;
  userId?: string;
  sourceVersion: string;
  shadowType: string;
  since?: Date;
  until?: Date;
  jsonl: boolean;
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

export function parseP75R4ShadowAuditCliArgs(argv: string[]): P75R4ShadowAuditCliArgs {
  let limit = 100;
  let userId: string | undefined;
  let sourceVersion: string = VISUAL_RANKING_SHADOW_SOURCE_VERSION;
  const shadowType = "visual_ranking_shadow";
  let sinceStr: string | undefined;
  let untilStr: string | undefined;
  let jsonl = false;

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
    } else if (a.startsWith("--sourceVersion=")) {
      sourceVersion = a.slice("--sourceVersion=".length).trim() || sourceVersion;
    } else if (a === "--sourceVersion") {
      const v = takeValue(argv, i);
      if (v) sourceVersion = v.trim();
      if (v) i += 1;
    } else if (a.startsWith("--since=")) {
      sinceStr = a.slice("--since=".length).trim();
    } else if (a === "--since") {
      const v = takeValue(argv, i);
      if (v) sinceStr = v.trim();
      if (v) i += 1;
    } else if (a.startsWith("--until=")) {
      untilStr = a.slice("--until=".length).trim();
    } else if (a === "--until") {
      const v = takeValue(argv, i);
      if (v) untilStr = v.trim();
      if (v) i += 1;
    } else if (a.startsWith("--jsonl=")) {
      jsonl =
        ["1", "true", "yes"].includes(
          a.slice("--jsonl=".length).trim().toLowerCase(),
        );
    } else if (a === "--jsonl") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        jsonl =
          ["1", "true", "yes"].includes(v.trim().toLowerCase());
        i += 1;
      } else {
        jsonl = true;
      }
    }
  }

  if (!Number.isFinite(limit) || limit < 1) limit = 100;
  const cappedLimit = Math.min(limit, 50_000);

  const since = sinceStr ? parseYmdUtc(sinceStr) : undefined;
  const untilRaw = untilStr ? parseYmdUtc(untilStr) : undefined;

  /** Inclusive until end of UTC day when only date supplied */
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
    limit: cappedLimit,
    userId,
    sourceVersion,
    shadowType,
    since,
    until,
    jsonl,
  };
}
