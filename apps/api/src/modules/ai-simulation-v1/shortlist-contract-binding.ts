import { createHash } from "node:crypto";

/** Stable fingerprint for ordered shortlist ids (set-normalized: sort unique). */
export function computeShortlistFingerprint(candidateUserIds: string[]): string {
  const uniqueSorted = [...new Set(candidateUserIds)].sort().join("|");
  return createHash("sha256").update(uniqueSorted, "utf8").digest("hex");
}
