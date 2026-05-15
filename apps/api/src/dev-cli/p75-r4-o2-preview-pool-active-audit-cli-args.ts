export type P75R4O2PreviewPoolActiveAuditCliArgs = {
  viewerUserId: string;
  mappingPath: string | null;
};

export function parseP75R4O2PreviewPoolActiveAuditCliArgs(
  argv: string[],
): P75R4O2PreviewPoolActiveAuditCliArgs {
  let viewerUserId = "";
  let mappingPath: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a.startsWith("--viewerUserId=")) {
      viewerUserId = a.slice("--viewerUserId=".length).trim();
    } else if (a === "--viewerUserId" || a === "-v") {
      viewerUserId = argv[i + 1]?.trim() ?? "";
    } else if (a.startsWith("--mappingPath=")) {
      const v = a.slice("--mappingPath=".length).trim();
      mappingPath = v || null;
    } else if (a === "--mappingPath") {
      mappingPath = argv[i + 1]?.trim() || null;
    }
  }
  return { viewerUserId, mappingPath };
}
