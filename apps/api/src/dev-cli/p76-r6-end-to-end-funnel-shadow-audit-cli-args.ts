/**
 * P7.6-r6b: CLI args for end-to-end funnel shadow audit (read-only).
 */

import type { P76EndToEndSourcePoolType } from "../modules/matching/p76-end-to-end-funnel-shadow.types";

export const P76_R6B_DEFAULT_SOURCE_POOL_TYPE: P76EndToEndSourcePoolType =
  "onboarding_gated_cohort";

export const P76_R6B_REQUIRED_TOP2_COUNT = 2;

export type P76R6EndToEndFunnelShadowAuditCliArgsRaw = {
  viewerUserId: string;
  sourcePoolType: P76EndToEndSourcePoolType;
  dryRun: true;
  stage1SelectedCandidateIds: string[];
  stage2Top2CandidateIds?: string[];
  selectedBy20DOnlyCandidateId?: string;
  selectedByRrmCandidateId?: string;
  stage1AuditJsonPath?: string;
  stage2AuditJsonPath?: string;
  stage3AuditJsonPath?: string;
  matchResultId?: string;
  compareLegacy: boolean;
  compareM6: boolean;
};

export type P76R6EndToEndFunnelShadowAuditCliArgs = {
  viewerUserId: string;
  sourcePoolType: P76EndToEndSourcePoolType;
  dryRun: true;
  stage1SelectedCandidateIds: string[];
  stage2Top2CandidateIds: [string, string];
  selectedBy20DOnlyCandidateId: string;
  selectedByRrmCandidateId: string;
  stage1AuditJsonPath?: string;
  stage2AuditJsonPath?: string;
  stage3AuditJsonPath?: string;
  matchResultId?: string;
  compareLegacy: boolean;
  compareM6: boolean;
};

export class P76R6bCliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76R6bCliArgsError";
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
  throw new P76R6bCliArgsError(`invalid boolean value: ${raw}`);
}

export function parseCandidateIdsCsv(raw: string): string[] {
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
  if (ids.length !== P76_R6B_REQUIRED_TOP2_COUNT) {
    throw new P76R6bCliArgsError(
      `--stage2Top2CandidateIds must contain exactly ${P76_R6B_REQUIRED_TOP2_COUNT} ids after dedupe (got ${ids.length})`,
    );
  }
  return [ids[0]!, ids[1]!];
}

