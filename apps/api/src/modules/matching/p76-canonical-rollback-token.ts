/**
 * P7.10-r8e — rollback token hash verify (no plaintext persistence).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type P76CanonicalRollbackTokenBindingV1 = {
  snapshotId: string;
  matchResultId: string;
  sidecarId: string;
};

function bindingPayload(
  binding: P76CanonicalRollbackTokenBindingV1,
  tokenPlaintext: string,
): string {
  return `${binding.snapshotId}:${binding.matchResultId}:${binding.sidecarId}:${tokenPlaintext}`;
}

/**
 * HMAC-SHA256 hex digest for rollback token verification.
 * Pepper from PEIMA_P76_ROLLBACK_TOKEN_PEPPER (empty string if unset).
 */
export function hashP76CanonicalRollbackTokenV1(
  tokenPlaintext: string,
  binding: P76CanonicalRollbackTokenBindingV1,
  pepper?: string,
): string {
  const secret = pepper ?? process.env.PEIMA_P76_ROLLBACK_TOKEN_PEPPER ?? "";
  return createHmac("sha256", secret)
    .update(bindingPayload(binding, tokenPlaintext), "utf8")
    .digest("hex");
}

export function verifyP76CanonicalRollbackTokenV1(
  tokenPlaintext: string | null | undefined,
  storedHash: string | null | undefined,
  binding: P76CanonicalRollbackTokenBindingV1,
  pepper?: string,
): boolean {
  if (!tokenPlaintext?.trim() || !storedHash?.trim()) return false;
  const computed = hashP76CanonicalRollbackTokenV1(tokenPlaintext.trim(), binding, pepper);
  try {
    const a = Buffer.from(computed, "utf8");
    const b = Buffer.from(storedHash.trim(), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return computed === storedHash.trim();
  }
}
