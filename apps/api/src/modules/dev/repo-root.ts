import { existsSync } from "node:fs";
import * as path from "node:path";

/**
 * Best-effort monorepo root (directory containing `pnpm-workspace.yaml`).
 */
export function resolveMonorepoRoot(startDir?: string): string {
  let cur = path.resolve(startDir ?? process.cwd());
  while (true) {
    if (existsSync(path.join(cur, "pnpm-workspace.yaml"))) return cur;
    const p = path.dirname(cur);
    if (p === cur) return path.resolve(process.cwd());
    cur = p;
  }
}
