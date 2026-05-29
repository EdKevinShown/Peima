/**
 * P7.6-r8b: CLI args for allowlist apply sidecar writer (dev-cli).
 */

import {
  P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
  type P76AllowlistApplyInputV1,
  type P76AllowlistSignoffStatus,
} from "../modules/matching/p76-allowlist-apply-meta.types";

export type P76R8bAllowlistApplyWriterCliArgs = P76AllowlistApplyInputV1;

export class P76R8bCliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76R8bCliArgsError";
  }
}

function takeValue(argv: string[], i: number): string | undefined {
  const n = argv[i + 1];
  if (!n || n.startsWith("--")) return undefined;
  return n;
}

function parseBooleanFlag(raw: string, name: string): boolean {
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes"].includes(v)) return true;
  if (["0", "false", "no"].includes(v)) return false;
  throw new P76R8bCliArgsError(`${name} must be true or false`);
}

function parseCsvIds(raw: string | undefined, name: string): string[] {
  if (raw == null || raw.trim() === "") {
    throw new P76R8bCliArgsError(`${name} is required (comma-separated ids)`);
  }
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) {
    throw new P76R8bCliArgsError(`${name} must contain at least one id`);
  }
  return ids;
}

function parseSignoff(
  raw: string | undefined,
  name: string,
): P76AllowlistSignoffStatus {
  const v = (raw ?? "pending").trim().toLowerCase();
  if (v === "pending" || v === "approved" || v === "rejected") {
    return v;
  }
  throw new P76R8bCliArgsError(
    `${name} must be pending, approved, or rejected`,
  );
}

