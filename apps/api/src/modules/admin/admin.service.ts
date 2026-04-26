import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function parseAdminUserIds(): Set<string> {
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

  async runBatchMatchSubprocess(): Promise<void> {
    const root = getMonorepoRoot();
    const workerMainJs = join(root, "apps", "worker", "dist", "main.js");
    const rawTimeout = parseInt(
      process.env.PEIMA_ADMIN_BATCH_MATCH_TIMEOUT_MS ?? "180000",
      10,
    );
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 180000;

    const node = process.execPath;
    let result: { code: number; stdout: string; stderr: string };

    if (existsSync(workerMainJs)) {
      result = await spawnWithOutput(
        node,
        [workerMainJs, "--batch-match"],
        { cwd: root, env: process.env },
        timeoutMs,
      );
    } else {
      result = await spawnWithOutput(
        "pnpm",
        ["--filter", "@peima/worker", "run", "batch-match"],
        { cwd: root, env: process.env, shell: true },
        timeoutMs,
      );
    }

    if (result.code !== 0) {
      const tail = (result.stderr + result.stdout).slice(-4000);
      throw new InternalServerErrorException(
        `batch-match exited with code ${result.code}. Output (tail):\n${tail}`,
      );
    }
  }
}