export function parseP76R6EndToEndFunnelShadowAuditCliArgsRaw(
  argv: string[],
): P76R6EndToEndFunnelShadowAuditCliArgsRaw {
  let viewerUserId: string | undefined;
  let sourcePoolType: P76EndToEndSourcePoolType =
    P76_R6B_DEFAULT_SOURCE_POOL_TYPE;
  let dryRun: boolean | undefined;
  let stage1SelectedCandidateIds: string[] = [];
  let stage2Top2CandidateIds: string[] | undefined;
  let selectedBy20DOnlyCandidateId: string | undefined;
  let selectedByRrmCandidateId: string | undefined;
  let stage1AuditJsonPath: string | undefined;
  let stage2AuditJsonPath: string | undefined;
  let stage3AuditJsonPath: string | undefined;
  let matchResultId: string | undefined;
  let compareLegacy = true;
  let compareM6 = true;

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
      sourcePoolType = a.slice("--sourcePoolType=".length).trim() as P76EndToEndSourcePoolType;
    } else if (a === "--sourcePoolType") {
      const v = takeValue(argv, i);
      if (v) {
        sourcePoolType = v.trim() as P76EndToEndSourcePoolType;
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
    } else if (a.startsWith("--stage1SelectedCandidateIds=")) {
      stage1SelectedCandidateIds = parseCandidateIdsCsv(
        a.slice("--stage1SelectedCandidateIds=".length),
      );
    } else if (a === "--stage1SelectedCandidateIds") {
      const v = takeValue(argv, i);
      if (v) {
        stage1SelectedCandidateIds = parseCandidateIdsCsv(v);
        i += 1;
      }
    } else if (a.startsWith("--stage2Top2CandidateIds=")) {
      stage2Top2CandidateIds = parseCandidateIdsCsv(
        a.slice("--stage2Top2CandidateIds=".length),
      );
    } else if (a === "--stage2Top2CandidateIds") {
      const v = takeValue(argv, i);
      if (v) {
        stage2Top2CandidateIds = parseCandidateIdsCsv(v);
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
    } else if (a.startsWith("--selectedByRrmCandidateId=")) {
      selectedByRrmCandidateId =
        a.slice("--selectedByRrmCandidateId=".length).trim() || undefined;
    } else if (a === "--selectedByRrmCandidateId") {
      const v = takeValue(argv, i);
      if (v) {
        selectedByRrmCandidateId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--stage1AuditJsonPath=")) {
      stage1AuditJsonPath =
        a.slice("--stage1AuditJsonPath=".length).trim() || undefined;
    } else if (a === "--stage1AuditJsonPath") {
      const v = takeValue(argv, i);
      if (v) {
        stage1AuditJsonPath = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--stage2AuditJsonPath=")) {
      stage2AuditJsonPath =
        a.slice("--stage2AuditJsonPath=".length).trim() || undefined;
    } else if (a === "--stage2AuditJsonPath") {
      const v = takeValue(argv, i);
      if (v) {
        stage2AuditJsonPath = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--stage3AuditJsonPath=")) {
      stage3AuditJsonPath =
        a.slice("--stage3AuditJsonPath=".length).trim() || undefined;
    } else if (a === "--stage3AuditJsonPath") {
      const v = takeValue(argv, i);
      if (v) {
        stage3AuditJsonPath = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--matchResultId=")) {
      matchResultId = a.slice("--matchResultId=".length).trim() || undefined;
    } else if (a === "--matchResultId") {
      const v = takeValue(argv, i);
      if (v) {
        matchResultId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--compareLegacy=")) {
      compareLegacy = parseBooleanFlag(a.slice("--compareLegacy=".length));
    } else if (a === "--compareLegacy") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        compareLegacy = parseBooleanFlag(v);
        i += 1;
      }
    } else if (a.startsWith("--compareM6=")) {
      compareM6 = parseBooleanFlag(a.slice("--compareM6=".length));
    } else if (a === "--compareM6") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        compareM6 = parseBooleanFlag(v);
        i += 1;
      }
    }
  }

  if (!viewerUserId) {
    throw new P76R6bCliArgsError("--viewerUserId is required");
  }

  if (sourcePoolType !== P76_R6B_DEFAULT_SOURCE_POOL_TYPE) {
    throw new P76R6bCliArgsError(
      `P7.6-r6b only supports --sourcePoolType=${P76_R6B_DEFAULT_SOURCE_POOL_TYPE}`,
    );
  }

  if (dryRun !== true) {
    throw new P76R6bCliArgsError(
      "P7.6-r6b requires --dryRun=true (read-only audit; no DB writes)",
    );
  }

  if (!stage2Top2CandidateIds && !stage2AuditJsonPath) {
    throw new P76R6bCliArgsError(
      "provide --stage2Top2CandidateIds or --stage2AuditJsonPath",
    );
  }

  if (!selectedBy20DOnlyCandidateId && !stage2AuditJsonPath) {
    throw new P76R6bCliArgsError(
      "provide --selectedBy20DOnlyCandidateId or --stage2AuditJsonPath",
    );
  }

  if (!selectedByRrmCandidateId && !stage3AuditJsonPath) {
    throw new P76R6bCliArgsError(
      "provide --selectedByRrmCandidateId or --stage3AuditJsonPath",
    );
  }

  return {
    viewerUserId,
    sourcePoolType,
    dryRun: true,
    stage1SelectedCandidateIds,
    stage2Top2CandidateIds,
    selectedBy20DOnlyCandidateId,
    selectedByRrmCandidateId,
    stage1AuditJsonPath,
    stage2AuditJsonPath,
    stage3AuditJsonPath,
    matchResultId,
    compareLegacy,
    compareM6,
  };
}

export function finalizeP76R6EndToEndFunnelShadowAuditCliArgs(
  raw: P76R6EndToEndFunnelShadowAuditCliArgsRaw,
  jsonExtract?: {
    stage2Top2CandidateIds?: string[];
    selectedBy20DOnlyCandidateId?: string | null;
    selectedByRrmCandidateId?: string | null;
  },
): P76R6EndToEndFunnelShadowAuditCliArgs {
  const top2Ids =
    raw.stage2Top2CandidateIds ??
    (jsonExtract?.stage2Top2CandidateIds?.length
      ? jsonExtract.stage2Top2CandidateIds
      : undefined);

  if (!top2Ids) {
    throw new P76R6bCliArgsError(
      "stage2 top2 missing: provide --stage2Top2CandidateIds or valid --stage2AuditJsonPath",
    );
  }

  const top2Pair = assertExactlyTwoTop2Ids(top2Ids);

  const winner20d =
    raw.selectedBy20DOnlyCandidateId?.trim() ||
    jsonExtract?.selectedBy20DOnlyCandidateId?.trim() ||
    "";
  if (!winner20d) {
    throw new P76R6bCliArgsError(
      "selectedBy20DOnlyCandidateId missing: provide CLI flag or valid --stage2AuditJsonPath",
    );
  }

  const rrmId =
    raw.selectedByRrmCandidateId?.trim() ||
    jsonExtract?.selectedByRrmCandidateId?.trim() ||
    "";
  if (!rrmId) {
    throw new P76R6bCliArgsError(
      "selectedByRrmCandidateId missing: provide CLI flag or valid --stage3AuditJsonPath",
    );
  }

  return {
    viewerUserId: raw.viewerUserId,
    sourcePoolType: raw.sourcePoolType,
    dryRun: true,
    stage1SelectedCandidateIds: raw.stage1SelectedCandidateIds,
    stage2Top2CandidateIds: top2Pair,
    selectedBy20DOnlyCandidateId: winner20d,
    selectedByRrmCandidateId: rrmId,
    stage1AuditJsonPath: raw.stage1AuditJsonPath,
    stage2AuditJsonPath: raw.stage2AuditJsonPath,
    stage3AuditJsonPath: raw.stage3AuditJsonPath,
    matchResultId: raw.matchResultId,
    compareLegacy: raw.compareLegacy,
    compareM6: raw.compareM6,
  };
}

export function parseP76R6EndToEndFunnelShadowAuditCliArgs(
  argv: string[],
): P76R6EndToEndFunnelShadowAuditCliArgsRaw {
  return parseP76R6EndToEndFunnelShadowAuditCliArgsRaw(argv);
}
