/**
 * @typedef {{ batchMatchTrigger: boolean }} AdminCapabilities
 * @typedef {{ ok: true, capabilities: AdminCapabilities } | { ok: false, reason: 'unauthorized' | 'forbidden' | 'error' }} AdminCapabilitiesFetchResult
 */

/**
 * @param {number} status
 * @param {Partial<AdminCapabilities> | null | undefined} [body]
 * @returns {AdminCapabilitiesFetchResult}
 */
export function resolveAdminCapabilitiesFetch(status, body) {
  if (status === 401) return { ok: false, reason: "unauthorized" };
  if (status === 403) return { ok: false, reason: "forbidden" };
  if (status >= 200 && status < 300) {
    return {
      ok: true,
      capabilities: {
        batchMatchTrigger: Boolean(body?.batchMatchTrigger),
      },
    };
  }
  return { ok: false, reason: "error" };
}
