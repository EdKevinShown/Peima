/**
 * P7.10-r6f3 — rehearsal writer CLI mapper / args / verify helpers.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildP76RehearsalWriterInputFromShadowAuditArtifact,
  parseP76CanonicalWriterShadowAuditArtifactJson,
} from "../src/modules/matching/p76-canonical-writer-rehearsal-writer-artifact-input";
import {
  buildP710R6f3WriterEnvForCli,
  assertP710R6f3InsertAllowed,
} from "../src/dev-cli/p710-r6f3-rehearsal-writer-runner";
import {
  parseP710R6f3RehearsalWriterCliArgs,
  P710_R6F3_DEFAULT_ARTIFACT,
} from "../src/dev-cli/p710-r6f3-rehearsal-writer-cli-args";

const FIXTURE = path.join(
  __dirname,
  "../../artifacts/p76/r6c2a/canonical-writer-shadow-audit-targeted.json",
);

describe("p710-r6f3 rehearsal writer artifact input", () => {
  it("maps r6c2a targeted artifact to writer input", () => {
    if (!fs.existsSync(FIXTURE)) {
      return;
    }
    const artifact = parseP76CanonicalWriterShadowAuditArtifactJson(
      fs.readFileSync(FIXTURE, "utf8"),
    );
    const input = buildP76RehearsalWriterInputFromShadowAuditArtifact({
      artifact,
      auditRunId: "audit-test-r6f3",
      environment: "dev",
    });
    expect(input.rows.length).toBeGreaterThan(0);
    expect(input.readPathSourceVersion).toBe("p7.6-r7j3-staging-cohort-v1");
    expect(input.rows.every((r) => r.shadow.appliedToMatchResult === false)).toBe(
      true,
    );
  });

  it("excludes ineligible rows when includeBlocked=false", () => {
    if (!fs.existsSync(FIXTURE)) {
      return;
    }
    const artifact = parseP76CanonicalWriterShadowAuditArtifactJson(
      fs.readFileSync(FIXTURE, "utf8"),
    );
    const all = buildP76RehearsalWriterInputFromShadowAuditArtifact({
      artifact,
      auditRunId: "a",
      environment: "dev",
      includeBlocked: true,
    });
    const eligibleOnly = buildP76RehearsalWriterInputFromShadowAuditArtifact({
      artifact,
      auditRunId: "a",
      environment: "dev",
      includeBlocked: false,
    });
    expect(eligibleOnly.rows.length).toBeLessThan(all.rows.length);
  });
});

describe("p710-r6f3 rehearsal writer cli args", () => {
  it("defaults to dry-run against r6c2a artifact", () => {
    const args = parseP710R6f3RehearsalWriterCliArgs([]);
    expect(args.dryRun).toBe(true);
    expect(args.insert).toBe(false);
    expect(args.artifactPath).toBe(P710_R6F3_DEFAULT_ARTIFACT);
    expect(args.environment).toBe("dev");
  });

  it("insert mode disables dry-run and enables cleanup by default", () => {
    const args = parseP710R6f3RehearsalWriterCliArgs(["--insert=true"]);
    expect(args.insert).toBe(true);
    expect(args.dryRun).toBe(false);
    expect(args.cleanup).toBe(true);
  });

  it("builds insert writer env with gates", () => {
    const args = parseP710R6f3RehearsalWriterCliArgs([
      "--insert=true",
      "--environment=staging",
    ]);
    const env = buildP710R6f3WriterEnvForCli(args, {
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    expect(env.canInsert).toBe(true);
    expect(env.normalizedEnvironment).toBe("staging");
  });
});

describe("p710-r6f3 insert safety", () => {
  it("blocks insert when NODE_ENV=production", () => {
    const args = parseP710R6f3RehearsalWriterCliArgs(["--insert=true"]);
    const env = buildP710R6f3WriterEnvForCli(args, {
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(() => assertP710R6f3InsertAllowed(args, env)).toThrow(/production/);
  });
});
