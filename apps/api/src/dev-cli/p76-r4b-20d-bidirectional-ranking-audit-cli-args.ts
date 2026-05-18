/**
 * P7.6-r4b: CLI args for 20D bidirectional ranking shadow audit (read-only).
 */

import type { TwentyDPoolSourceType } from "../modules/matching/p76-20d-bidirectional-ranking.types";

export const P76_R4B_DEFAULT_SOURCE_POOL_TYPE: TwentyDPoolSourceType =
  "onboarding_gated_cohort";

export const P76_R4B_DEFAULT_STAGE1_SOURCE_VERSION =
  "p7.6-r3-photovisual-first-pool-shadow-v1";

export type P76R4bTwentyDBidirectionalRankingAuditCliArgs = {
  viewerUserId: string;
  candidateUserIds: string[];
  sourcePoolType: TwentyDPoolSourceType;
  topN: number;
  stage1SourceVersion: string;
  dryRun: true;
};

export class P76R4bCliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76R4bCliArgsError";
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
  throw new P76R4bCliArgsError(`invalid boolean value: ${raw}`);
}

function parsePositiveInt(raw: string, name: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new P76R4bCliArgsError(`${name} must be a positive integer`);
  }
  return n;
}

export function parseCandidateUserIdsCsv(raw: string): string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of parts) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  if (out.length === 0) {
    throw new P76R4bCliArgsError(
      "--candidateUserIds must contain at least one id",
    );
  }
  return out;
}

export function parseP76R4bTwentyDBidirectionalRankingAuditCliArgs(
  argv: string[],
): P76R4bTwentyDBidirectionalRankingAuditCliArgs {
  let viewerUserId: string | undefined;
  let candidateUserIds: string[] | undefined;
  let sourcePoolType: TwentyDPoolSourceType = P76_R4B_DEFAULT_SOURCE_POOL_TYPE;
  let topN = 6;
  let stage1SourceVersion = P76_R4B_DEFAULT_STAGE1_SOURCE_VERSION;
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
    } else if (a.startsWith("--candidateUserIds=")) {
      candidateUserIds = parseCandidateUserIdsCsv(
        a.slice("--candidateUserIds=".length),
      );
    } else if (a === "--candidateUserIds") {
      const v = takeValue(argv, i);
      if (v) {
        candidateUserIds = parseCandidateUserIdsCsv(v);
        i += 1;
      }
    } else if (a.startsWith("--sourcePoolType=")) {
      sourcePoolType = a.slice("--sourcePoolType=".length).trim() as TwentyDPoolSourceType;
    } else if (a === "--sourcePoolType") {
      const v = takeValue(argv, i);
      if (v) {
        sourcePoolType = v.trim() as TwentyDPoolSourceType;
        i += 1;
      }
    } else if (a.startsWith("--topN=")) {
      topN = parsePositiveInt(a.slice("--topN=".length), "--topN");
    } else if (a === "--topN") {
      const v = takeValue(argv, i);
      if (v) {
        topN = parsePositiveInt(v, "--topN");
        i += 1;
      }
    } else if (a.startsWith("--stage1SourceVersion=")) {
      stage1SourceVersion = a.slice("--stage1SourceVersion=".length).trim();
    } else if (a === "--stage1SourceVersion") {
      const v = takeValue(argv, i);
      if (v) {
        stage1SourceVersion = v.trim();
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
    throw new P76R4bCliArgsError("--viewerUserId is required");
  }

  if (!candidateUserIds) {
    throw new P76R4bCliArgsError("--candidateUserIds is required");
  }

  if (sourcePoolType !== P76_R4B_DEFAULT_SOURCE_POOL_TYPE) {
    throw new P76R4bCliArgsError(
      `P7.6-r4b only supports --sourcePoolType=${P76_R4B_DEFAULT_SOURCE_POOL_TYPE}`,
    );
  }

  if (dryRun !== true) {
    throw new P76R4bCliArgsError(
      "P7.6-r4b requires --dryRun=true (read-only audit; no DB writes)",
    );
  }

  return {
    viewerUserId,
    candidateUserIds,
    sourcePoolType,
    topN,
    stage1SourceVersion,
    dryRun: true,
  };
}
