/**
 * P7.10-r3f3 — CLI args for canonical match result sidecar writer dev runner.
 */

import * as path from "path";

export const P710_R3F3_DEFAULT_SUMMARY_JSON = path.join(
  "..",
  "..",
  "artifacts",
  "p76",
  "r3f3",
  "canonical-sidecar-writer-smoke-summary.json",
);

export const P710_R3F3_DEFAULT_SUMMARY_MD = path.join(
  "..",
  "..",
  "artifacts",
  "p76",
  "r3f3",
  "canonical-sidecar-writer-smoke-summary.md",
);

export type P710R3f3CanonicalSidecarWriterCliArgs = {
  auditRunId: string;
  environment: "dev" | "staging";
  insert: boolean;
  cleanup: boolean;
  verify: boolean;
  includeDuplicateProbe: boolean;
  outputJsonPath: string;
  outputMdPath: string;
  pretty: boolean;
};

export class P710R3f3CliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P710R3f3CliArgsError";
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
  throw new P710R3f3CliArgsError(`invalid boolean for ${field}: ${raw}`);
}

export function defaultP710R3f3AuditRunId(now = Date.now()): string {
  return `r3f3-local-smoke-${now}`;
}

export function parseP710R3f3CanonicalSidecarWriterCliArgs(
  argv: string[],
  now = Date.now(),
): P710R3f3CanonicalSidecarWriterCliArgs {
  let auditRunId = defaultP710R3f3AuditRunId(now);
  let environment: "dev" | "staging" = "dev";
  let insert = false;
  let cleanup = false;
  let verify = false;
  let includeDuplicateProbe = true;
  let outputJsonPath = P710_R3F3_DEFAULT_SUMMARY_JSON;
  let outputMdPath = P710_R3F3_DEFAULT_SUMMARY_MD;
  let pretty = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;

    if (a === "--pretty") {
      pretty = true;
    } else if (a.startsWith("--auditRunId=")) {
      auditRunId = a.slice("--auditRunId=".length).trim() || auditRunId;
    } else if (a === "--auditRunId") {
      const v = takeValue(argv, i);
      if (v) {
        auditRunId = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--environment=")) {
      const env = a.slice("--environment=".length).trim().toLowerCase();
      if (env !== "dev" && env !== "staging") {
        throw new P710R3f3CliArgsError("environment must be dev or staging");
      }
      environment = env;
    } else if (a === "--environment") {
      const v = takeValue(argv, i);
      if (v) {
        const env = v.trim().toLowerCase();
        if (env !== "dev" && env !== "staging") {
          throw new P710R3f3CliArgsError("environment must be dev or staging");
        }
        environment = env;
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
    } else if (a.startsWith("--cleanup=")) {
      cleanup = parseBooleanFlag(a.slice("--cleanup=".length), "cleanup");
    } else if (a === "--cleanup") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        cleanup = parseBooleanFlag(v, "cleanup");
        i += 1;
      } else {
        cleanup = true;
      }
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
    } else if (a.startsWith("--includeDuplicateProbe=")) {
      includeDuplicateProbe = parseBooleanFlag(
        a.slice("--includeDuplicateProbe=".length),
        "includeDuplicateProbe",
      );
    } else if (a === "--includeDuplicateProbe") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        includeDuplicateProbe = parseBooleanFlag(v, "includeDuplicateProbe");
        i += 1;
      }
    }
  }

  if (insert) {
    if (!argv.some((x) => x.startsWith("--cleanup"))) {
      cleanup = true;
    }
    if (!argv.some((x) => x.startsWith("--verify"))) {
      verify = true;
    }
  }

  return {
    auditRunId,
    environment,
    insert,
    cleanup,
    verify,
    includeDuplicateProbe,
    outputJsonPath,
    outputMdPath,
    pretty,
  };
}
