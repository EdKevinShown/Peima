/**
 * P7.10-r6a — write audit JSON artifact + privacy guard.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { P76CanonicalWriterShadowAuditReportV1 } from "./p76-canonical-writer-shadow-audit";

const FORBIDDEN_JSON_KEYS = [
  "rawPrompt",
  "raw_prompt",
  "imageFeatures",
  "image_features",
  "transcript",
  "vendorRawResponse",
  "apiKey",
  "base64",
] as const;

export function assertP76CanonicalWriterShadowAuditPrivacySafe(
  report: P76CanonicalWriterShadowAuditReportV1,
): void {
  const text = JSON.stringify(report);
  for (const key of FORBIDDEN_JSON_KEYS) {
    if (text.includes(`"${key}"`)) {
      throw new Error(
        `P7.10-r6a privacy: audit JSON must not contain forbidden key ${key}`,
      );
    }
  }
  if (report.appliedToMatchResultCount !== 0) {
    throw new Error(
      "P7.10-r6a invariant: appliedToMatchResultCount must be 0",
    );
  }
  for (const row of report.rows) {
    if (row.shadow.appliedToMatchResult !== false) {
      throw new Error(
        `P7.10-r6a invariant: shadow.appliedToMatchResult must be false (${row.matchResultId})`,
      );
    }
  }
}

export function writeP76CanonicalWriterShadowAuditArtifact(
  report: P76CanonicalWriterShadowAuditReportV1,
  outputPath: string,
  opts?: { pretty?: boolean },
): void {
  assertP76CanonicalWriterShadowAuditPrivacySafe(report);
  mkdirSync(dirname(outputPath), { recursive: true });
  const body = JSON.stringify(report, null, opts?.pretty ? 2 : undefined);
  writeFileSync(outputPath, body, "utf8");
}
