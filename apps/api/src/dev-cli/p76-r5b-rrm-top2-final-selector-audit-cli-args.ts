/**
 * P7.6-r5b: CLI args for RRM Top2 Final Selector shadow audit (read-only).
 */

import type { RrmPoolSourceType } from "../modules/matching/p76-rrm-top2-final-selector.types";

export const P76_R5B_DEFAULT_SOURCE_POOL_TYPE: RrmPoolSourceType =
  "onboarding_gated_cohort";

export const P76_R5B_DEFAULT_STAGE2_SOURCE_VERSION =
  "p7.6-r4a-20d-bidirectional-ranking-shadow-v1";

export const P76_R5B_REQUIRED_TOP2_COUNT = 2;

export type P76R5bRrmTop2FinalSelectorAuditCliArgs = {
  viewerUserId: string;
  top2CandidateIds: [string, string];
  selectedBy20DOnlyCandidateId: string;
  sourcePoolType: RrmPoolSourceType;
  stage2SourceVersion: string;
  dryRun: true;
};

export class P76R5bCliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76R5bCliArgsError";
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
  throw new P76R5bCliArgsError(`invalid boolean value: ${raw}`);
}

export function parseTop2CandidateIdsCsv(raw: string): string[] {
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
  return out;
}

export function assertExactlyTwoTop2Ids(ids: string[]): [string, string] {
  if (ids.length !== P76_R5B_REQUIRED_TOP2_COUNT) {
    throw new P76R5bCliArgsError(
      `--top2CandidateIds must contain exactly ${P76_R5B_REQUIRED_TOP2_COUNT} ids after dedupe (got ${ids.length})`,
    );
  }
  return [ids[0]!, ids[1]!];
}

export function parseP76R5bRrmTop2FinalSelectorAuditCliArgs(
  argv: string[],
): P76R5bRrmTop2FinalSelectorAuditCliArgs {
  let viewerUserId: string | undefined;
  let top2CandidateIds: string[] | undefined;
  let selectedBy20DOnlyCandidateId: string | undefined;
  let sourcePoolType: RrmPoolSourceType = P76_R5B_DEFAULT_SOURCE_POOL_TYPE;
  let stage2SourceVersion = P76_R5B_DEFAULT_STAGE2_SOURCE_VERSION;
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
    } else if (a.startsWith("--top2CandidateIds=")) {
      top2CandidateIds = parseTop2CandidateIdsCsv(
        a.slice("--top2CandidateIds=".length),
      );
    } else if (a === "--top2CandidateIds") {
      const v = takeValue(argv, i);
      if (v) {
        top2CandidateIds = parseTop2CandidateIdsCsv(v);
        i += 1;
      }
    } else if (a.startsWith("--selectedBy20DOnlyCandidateId=")) {
      selectedBy20DOnlyCandidateId =
        a.slice("--selectedBy20DOnlyCandidateId=".length).trim() || undefined;
    } else if (a === "--selectedBy20DOnlyCandidateId") {
      const v = takeValue(argv, i);
      if (v) {
        selectedBy20DOnlyCandidateId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--sourcePoolType=")) {
      sourcePoolType = a.slice("--sourcePoolType=".length).trim() as RrmPoolSourceType;
    } else if (a === "--sourcePoolType") {
      const v = takeValue(argv, i);
      if (v) {
        sourcePoolType = v.trim() as RrmPoolSourceType;
        i += 1;
      }
    } else if (a.startsWith("--stage2SourceVersion=")) {
      stage2SourceVersion = a.slice("--stage2SourceVersion=".length).trim();
    } else if (a === "--stage2SourceVersion") {
      const v = takeValue(argv, i);
      if (v) {
        stage2SourceVersion = v.trim();
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
    throw new P76R5bCliArgsError("--viewerUserId is required");
  }

  if (!top2CandidateIds) {
    throw new P76R5bCliArgsError("--top2CandidateIds is required");
  }

  const top2Pair = assertExactlyTwoTop2Ids(top2CandidateIds);

  if (!selectedBy20DOnlyCandidateId) {
    throw new P76R5bCliArgsError("--selectedBy20DOnlyCandidateId is required");
  }

  if (sourcePoolType !== P76_R5B_DEFAULT_SOURCE_POOL_TYPE) {
    throw new P76R5bCliArgsError(
      `P7.6-r5b only supports --sourcePoolType=${P76_R5B_DEFAULT_SOURCE_POOL_TYPE}`,
    );
  }

  if (dryRun !== true) {
    throw new P76R5bCliArgsError(
      "P7.6-r5b requires --dryRun=true (read-only audit; no DB writes)",
    );
  }

  return {
    viewerUserId,
    top2CandidateIds: top2Pair,
    selectedBy20DOnlyCandidateId,
    sourcePoolType,
    stage2SourceVersion,
    dryRun: true,
  };
}
