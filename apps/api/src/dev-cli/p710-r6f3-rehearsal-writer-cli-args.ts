/**
 * P7.10-r6f3 — CLI args for rehearsal writer dev runner.
 */

import * as path from "path";

/** Repo-root artifacts (from `apps/api` cwd: `../../artifacts/...`). */
export const P710_R6F3_DEFAULT_ARTIFACT = path.join(
  "..",
  "..",
  "artifacts",
  "p76",
  "r6c2a",
  "canonical-writer-shadow-audit-targeted.json",
);

export const P710_R6F3_DEFAULT_SUMMARY_JSON = path.join(
  "..",
  "..",
  "artifacts",
  "p76",
  "r6f3",
  "rehearsal-writer-insert-smoke-summary.json",
);

export const P710_R6F3_DEFAULT_SUMMARY_MD = path.join(
  "..",
  "..",
  "artifacts",
  "p76",
  "r6f3",
  "rehearsal-writer-insert-smoke-summary.md",
);

export type P710R6f3RehearsalWriterCliArgs = {
  artifactPath: string;
  auditRunId?: string;
  environment: "dev" | "staging";
  dryRun: boolean;
  insert: boolean;
  includeBlocked: boolean;
  readPathSourceVersion?: string;
  outputJsonPath: string;
  outputMdPath: string;
  cleanup: boolean;
  verify: boolean;
  pretty: boolean;
};

export class P710R6f3CliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P710R6f3CliArgsError";
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
  throw new P710R6f3CliArgsError(`invalid boolean for ${field}: ${raw}`);
}

export function parseP710R6f3RehearsalWriterCliArgs(
  argv: string[],
): P710R6f3RehearsalWriterCliArgs {
  let artifactPath = P710_R6F3_DEFAULT_ARTIFACT;
  let auditRunId: string | undefined;
  let environment: "dev" | "staging" = "dev";
  let dryRun = true;
  let insert = false;
  let includeBlocked = true;
  let readPathSourceVersion: string | undefined;
  let outputJsonPath = P710_R6F3_DEFAULT_SUMMARY_JSON;
  let outputMdPath = P710_R6F3_DEFAULT_SUMMARY_MD;
  let cleanup = false;
  let verify = true;
  let pretty = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;

    if (a === "--pretty") {
      pretty = true;
    } else if (a.startsWith("--artifact=")) {
      artifactPath = a.slice("--artifact=".length).trim() || artifactPath;
    } else if (a === "--artifact") {
      const v = takeValue(argv, i);
      if (v) {
        artifactPath = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--auditRunId=")) {
      auditRunId = a.slice("--auditRunId=".length).trim() || undefined;
    } else if (a === "--auditRunId") {
      const v = takeValue(argv, i);
      if (v) {
        auditRunId = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--environment=")) {
      const env = a.slice("--environment=".length).trim().toLowerCase();
      if (env !== "dev" && env !== "staging") {
        throw new P710R6f3CliArgsError("environment must be dev or staging");
      }
      environment = env;
    } else if (a === "--environment") {
      const v = takeValue(argv, i);
      if (v) {
        const env = v.trim().toLowerCase();
        if (env !== "dev" && env !== "staging") {
          throw new P710R6f3CliArgsError("environment must be dev or staging");
        }
        environment = env;
        i += 1;
      }
    } else if (a.startsWith("--readPathSourceVersion=")) {
      readPathSourceVersion =
        a.slice("--readPathSourceVersion=".length).trim() || undefined;
    } else if (a === "--readPathSourceVersion") {
      const v = takeValue(argv, i);
      if (v) {
        readPathSourceVersion = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--output=")) {
      outputJsonPath = a.slice("--output=".length).trim() || outputJsonPath;
    } else if (a === "--output") {
      const v = takeValue(argv, i);
      if (v) {
        outputJsonPath = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--outputMd=")) {
      outputMdPath = a.slice("--outputMd=".length).trim() || outputMdPath;
    } else if (a === "--outputMd") {
      const v = takeValue(argv, i);
      if (v) {
        outputMdPath = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--dryRun=")) {
      dryRun = parseBooleanFlag(a.slice("--dryRun=".length), "dryRun");
    } else if (a === "--dryRun") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        dryRun = parseBooleanFlag(v, "dryRun");
        i += 1;
      }
    } else if (a.startsWith("--insert=")) {
      insert = parseBooleanFlag(a.slice("--insert=".length), "insert");
    } else if (a === "--insert") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        insert = parseBooleanFlag(v, "insert");
        i += 1;
      } else {
        insert = true;
      }
    } else if (a.startsWith("--includeBlocked=")) {
      includeBlocked = parseBooleanFlag(
        a.slice("--includeBlocked=".length),
        "includeBlocked",
      );
    } else if (a === "--includeBlocked") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        includeBlocked = parseBooleanFlag(v, "includeBlocked");
        i += 1;
      }
    } else if (a.startsWith("--cleanup=")) {
      cleanup = parseBooleanFlag(a.slice("--cleanup=".length), "cleanup");
    } else if (a === "--cleanup") {
      cleanup = true;
    } else if (a.startsWith("--verify=")) {
      verify = parseBooleanFlag(a.slice("--verify=".length), "verify");
    } else if (a === "--verify") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        verify = parseBooleanFlag(v, "verify");
        i += 1;
      } else {
        verify = true;
      }
    }
  }

  if (insert) {
    dryRun = false;
  }
  if (!insert && !dryRun) {
    throw new P710R6f3CliArgsError(
      "must enable --dryRun=true (default) or --insert=true",
    );
  }
  if (insert && cleanup === false && argv.every((x) => !x.startsWith("--cleanup"))) {
    // default cleanup on insert smoke unless explicitly disabled
    cleanup = true;
  }

  return {
    artifactPath,
    auditRunId,
    environment,
    dryRun,
    insert,
    includeBlocked,
    readPathSourceVersion,
    outputJsonPath,
    outputMdPath,
    cleanup,
    verify,
    pretty,
  };
}
