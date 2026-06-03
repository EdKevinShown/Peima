import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export function parseAdminUserIds(): Set<string> {
  const raw = process.env.PEIMA_ADMIN_USER_IDS ?? "";
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

function isBatchMatchTriggerDisabled(): boolean {
  const v = process.env.PEIMA_ADMIN_BATCH_MATCH_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * When triggering batch-match from the API subprocess helper:
 *
 * - Default (`!== "1"`): run `pnpm --filter @peima/worker run batch-match` (tsx + src).
 *   This matches local dev worker behavior and avoids stale `apps/worker/dist/main.js`
 *   missing newer fields such as `matchInsights.top2ScoreSnapshot`.
 *
 * - Opt-in (`=== "1"`): run `node apps/worker/dist/main.js --batch-match` when dist exists
 *   (after `pnpm --filter @peima/worker build`).
 */
export function shouldBatchMatchSubprocessUseCompiledWorkerDistEnv(env: NodeJS.ProcessEnv): boolean {
  const v = env.PEIMA_BATCH_MATCH_SUBPROCESS_USE_DIST?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Pure resolution for tests + single spawn site (M6.10-C5). */
export function resolveBatchMatchSubprocessPlan(params: {
  monorepoRoot: string;
  nodeExecPath: string;
  workerDistMainJsExists: boolean;
  env: NodeJS.ProcessEnv;
}): { cwd: string; command: string; args: string[]; shell: boolean } {
  const workerMainJs = join(params.monorepoRoot, "apps", "worker", "dist", "main.js");
  const useDist =
    shouldBatchMatchSubprocessUseCompiledWorkerDistEnv(params.env) && params.workerDistMainJsExists;
  if (useDist) {
    return {
      cwd: params.monorepoRoot,
      command: params.nodeExecPath,
      args: [workerMainJs, "--batch-match"],
      shell: false,
    };
  }
  return {
    cwd: params.monorepoRoot,
    command: "pnpm",
    args: ["--filter", "@peima/worker", "run", "batch-match"],
    shell: true,
  };
}

/**
 * Resolve monorepo root (contains apps/api and apps/worker).
 * API is usually started with cwd = apps/api.
 */
function getMonorepoRoot(): string {
  const env = process.env.PEIMA_MONOREPO_ROOT?.trim();
  if (env) {
    return resolve(env);
  }
  const cwd = process.cwd();
  const base = join(cwd, "..", "..");
  if (existsSync(join(base, "apps", "worker", "package.json"))) {
    return base;
  }
  if (existsSync(join(cwd, "apps", "worker", "package.json"))) {
    return cwd;
  }
  throw new ServiceUnavailableException(
    "Cannot resolve monorepo root (expected apps/worker). Set PEIMA_MONOREPO_ROOT.",
  );
}

function spawnWithOutput(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; shell?: boolean },
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      rejectPromise(
        new InternalServerErrorException(
          `batch-match subprocess timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      rejectPromise(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

@Injectable()
export class AdminService {
  private readonly allowlist = parseAdminUserIds();

  isAdminUser(userId: string): boolean {
    return this.allowlist.has(userId);
  }

  canSeeBatchMatchTrigger(userId: string | undefined): boolean {
    if (!userId || isBatchMatchTriggerDisabled()) {
      return false;
    }
    return this.isAdminUser(userId);
  }

  private assertIsAdminUserOrThrow(userId: string): void {
    if (!this.isAdminUser(userId)) {
      throw new ForbiddenException(
        "admin only: add your user id to PEIMA_ADMIN_USER_IDS",
      );
    }
  }

  assertCanTriggerBatchMatch(userId: string): void {
    if (isBatchMatchTriggerDisabled()) {
      throw new ForbiddenException(
        "admin batch-match trigger is disabled (PEIMA_ADMIN_BATCH_MATCH_DISABLED)",
      );
    }
    this.assertIsAdminUserOrThrow(userId);
  }

  assertCanRunAiSimulationV1(userId: string): void {
    this.assertIsAdminUserOrThrow(userId);
  }

  assertCanRunPostPoolDeepScreenShadow(userId: string): void {
    this.assertIsAdminUserOrThrow(userId);
  }

  assertCanRunPrescreenDebug(userId: string): void {
    this.assertIsAdminUserOrThrow(userId);
  }

  /** P7.11-r1: read-only matching observability summary (M4.4-M2). */
  assertCanReadMatchingObservabilitySummary(userId: string): void {
    this.assertIsAdminUserOrThrow(userId);
  }

  async runBatchMatchSubprocess(): Promise<void> {
    const root = getMonorepoRoot();
    const workerMainJs = join(root, "apps", "worker", "dist", "main.js");
    const rawTimeout = parseInt(
      process.env.PEIMA_ADMIN_BATCH_MATCH_TIMEOUT_MS ?? "180000",
      10,
    );
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 180000;

    const plan = resolveBatchMatchSubprocessPlan({
      monorepoRoot: root,
      nodeExecPath: process.execPath,
      workerDistMainJsExists: existsSync(workerMainJs),
      env: process.env,
    });

    const result = await spawnWithOutput(plan.command, plan.args, {
      cwd: plan.cwd,
      env: process.env,
      shell: plan.shell,
    }, timeoutMs);

    if (result.code !== 0) {
      const tail = (result.stderr + result.stdout).slice(-4000);
      throw new InternalServerErrorException(
        `batch-match exited with code ${result.code}. Output (tail):\n${tail}`,
      );
    }
  }
}
