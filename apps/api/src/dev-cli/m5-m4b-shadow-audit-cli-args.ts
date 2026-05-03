/** M5.2-M4B — argv parsing for shadow audit CLI (no side effects). */

export const M5_M4B_DEFAULT_LIMIT = 20;
export const M5_M4B_MAX_LIMIT = 100;

export function parseM5M4bShadowAuditCliArgs(argv: string[]): { limit: number; pretty: boolean } {
  let limit = M5_M4B_DEFAULT_LIMIT;
  let pretty = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--pretty") {
      pretty = true;
    } else if (a === "--limit" && argv[i + 1] !== undefined) {
      limit = Number.parseInt(String(argv[i + 1]), 10);
      i += 1;
    } else {
      const eq = /^--limit=(\d+)$/.exec(a);
      if (eq) limit = Number.parseInt(eq[1], 10);
    }
  }
  if (!Number.isFinite(limit)) limit = M5_M4B_DEFAULT_LIMIT;
  limit = Math.min(M5_M4B_MAX_LIMIT, Math.max(1, limit));
  return { limit, pretty };
}
