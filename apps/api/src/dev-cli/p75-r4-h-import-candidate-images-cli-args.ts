/**
 * CLI args for P7.5-r4-h dev-only candidate folder → User/UserImage import.
 */

export type P75R4HImportCandidateImagesCliArgs = {
  folder: string;
  limit: number;
  dryRun: boolean;
  createMissingUsers: boolean;
  copyToUploads: boolean;
  tagPrefix: string;
  runDetection: boolean;
  runVision: boolean;
  /** Skip rows mapped to this user id (e.g. current dev viewer); never imports into self. */
  excludeUserId?: string;
};

function takeValue(argv: string[], i: number): string | undefined {
  const n = argv[i + 1];
  if (!n || n.startsWith("--")) return undefined;
  return n;
}

function parseBoolArg(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const s = raw.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return defaultValue;
}

export function parseP75R4HImportCandidateImagesCliArgs(
  argv: string[],
): P75R4HImportCandidateImagesCliArgs {
  let folder = "dev-assets/test-user-images";
  let limit = 50;
  let dryRun = true;
  let createMissingUsers = true;
  let copyToUploads = true;
  let tagPrefix = "demo-candidate";
  let runDetection = true;
  let runVision = false;
  let excludeUserId: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a.startsWith("--folder=")) {
      folder = a.slice("--folder=".length).trim() || folder;
    } else if (a === "--folder") {
      const v = takeValue(argv, i);
      if (v) {
        folder = v.trim() || folder;
        i += 1;
      }
    } else if (a.startsWith("--limit=")) {
      limit = Number.parseInt(a.slice("--limit=".length), 10);
    } else if (a === "--limit") {
      const v = takeValue(argv, i);
      if (v) {
        limit = Number.parseInt(v, 10);
        i += 1;
      }
    } else if (a.startsWith("--dryRun=")) {
      dryRun = parseBoolArg(a.slice("--dryRun=".length), dryRun);
    } else if (a === "--dryRun") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        dryRun = parseBoolArg(v, dryRun);
        i += 1;
      } else {
        dryRun = true;
      }
    } else if (a.startsWith("--createMissingUsers=")) {
      createMissingUsers = parseBoolArg(
        a.slice("--createMissingUsers=".length),
        createMissingUsers,
      );
    } else if (a === "--createMissingUsers") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        createMissingUsers = parseBoolArg(v, createMissingUsers);
        i += 1;
      } else {
        createMissingUsers = true;
      }
    } else if (a.startsWith("--copyToUploads=")) {
      copyToUploads = parseBoolArg(
        a.slice("--copyToUploads=".length),
        copyToUploads,
      );
    } else if (a === "--copyToUploads") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        copyToUploads = parseBoolArg(v, copyToUploads);
        i += 1;
      } else {
        copyToUploads = true;
      }
    } else if (a.startsWith("--tagPrefix=")) {
      tagPrefix = a.slice("--tagPrefix=".length).trim() || tagPrefix;
    } else if (a === "--tagPrefix") {
      const v = takeValue(argv, i);
      if (v) {
        tagPrefix = v.trim() || tagPrefix;
        i += 1;
      }
    } else if (a.startsWith("--runDetection=")) {
      runDetection = parseBoolArg(a.slice("--runDetection=".length), runDetection);
    } else if (a === "--runDetection") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        runDetection = parseBoolArg(v, runDetection);
        i += 1;
      } else {
        runDetection = true;
      }
    } else if (a.startsWith("--runVision=")) {
      runVision = parseBoolArg(a.slice("--runVision=".length), runVision);
    } else if (a === "--runVision") {
      const v = takeValue(argv, i);
      if (v !== undefined && !v.startsWith("--")) {
        runVision = parseBoolArg(v, runVision);
        i += 1;
      } else {
        runVision = true;
      }
    } else if (a.startsWith("--excludeUserId=")) {
      excludeUserId = a.slice("--excludeUserId=".length).trim() || undefined;
    } else if (a === "--excludeUserId") {
      const v = takeValue(argv, i);
      if (v) {
        excludeUserId = v.trim() || undefined;
        i += 1;
      }
    }
  }

  if (!Number.isFinite(limit) || limit < 1) limit = 50;

  return {
    folder,
    limit: Math.min(limit, 50_000),
    dryRun,
    createMissingUsers,
    copyToUploads,
    tagPrefix,
    runDetection,
    runVision,
    excludeUserId,
  };
}
