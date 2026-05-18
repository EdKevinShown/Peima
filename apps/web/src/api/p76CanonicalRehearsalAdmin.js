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
  set("sourceVersion", params.sourceVersion);
  set("readPathSourceVersion", params.readPathSourceVersion);
  set("environment", params.environment);
  if (params.eligible === true) q.set("eligible", "true");
  if (params.eligible === false) q.set("eligible", "false");
  set("guardrailReason", params.guardrailReason);
  if (params.wouldChangeCandidate === true) q.set("wouldChangeCandidate", "true");
  if (params.wouldChangeCandidate === false) q.set("wouldChangeCandidate", "false");
  if (params.appliedToMatchResult === true) q.set("appliedToMatchResult", "true");
  if (params.appliedToMatchResult === false) q.set("appliedToMatchResult", "false");
  set("generatedAtFrom", params.generatedAtFrom);
  set("generatedAtTo", params.generatedAtTo);
  set("viewerUserId", params.viewerUserId);
  set("matchResultId", params.matchResultId);
  if (params.activeOnly === true) q.set("activeOnly", "true");
  if (params.activeOnly === false) q.set("activeOnly", "false");
  if (params.includeDeleted === true) q.set("includeDeleted", "true");
  if (params.includeDeleted === false) q.set("includeDeleted", "false");
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function parseP76RehearsalAdminError(res) {
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
    throw new Error("登录已失效，请重新登录后再访问 Canonical Rehearsal Review。");
  }
  if (res.status === 403) {
    throw new Error(
      detail?.trim() ||
        "无权限访问（需要 VIEW_P76_ALLOWLIST_APPLY_META，运营 / 数据分析 / 管理员）。",
    );
  }
  if (res.status === 404) {
    const lower = (detail || "").toLowerCase();
    if (lower.includes("disabled") || lower.includes("rehearsal admin")) {
      throw new Error(
        "Rehearsal Admin API is disabled. Enable PEIMA_P76_REHEARSAL_ADMIN_ENABLED=1 locally.",
      );
    }
    throw new Error(detail?.trim() || "记录不存在。");
  }
  throw new Error(detail?.trim() || `请求失败（HTTP ${res.status}），请稍后重试。`);
}

async function p76RehearsalAdminJson(res) {
  if (!res.ok) {
    return parseP76RehearsalAdminError(res);
  }
  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

/**
 * @param {Record<string, unknown>} [params]
 */
export async function listP76CanonicalRehearsalRows(params = {}) {
  const query = buildQuery({ limit: 50, ...params });
  let res;
  try {
    res = await fetch(`${baseUrl}/admin/p76/canonical-rehearsal${query}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76RehearsalAdminJson(res);
}

/**
 * @param {Record<string, unknown>} [params]
 */
export async function getP76CanonicalRehearsalAggregate(params = {}) {
  const query = buildQuery(params);
  let res;
  try {
    res = await fetch(`${baseUrl}/admin/p76/canonical-rehearsal/aggregate${query}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76RehearsalAdminJson(res);
}

/**
 * @param {string} id
 */
export async function getP76CanonicalRehearsalRow(id) {
  let res;
  try {
    res = await fetch(`${baseUrl}/admin/p76/canonical-rehearsal/${id}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76RehearsalAdminJson(res);
}
