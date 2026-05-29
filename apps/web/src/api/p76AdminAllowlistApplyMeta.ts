import { authHeaders, baseUrl } from "./auth";

export type P76AdminListQuery = {
  viewerUserId?: string;
  applied?: boolean;
  rolledBack?: boolean;
  sourceVersion?: string;
  violationOnly?: boolean;
  limit?: number;
  cursor?: string;
};

export type P76AdminAllowlistApplyMetaRow = {
  id: string;
  viewerUserId: string;
  selectedCandidateId: string;
  sourcePipeline: string;
  schemaVersion: string;
  sourceVersion: string;
  routeCArtifactPath: string | null;
  stage1SelectedCandidateIds: unknown;
  stage2Top2CandidateIds: unknown;
  selectedBy20DOnlyCandidateId: string | null;
  selectedByRrmCandidateId: string | null;
  finalShadowSelectedCandidateId: string;
  allowlistMatched: boolean;
  pmSignoffStatus: string;
  opsSignoffStatus: string;
  applied: boolean;
  appliedToPool: boolean;
  appliedToMatchResult: boolean;
  appliedToFinalScore: boolean;
  appliedToDisplay: boolean;
  appliedToWorkerRanking: boolean;
  dryRun: boolean;
  rolledBack: boolean;
  rollbackReason: string | null;
  auditNotes: unknown;
  createdAt: string;
  updatedAt: string;
  sidecarStatus: "dry_run" | "written" | "rolled_back";
  productApplyStatus: "not_applied" | "blocked" | "future_enabled";
  mainChainApplyStatus: "none" | "violation_detected";
  violationStatus:
    | "ok"
    | "p0_main_chain_flag"
    | "rolled_back"
    | "artifact_missing"
    | "stale_source_version";
};

export type P76AdminAllowlistApplyMetaAggregate = {
  totalSidecarRows: number;
  writtenRows: number;
  dryRunRows: number;
  rolledBackRows: number;
  violationCount: number;
  mainChainViolationCount: number;
  nonAllowlistViolationCount: number;
  artifactMissingCount: number;
  staleSourceVersionCount: number;
  appliedToMatchResultTrueCount: number;
  appliedToFinalScoreTrueCount: number;
  appliedToWorkerRankingTrueCount: number;
  appliedToDisplayTrueCount: number;
};

export type P76AdminAllowlistApplyMetaListResponse = {
  schemaVersion: string;
  rows: P76AdminAllowlistApplyMetaRow[];
  aggregate: P76AdminAllowlistApplyMetaAggregate;
  pagination: { limit: number; nextCursor: string | null };
};

export type P76AdminAllowlistApplyMetaDetailResponse = {
  schemaVersion: string;
  row: P76AdminAllowlistApplyMetaRow;
  derived: {
    sidecarStatus: P76AdminAllowlistApplyMetaRow["sidecarStatus"];
    productApplyStatus: P76AdminAllowlistApplyMetaRow["productApplyStatus"];
    mainChainApplyStatus: P76AdminAllowlistApplyMetaRow["mainChainApplyStatus"];
    violationStatus: P76AdminAllowlistApplyMetaRow["violationStatus"];
  };
  stageSummary: {
    stage1Count: number;
    stage2Count: number;
    selectedBy20DOnlyCandidateId: string | null;
    selectedByRrmCandidateId: string | null;
    finalShadowSelectedCandidateId: string;
  };
  violationStatus: P76AdminAllowlistApplyMetaRow["violationStatus"];
};

function buildQuery(params: P76AdminListQuery): string {
  const q = new URLSearchParams();
  if (params.viewerUserId?.trim()) {
    q.set("viewerUserId", params.viewerUserId.trim());
  }
  if (params.applied === true) q.set("applied", "true");
  if (params.applied === false) q.set("applied", "false");
  if (params.rolledBack === true) q.set("rolledBack", "true");
  if (params.rolledBack === false) q.set("rolledBack", "false");
  if (params.sourceVersion?.trim()) {
    q.set("sourceVersion", params.sourceVersion.trim());
  }
  if (params.violationOnly === true) q.set("violationOnly", "true");
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function parseP76AdminError(res: Response): Promise<never> {
  const text = await res.text();
  let detail = text;
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      detail = body.message.join(", ");
    } else if (body.message) {
      detail = String(body.message);
    }
  } catch {
    /* raw */
  }
  if (res.status === 401) {
    throw new Error("登录已失效，请重新登录后再访问 P76 Allowlist Apply Meta。");
  }
  if (res.status === 403) {
    throw new Error(
      detail?.trim() ||
        "无权限访问（需要 VIEW_P76_ALLOWLIST_APPLY_META，运营 / 数据分析 / 管理员）。",
    );
  }
  if (res.status === 404) {
    throw new Error(detail?.trim() || "记录不存在。");
  }
  throw new Error(detail?.trim() || `请求失败（HTTP ${res.status}），请稍后重试。`);
}

async function p76AdminJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    return parseP76AdminError(res);
  }
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function listP76AllowlistApplyMeta(
  params: P76AdminListQuery = {},
): Promise<P76AdminAllowlistApplyMetaListResponse> {
  const query = buildQuery({ limit: 50, ...params });
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/admin/p76/allowlist-apply-meta${query}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76AdminJson<P76AdminAllowlistApplyMetaListResponse>(res);
}

export async function getP76AllowlistApplyMetaAggregate(
  params: Omit<P76AdminListQuery, "limit" | "cursor"> = {},
): Promise<P76AdminAllowlistApplyMetaAggregate & { schemaVersion: string }> {
  const query = buildQuery(params);
  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/admin/p76/allowlist-apply-meta/aggregate${query}`,
      { headers: authHeaders() },
    );
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76AdminJson(res);
}

export async function getP76AllowlistApplyMetaDetail(
  id: string,
): Promise<P76AdminAllowlistApplyMetaDetailResponse> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/admin/p76/allowlist-apply-meta/${id}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return p76AdminJson<P76AdminAllowlistApplyMetaDetailResponse>(res);
}
