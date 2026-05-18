/**
 * P7.10-r6f3 — map r6a / r6c2a shadow audit JSON → rehearsal writer input.
 */

import type { P76CanonicalWriterShadowAuditReportV1 } from "./p76-canonical-writer-shadow-audit";
import {
  P76_CANONICAL_WRITER_SHADOW_AUDIT_SCHEMA_VERSION,
  P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_TYPE,
} from "./p76-canonical-writer-shadow-audit";
import type { P76CanonicalWriterShadowPayloadV1 } from "./p76-canonical-writer-shadow.types";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "./p76-allowlist-apply-meta.types";
import { P76CanonicalWriterRehearsalWriterError } from "./p76-canonical-writer-rehearsal-writer.types";
import type { P76CanonicalWriterRehearsalWriterInput } from "./p76-canonical-writer-rehearsal-writer.types";

/** r6c2a targeted artifact may include extra summary fields. */
export type P76CanonicalWriterShadowAuditArtifactV1 =
  P76CanonicalWriterShadowAuditReportV1 & {
    readPathSourceVersion?: string;
    auditKind?: string;
    targetedViewerCount?: number;
  };

export type BuildP76RehearsalWriterInputFromArtifactOptions = {
  artifact: P76CanonicalWriterShadowAuditArtifactV1;
  auditRunId: string;
  environment: "dev" | "staging";
  readPathSourceVersion?: string;
  includeBlocked?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function assertP76CanonicalWriterShadowAuditArtifactV1(
  artifact: unknown,
): asserts artifact is P76CanonicalWriterShadowAuditArtifactV1 {
  if (!isRecord(artifact)) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "artifact must be a JSON object",
    );
  }
  if (artifact.schemaVersion !== P76_CANONICAL_WRITER_SHADOW_AUDIT_SCHEMA_VERSION) {
    throw new P76CanonicalWriterRehearsalWriterError(
      `artifact.schemaVersion must be ${P76_CANONICAL_WRITER_SHADOW_AUDIT_SCHEMA_VERSION}`,
    );
  }
  if (artifact.sourceType !== P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_TYPE) {
    throw new P76CanonicalWriterRehearsalWriterError(
      `artifact.sourceType must be ${P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_TYPE}`,
    );
  }
  if (!Array.isArray(artifact.rows)) {
    throw new P76CanonicalWriterRehearsalWriterError("artifact.rows must be an array");
  }
  if (
    typeof artifact.appliedToMatchResultCount === "number" &&
    artifact.appliedToMatchResultCount !== 0
  ) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "artifact.appliedToMatchResultCount must be 0",
    );
  }
}

export function parseP76CanonicalWriterShadowAuditArtifactJson(
  text: string,
): P76CanonicalWriterShadowAuditArtifactV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new P76CanonicalWriterRehearsalWriterError("artifact is not valid JSON");
  }
  assertP76CanonicalWriterShadowAuditArtifactV1(parsed);
  return parsed;
}

export function loadP76CanonicalWriterShadowAuditArtifactFromFile(
  absolutePath: string,
  fs: { readFileSync: (p: string, enc: BufferEncoding) => string },
): P76CanonicalWriterShadowAuditArtifactV1 {
  const text = fs.readFileSync(absolutePath, "utf8");
  return parseP76CanonicalWriterShadowAuditArtifactJson(text);
}

export function resolveP76RehearsalReadPathSourceVersion(
  artifact: P76CanonicalWriterShadowAuditArtifactV1,
  override?: string,
): string {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride;
  const fromArtifact = artifact.readPathSourceVersion?.trim();
  if (fromArtifact) return fromArtifact;
  const fromRow = artifact.rows[0]?.shadow?.provenance?.sourceVersion?.trim();
  if (fromRow) return fromRow;
  return P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION;
}

export function buildP76RehearsalWriterInputFromShadowAuditArtifact(
  options: BuildP76RehearsalWriterInputFromArtifactOptions,
): P76CanonicalWriterRehearsalWriterInput {
  const { artifact, auditRunId, environment } = options;
  const includeBlocked = options.includeBlocked !== false;
  const readPathSourceVersion = resolveP76RehearsalReadPathSourceVersion(
    artifact,
    options.readPathSourceVersion,
  );

  if (!auditRunId.trim()) {
    throw new P76CanonicalWriterRehearsalWriterError("auditRunId is required");
  }

  const rows: P76CanonicalWriterRehearsalWriterInput["rows"] = [];

  for (const row of artifact.rows) {
    const shadow = row.shadow as P76CanonicalWriterShadowPayloadV1;
    if (!includeBlocked && !shadow.guardrails.eligible) {
      continue;
    }
    const viewerUserId = row.viewerUserId?.trim() ?? "";
    if (!viewerUserId) {
      continue;
    }

    rows.push({
      matchResultId: row.matchResultId.trim(),
      viewerUserId,
      allowlistApplyMetaId:
        shadow.provenance?.allowlistApplyMetaId?.trim() || null,
      shadow,
      summary: {
        runner: "p710-r6f3",
        artifactSourceVersion: artifact.sourceVersion,
        guardrailReason: shadow.guardrails.reason,
      },
    });
  }

  if (rows.length === 0) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "no writer rows after artifact mapping (check includeBlocked)",
    );
  }

  return {
    auditRunId: auditRunId.trim(),
    environment,
    readPathSourceVersion,
    rows,
  };
}