export function parseP76R8bAllowlistApplyWriterCliArgs(
  argv: string[],
): P76R8bAllowlistApplyWriterCliArgs {
  let viewerUserId: string | undefined;
  let selectedCandidateId: string | undefined;
  let sourceVersion: string = P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION;
  let routeCArtifactPath: string | undefined;
  let stage1SelectedCandidateIds: string | undefined;
  let stage2Top2CandidateIds: string | undefined;
  let selectedBy20DOnlyCandidateId: string | undefined;
  let selectedByRrmCandidateId: string | undefined;
  let finalShadowSelectedCandidateId: string | undefined;
  let pmSignoffStatus: P76AllowlistSignoffStatus = "approved";
  let opsSignoffStatus: P76AllowlistSignoffStatus = "pending";
  let cliDryRun: boolean | undefined;
  let appliedBy: string | undefined;

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
    } else if (a.startsWith("--selectedCandidateId=")) {
      selectedCandidateId =
        a.slice("--selectedCandidateId=".length).trim() || undefined;
    } else if (a === "--selectedCandidateId") {
      const v = takeValue(argv, i);
      if (v) {
        selectedCandidateId = v.trim() || undefined;
        i += 1;
      }
    } else if (a.startsWith("--sourceVersion=")) {
      sourceVersion = a.slice("--sourceVersion=".length).trim();
    } else if (a === "--sourceVersion") {
      const v = takeValue(argv, i);
      if (v) {
        sourceVersion = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--routeCArtifactPath=")) {
      routeCArtifactPath = a.slice("--routeCArtifactPath=".length).trim();
    } else if (a === "--routeCArtifactPath") {
      const v = takeValue(argv, i);
      if (v) {
        routeCArtifactPath = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--stage1SelectedCandidateIds=")) {
      stage1SelectedCandidateIds = a.slice(
        "--stage1SelectedCandidateIds=".length,
      );
    } else if (a === "--stage1SelectedCandidateIds") {
      const v = takeValue(argv, i);
      if (v) {
        stage1SelectedCandidateIds = v;
        i += 1;
      }
    } else if (a.startsWith("--stage2Top2CandidateIds=")) {
      stage2Top2CandidateIds = a.slice("--stage2Top2CandidateIds=".length);
    } else if (a === "--stage2Top2CandidateIds") {
      const v = takeValue(argv, i);
      if (v) {
        stage2Top2CandidateIds = v;
        i += 1;
      }
    } else if (a.startsWith("--selectedBy20DOnlyCandidateId=")) {
      selectedBy20DOnlyCandidateId = a.slice(
        "--selectedBy20DOnlyCandidateId=".length,
      ).trim();
    } else if (a === "--selectedBy20DOnlyCandidateId") {
      const v = takeValue(argv, i);
      if (v) {
        selectedBy20DOnlyCandidateId = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--selectedByRrmCandidateId=")) {
      selectedByRrmCandidateId = a.slice(
        "--selectedByRrmCandidateId=".length,
      ).trim();
    } else if (a === "--selectedByRrmCandidateId") {
      const v = takeValue(argv, i);
      if (v) {
        selectedByRrmCandidateId = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--finalShadowSelectedCandidateId=")) {
      finalShadowSelectedCandidateId = a.slice(
        "--finalShadowSelectedCandidateId=".length,
      ).trim();
    } else if (a === "--finalShadowSelectedCandidateId") {
      const v = takeValue(argv, i);
      if (v) {
        finalShadowSelectedCandidateId = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--pmSignoffStatus=")) {
      pmSignoffStatus = parseSignoff(
        a.slice("--pmSignoffStatus=".length),
        "--pmSignoffStatus",
      );
    } else if (a === "--pmSignoffStatus") {
      const v = takeValue(argv, i);
      pmSignoffStatus = parseSignoff(v, "--pmSignoffStatus");
      if (v) i += 1;
    } else if (a.startsWith("--opsSignoffStatus=")) {
      opsSignoffStatus = parseSignoff(
        a.slice("--opsSignoffStatus=".length),
        "--opsSignoffStatus",
      );
    } else if (a === "--opsSignoffStatus") {
      const v = takeValue(argv, i);
      opsSignoffStatus = parseSignoff(v, "--opsSignoffStatus");
      if (v) i += 1;
    } else if (a.startsWith("--dryRun=")) {
      cliDryRun = parseBooleanFlag(a.slice("--dryRun=".length), "--dryRun");
    } else if (a === "--dryRun") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        cliDryRun = parseBooleanFlag(v, "--dryRun");
        i += 1;
      } else {
        throw new P76R8bCliArgsError("--dryRun requires true or false");
      }
    } else if (a.startsWith("--appliedBy=")) {
      appliedBy = a.slice("--appliedBy=".length).trim();
    } else if (a === "--appliedBy") {
      const v = takeValue(argv, i);
      if (v) {
        appliedBy = v.trim();
        i += 1;
      }
    }
  }

  if (!viewerUserId) {
    throw new P76R8bCliArgsError("--viewerUserId is required");
  }
  if (!selectedCandidateId) {
    throw new P76R8bCliArgsError("--selectedCandidateId is required");
  }
  if (!finalShadowSelectedCandidateId) {
    finalShadowSelectedCandidateId = selectedCandidateId;
  }
  if (cliDryRun === undefined) {
    throw new P76R8bCliArgsError("--dryRun is required (true or false)");
  }

  return {
    viewerUserId,
    selectedCandidateId,
    sourceVersion: sourceVersion.trim(),
    routeCArtifactPath: routeCArtifactPath ?? null,
    stage1SelectedCandidateIds: parseCsvIds(
      stage1SelectedCandidateIds,
      "--stage1SelectedCandidateIds",
    ),
    stage2Top2CandidateIds: parseCsvIds(
      stage2Top2CandidateIds,
      "--stage2Top2CandidateIds",
    ),
    selectedBy20DOnlyCandidateId: selectedBy20DOnlyCandidateId ?? null,
    selectedByRrmCandidateId: selectedByRrmCandidateId ?? null,
    finalShadowSelectedCandidateId,
    pmSignoffStatus,
    opsSignoffStatus,
    cliDryRun,
    appliedBy: appliedBy ?? null,
  };
}
