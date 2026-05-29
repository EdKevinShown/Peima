import { existsSync } from "node:fs";
import * as path from "node:path";

/**
 * Paths that are explicitly relative to `process.cwd()` (shell-style),
 * rather than anchored at the monorepo root.
 */
export function isCandidateImportFolderRelativeToCwd(rawPath: string): boolean {
  const t = rawPath.trim();
  if (t === "." || t === "..") return true;
  const posix = t.replace(/\\/g, "/");
  return (
    posix.startsWith("./") ||
    posix.startsWith("../") ||
    posix.includes("/../") ||
    posix.includes("/./")
  );
}

/**
 * Resolve `--folder` for r4-h import:
 * - Absolute → normalize.
 * - Contains `.` / `..` path semantics → `path.resolve(cwd, …)` (so `../../dev-assets/...` from `apps/api` works).
 * - Otherwise → join monorepo root (so `dev-assets/...` works from any cwd once root is found).
 */
export function resolveCandidateImportFolderInput(
  folderRelOrAbs: string,
  cwd: string = process.cwd(),
): string {
  const trimmed = folderRelOrAbs.trim();
  if (!trimmed) return trimmed;
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }
  if (isCandidateImportFolderRelativeToCwd(trimmed)) {
    return path.normalize(path.resolve(cwd, trimmed));
  }
  const root = resolveMonorepoRoot(cwd);
  return path.normalize(path.join(root, trimmed));
}

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
