import { authHeaders, baseUrl } from "./auth";

/**
 * @param {Record<string, unknown>} params
 */
function buildQuery(params) {
  const q = new URLSearchParams();
  const set = (key, value) => {
    if (value === undefined || value === null || value === "") return;
    q.set(key, String(value));
  };
  set("auditRunId", params.auditRunId);
  set("environment", params.environment);
  set("viewerUserId", params.viewerUserId);
  set("matchResultId", params.matchResultId);
  set("selectedCandidateId", params.selectedCandidateId);
  set("sourceVersion", params.sourceVersion);
  set("mode", params.mode);
  set("promotionStatus", params.promotionStatus);
  if (params.appliedToMatchResult === true) q.set("appliedToMatchResult", "true");
  if (params.appliedToMatchResult === false) {
    q.set("appliedToMatchResult", "false");
  }
  if (params.appliedToFinalScore === true) q.set("appliedToFinalScore", "true");
  if (params.appliedToFinalScore === false) {
    q.set("appliedToFinalScore", "false");
  }
  if (params.appliedToWorkerRanking === true) {
    q.set("appliedToWorkerRanking", "true");
  }
  if (params.appliedToWorkerRanking === false) {
    q.set("appliedToWorkerRanking", "false");
  }
  if (params.rolledBack === true) q.set("rolledBack", "true");
  if (params.rolledBack === false) q.set("rolledBack", "false");
  set("generatedAtFrom", params.generatedAtFrom);
  set("generatedAtTo", params.generatedAtTo);
  if (params.activeOnly === true) q.set("activeOnly", "true");
  if (params.activeOnly === false) q.set("activeOnly", "false");
  if (params.includeDeleted === true) q.set("includeDeleted", "true");
  if (params.includeDeleted === false) q.set("includeDeleted", "false");
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function parseP76CanonicalSidecarAdminError(res) {
  const text = await res.text();
  let detail = text;
  try {
    const body = JSON.parse(text);
    if (Array.isArray(body.message)) {
      detail = body.message.join(", ");
    } else if (body.message) {
      detail = String(body.message);
    }
  } catch {
    /* raw */
  }
  if (res.status === 401) {
    throw new Error(
      "登录已失效，请重新登录后再访问 Canonical Sidecar Review。",
    );
  }
  if (res.status === 403) {
    throw new Error(
      detail?.trim() ||
        "无权限访问：你需要 VIEW_P76_CANONICAL_REHEARSAL 权限才能查看 canonical sidecar 只读记录。",
    );
  }
  if (res.status === 404) {
    const lower = (detail || "").toLowerCase();
    if (
      lower.includes("disabled") ||
      lower.includes("sidecar admin") ||
      lower.includes("peima_p76_canonical_sidecar_admin_enabled")
    ) {
      throw new Error(
        "功能未启用：需要 PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED=1",
      );
    }
    throw new Error(detail?.trim() || "记录不存在。");
  }
  throw new Error(
    detail?.trim() || `Canonical sidecar Admin API 请求失败（HTTP ${res.status}）`,
  );
}

async function p76CanonicalSidecarAdminJson(res) {
  if (!res.ok) {
    return parseP76CanonicalSidecarAdminError(res);
  }
  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

/**
 * @param {Record<string, unknown>} [params]
 */
export async function listP76CanonicalSidecarAdmin(params = {}) {
  const query = buildQuery({ limit: 50, ...params });
  let res;
  try {
    res = await fetch(`${baseUrl}/admin/p76/canonical-sidecar${query}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76CanonicalSidecarAdminJson(res);
}

/**
 * @param {Record<string, unknown>} [params]
 */
export async function getP76CanonicalSidecarAggregate(params = {}) {
  const query = buildQuery(params);
  let res;
  try {
    res = await fetch(`${baseUrl}/admin/p76/canonical-sidecar/aggregate${query}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76CanonicalSidecarAdminJson(res);
}

/**
 * @param {string} id
 */
export async function getP76CanonicalSidecarDetail(id) {
  let res;
  try {
    res = await fetch(`${baseUrl}/admin/p76/canonical-sidecar/${id}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76CanonicalSidecarAdminJson(res);
}

/**
 * P7.10-r7i — read-only apply preview (GET only; no MatchResult write).
 * @param {string} id
 */
export async function getP76CanonicalSidecarApplyPreview(id) {
  let res;
  try {
    res = await fetch(`${baseUrl}/admin/p76/canonical-sidecar/${id}/apply-preview`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76CanonicalSidecarAdminJson(res);
}

/**
 * P7.10-r7j — read-only rollback snapshot dry-run preview (GET only).
 * @param {string} id
 */
export async function getP76CanonicalSidecarRollbackSnapshotPreview(id) {
  let res;
  try {
    res = await fetch(
      `${baseUrl}/admin/p76/canonical-sidecar/${id}/rollback-snapshot-preview`,
      { headers: authHeaders() },
    );
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76CanonicalSidecarAdminJson(res);
}
