/**
 * Step 3: visual enhance signal for preview-pool rank 1–2 ordering.
 * B1: support dual path (stub | llm adapter) with in-process cache and timeout/fallback.
 */

import { Logger } from "@nestjs/common";
import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GatedCandidateForLayering } from "./preview-pool-layered-selection";

const previewVisualEnhanceDebugLog = new Logger("PreviewVisualEnhance");

export type VisualEnhanceInput = {
  imageId: string;
  imageUrl: string | null;
};

export type VisualEnhanceSignal = {
  visualTags: string[];
  visualConfidence: number;
  visualSignalScore: number;
  visualReason: string;
};

type VisualEnhanceRawPayload = {
  image_id: string;
  visual_tags: string[];
  visual_confidence: number;
  visual_signal_score: number;
  visual_reason: string;
};

export interface PreviewVisualEnhanceClient {
  /** For cache key partitioning. */
  cacheKey(): string;
  /** Returns JSON-serializable object; must pass parse guard for expected image id. */
  enhance(input: VisualEnhanceInput): Promise<unknown>;
}

/** Stub client: deterministic score from `imageId` (no network). */
export class StubPreviewVisualEnhanceClient implements PreviewVisualEnhanceClient {
  cacheKey(): string {
    return "stub:v1";
  }

  async enhance(input: VisualEnhanceInput): Promise<unknown> {
    const score = stubViewerFitScoreFromImageId(input.imageId);
    return {
      image_id: input.imageId,
      visual_tags: ["stub_visual_v1"],
      visual_confidence: 0.9,
      visual_signal_score: score,
      visual_reason: "stub_deterministic_from_image_id",
    } satisfies VisualEnhanceRawPayload;
  }
}

const QWEN_VL_PLUS_INTL = "qwen-vl-plus";
const QWEN_VL_PLUS_MAINLAND = "qwen3-vl-plus";

/**
 * Qwen VL Plus（DashScope OpenAI 兼容）：未显式配置 `PEIMA_PREVIEW_VISUAL_ENHANCE_LLM_MODEL` 时按 base URL 选默认。
 * - 中国内地兼容域名 → `qwen3-vl-plus`
 * - 国际站兼容域名（如 `dashscope-intl.aliyuncs.com`）→ `qwen-vl-plus`
 * 非空 `explicitModel` 始终优先。
 */
export function resolvePreviewVisualEnhanceLlmModel(
  baseUrl: string,
  explicitModel: string,
): string {
  const chosen = explicitModel.trim();
  if (chosen) return chosen;
  let host = "";
  try {
    host = new URL(baseUrl.trim()).hostname.toLowerCase();
  } catch {
    return QWEN_VL_PLUS_MAINLAND;
  }
  const intl =
    host.includes("dashscope-intl") ||
    host.includes("intl.aliyuncs") ||
    host.includes("international");
  return intl ? QWEN_VL_PLUS_INTL : QWEN_VL_PLUS_MAINLAND;
}

/** 智谱 GLM-4V 等：更保守的请求体（单 user、无顶层 response_format）。 */
function isZhipuVisualLlmPath(baseUrl: string, model: string): boolean {
  let host = "";
  try {
    host = new URL(baseUrl.trim()).hostname.toLowerCase();
  } catch {
    /* ignore */
  }
  const m = model.toLowerCase();
  return host.includes("open.bigmodel.cn") || m.includes("glm-4v");
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function isLocalLoopbackHttpUrl(s: string): boolean {
  if (!isHttpUrl(s)) return false;
  try {
    const host = new URL(s.trim()).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  } catch {
    return false;
  }
}

function hasDataImageBase64Prefix(s: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(s.trim());
}

function normalizeImageInputMode(
  client: PreviewVisualEnhanceClient,
  imageUrl: string | null,
): "url" | "base64" {
  if (!(client instanceof LlmPreviewVisualEnhanceClient)) return "url";
  if (!imageUrl) return "url";
  if (!isZhipuVisualLlmPath(client.baseUrl, client.model)) return "url";
  if (isLocalLoopbackHttpUrl(imageUrl)) return "base64";
  return isHttpUrl(imageUrl) ? "url" : "base64";
}

function toAbsoluteLocalImagePath(imageUrl: string): string {
  const raw = imageUrl.trim();
  if (raw.startsWith("file://")) {
    return fileURLToPath(raw);
  }
  if (isLocalLoopbackHttpUrl(raw)) {
    try {
      const u = new URL(raw);
      const pathname = decodeURIComponent(u.pathname);
      if (pathname.startsWith("/uploads/user-images/")) {
        return join(process.cwd(), "uploads", "user-images", pathname.slice("/uploads/user-images/".length));
      }
      if (pathname.startsWith("/uploads/")) {
        return join(process.cwd(), pathname.slice(1));
      }
      if (pathname.startsWith("/dev-assets/")) {
        return join(process.cwd(), pathname.slice(1));
      }
      return join(process.cwd(), pathname.startsWith("/") ? pathname.slice(1) : pathname);
    } catch {
      throw new Error("PEIMA_PREVIEW_VISUAL_ENHANCE_LOCAL_IMAGE_NOT_FOUND");
    }
  }
  if (isAbsolute(raw)) return raw;
  if (raw.startsWith("/uploads/user-images/")) {
    return join(process.cwd(), "uploads", "user-images", raw.slice("/uploads/user-images/".length));
  }
  if (raw.startsWith("uploads/user-images/")) {
    return join(process.cwd(), raw);
  }
  return join(process.cwd(), raw);
}

function ensureSupportedLocalImage(path: string): ".jpg" | ".jpeg" | ".png" {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") {
    return ext;
  }
  throw new Error("PEIMA_PREVIEW_VISUAL_ENHANCE_LOCAL_IMAGE_UNSUPPORTED");
}

/** 非 2xx 响应 body 的安全摘要（不记录完整 URL / key）。 */
function sanitizeLlmHttpErrorBodyPreview(raw: string, maxLen: number): string {
  let s = raw.replace(/\r\n|\r|\n/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/https?:\/\/[^\s"'<>]{6,}/gi, "[url]");
  s = s.replace(/\bsk-[a-zA-Z0-9]{10,}\b/gi, "[sk-redacted]");
  s = s.replace(/"api_key"\s*:\s*"[^"]*"/gi, '"api_key":"[redacted]"');
  s = s.replace(/\bBearer\s+[\w._-]+\b/gi, "Bearer [redacted]");
  return s.slice(0, maxLen);
}

class LlmHttpError extends Error {
  readonly status: number;
  readonly bodyPreview: string;
  constructor(status: number, bodyPreview: string) {
    super(`PEIMA_PREVIEW_VISUAL_ENHANCE_HTTP_${status}`);
    this.name = "LlmHttpError";
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

/** OpenAI-compatible multimodal adapter — B1 默认落 Qwen VL Plus（DashScope 兼容模式）。 */
export class LlmPreviewVisualEnhanceClient implements PreviewVisualEnhanceClient {
  constructor(
    readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  cacheKey(): string {
    return `llm:${this.baseUrl}:${this.model}`;
  }

  async enhance(input: VisualEnhanceInput): Promise<unknown> {
    if (!input.imageUrl) {
      throw new Error("PEIMA_PREVIEW_VISUAL_ENHANCE_MISSING_IMAGE_URL");
    }

    const url = `${this.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const systemJsonContract =
      "You analyze one profile photo and must only describe observable visual facts. Reply with a single JSON object only (no markdown, no prose). " +
      "Keys exactly: image_id (string, must echo the given id), visual_tags (array of 1-5 short English or Chinese tags), " +
      "visual_confidence (number 0-1), visual_signal_score (number 0-1), visual_reason (short snake_case string). Numbers must be in [0,1]. " +
      "Allowed tag scope: scene/background, lighting, composition, clothing/style, facial expression, image clarity. " +
      "visual_tags must be concrete observable values, NOT category names themselves. " +
      "Bad tags: lighting, composition, scene/background. Good tags: natural_light, close_up, casual_wear, smiling, clear_photo. " +
      "Do NOT infer personality, morality, age-like attributes, or attractiveness labels. Avoid subjective words such as cute, innocent, youthful. " +
      "visual_reason must be a short visible-facts summary and should not be a fixed template. " +
      "Use slightly varied values for visual_confidence and visual_signal_score based on real image differences, not fixed defaults.";

    const zhipu = isZhipuVisualLlmPath(this.baseUrl, this.model);
    const inputMode: "url" | "base64" =
      zhipu && (!isHttpUrl(input.imageUrl) || isLocalLoopbackHttpUrl(input.imageUrl))
        ? "base64"
        : "url";
    let imagePayload = input.imageUrl;
    if (inputMode === "base64") {
      const localPath = toAbsoluteLocalImagePath(input.imageUrl);
      ensureSupportedLocalImage(localPath);
      let localExists = false;
      try {
        await access(localPath, fsConstants.R_OK);
        localExists = true;
      } catch {
        throw new Error("PEIMA_PREVIEW_VISUAL_ENHANCE_LOCAL_IMAGE_NOT_FOUND");
      }
      try {
        const bytes = await readFile(localPath);
        imagePayload = bytes.toString("base64");
      } catch {
        throw new Error("PEIMA_PREVIEW_VISUAL_ENHANCE_LOCAL_IMAGE_READ_FAILED");
      }
      const _ext = extname(localPath).toLowerCase();
      const _hasPrefix = hasDataImageBase64Prefix(imagePayload);
      const _base64Len = imagePayload.length;
      const _localExists = localExists;
      void _ext;
      void _hasPrefix;
      void _base64Len;
      void _localExists;
    }
    const userTextZhipu =
      `${systemJsonContract} Respond for this candidate only. image_id=${input.imageId}. Output nothing except one JSON object.`;

    const messages = zhipu
      ? [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: userTextZhipu },
              { type: "image_url" as const, image_url: { url: imagePayload } },
            ],
          },
        ]
      : [
          { role: "system" as const, content: systemJsonContract },
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: `image_id=${input.imageId}` },
              { type: "image_url" as const, image_url: { url: imagePayload } },
            ],
          },
        ];

    const payload: Record<string, unknown> = {
      model: this.model,
      temperature: 0,
      messages,
    };
    if (!zhipu) {
      payload.response_format = { type: "json_object" };
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      let bodyPreview = "";
      try {
        bodyPreview = sanitizeLlmHttpErrorBodyPreview(await resp.text(), 280);
      } catch {
        /* ignore body read errors */
      }
      throw new LlmHttpError(resp.status, bodyPreview);
    }

    const body = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("PEIMA_PREVIEW_VISUAL_ENHANCE_EMPTY_CONTENT");
    }
    return extractFirstJsonObject(content);
  }
}

const enhanceCache = new Map<string, { expiresAtMs: number; signal: VisualEnhanceSignal }>();

export function stubViewerFitScoreFromImageId(imageId: string): number {
  let h = 0;
  for (let i = 0; i < imageId.length; i++) {
    h = (h * 31 + imageId.charCodeAt(i)) >>> 0;
  }
  return (h % 1001) / 1000;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  return Math.min(1, Math.max(0, n));
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  if (!v.every((x) => typeof x === "string")) return null;
  return v;
}

function extractFirstJsonObject(content: string): unknown {
  const s = content.trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first < 0 || last <= first) {
    throw new Error("PEIMA_PREVIEW_VISUAL_ENHANCE_INVALID_JSON");
  }
  return JSON.parse(s.slice(first, last + 1));
}

/**
 * Strict schema. Rejects wrong `image_id`, non-objects, missing fields, out-of-range numbers.
 */
export function parseVisualEnhancePayload(
  raw: unknown,
  expectedImageId: string,
): VisualEnhanceSignal | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.image_id !== "string" || o.image_id !== expectedImageId) {
    return null;
  }
  const tags = asStringArray(o.visual_tags);
  if (!tags || typeof o.visual_confidence !== "number" || typeof o.visual_signal_score !== "number") {
    return null;
  }
  const confidence = clamp01(o.visual_confidence);
  const signal = clamp01(o.visual_signal_score);
  if (Number.isNaN(confidence) || Number.isNaN(signal)) {
    return null;
  }
  return {
    visualTags: tags.slice(0, 5),
    visualConfidence: confidence,
    visualSignalScore: signal,
    visualReason:
      typeof o.visual_reason === "string" && o.visual_reason.trim()
        ? o.visual_reason.trim().slice(0, 120)
        : "visual_reason_unavailable",
  };
}

type EnhancePrimaryFailure =
  | "timeout"
  | "http_error"
  | "invalid_json"
  | "image_fetch_failed"
  | "parse_failed"
  | "unknown";

type EnhanceTryResult = {
  signal: VisualEnhanceSignal | null;
  failure?: EnhancePrimaryFailure;
  httpStatus?: number;
  httpBodyPreview?: string;
};

function mapErrorToEnhanceFailure(e: unknown): {
  failure: EnhancePrimaryFailure;
  httpStatus?: number;
  httpBodyPreview?: string;
} {
  if (e instanceof LlmHttpError) {
    return {
      failure: "http_error",
      httpStatus: e.status,
      httpBodyPreview: e.bodyPreview || undefined,
    };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "PEIMA_PREVIEW_VISUAL_ENHANCE_TIMEOUT") {
    return { failure: "timeout" };
  }
  if (msg.startsWith("PEIMA_PREVIEW_VISUAL_ENHANCE_HTTP_")) {
    const rest = msg.slice("PEIMA_PREVIEW_VISUAL_ENHANCE_HTTP_".length);
    const status = Number.parseInt(rest, 10);
    return {
      failure: "http_error",
      httpStatus: Number.isFinite(status) ? status : undefined,
    };
  }
  if (msg === "PEIMA_PREVIEW_VISUAL_ENHANCE_MISSING_IMAGE_URL") {
    return { failure: "image_fetch_failed" };
  }
  if (
    msg === "PEIMA_PREVIEW_VISUAL_ENHANCE_LOCAL_IMAGE_NOT_FOUND" ||
    msg === "PEIMA_PREVIEW_VISUAL_ENHANCE_LOCAL_IMAGE_READ_FAILED" ||
    msg === "PEIMA_PREVIEW_VISUAL_ENHANCE_LOCAL_IMAGE_UNSUPPORTED"
  ) {
    return { failure: "image_fetch_failed" };
  }
  if (msg === "PEIMA_PREVIEW_VISUAL_ENHANCE_INVALID_JSON") {
    return { failure: "invalid_json" };
  }
  if (e instanceof SyntaxError) {
    return { failure: "invalid_json" };
  }
  if (msg === "PEIMA_PREVIEW_VISUAL_ENHANCE_EMPTY_CONTENT") {
    return { failure: "parse_failed" };
  }
  if (/fail(ed)? to fetch|networkerror|econnrefused|enotfound|fetch failed/i.test(msg)) {
    return { failure: "http_error" };
  }
  return { failure: "unknown" };
}

async function tryEnhanceOnce(
  c: PreviewVisualEnhanceClient,
  input: VisualEnhanceInput,
  expectedImageId: string,
  timeoutMs: number,
): Promise<EnhanceTryResult> {
  try {
    const raw = await Promise.race([
      c.enhance(input),
      new Promise<never>((_, rej) => {
        const t = setTimeout(
          () => rej(new Error("PEIMA_PREVIEW_VISUAL_ENHANCE_TIMEOUT")),
          timeoutMs,
        );
        t.unref?.();
      }),
    ]);
    const signal = parseVisualEnhancePayload(raw, expectedImageId);
    if (signal == null) {
      return { signal: null, failure: "parse_failed" };
    }
    return { signal };
  } catch (e) {
    const { failure, httpStatus, httpBodyPreview } = mapErrorToEnhanceFailure(e);
    return { signal: null, failure, httpStatus, httpBodyPreview };
  }
}

export function previewVisualEnhanceProvider(): "stub" | "llm" {
  const v = (process.env.PEIMA_PREVIEW_VISUAL_ENHANCE_PROVIDER ?? "stub").trim().toLowerCase();
  return v === "llm" ? "llm" : "stub";
}

export function buildPreviewVisualEnhanceClient(): PreviewVisualEnhanceClient {
  if (previewVisualEnhanceProvider() === "llm") {
    const baseUrl = (process.env.PEIMA_PREVIEW_VISUAL_ENHANCE_LLM_BASE_URL ?? "").trim();
    const apiKey = (process.env.PEIMA_PREVIEW_VISUAL_ENHANCE_LLM_API_KEY ?? "").trim();
    const explicitModel = (process.env.PEIMA_PREVIEW_VISUAL_ENHANCE_LLM_MODEL ?? "").trim();
    if (baseUrl && apiKey) {
      const model = resolvePreviewVisualEnhanceLlmModel(baseUrl, explicitModel);
      return new LlmPreviewVisualEnhanceClient(baseUrl, apiKey, model);
    }
  }
  return new StubPreviewVisualEnhanceClient();
}

export function previewVisualEnhanceTimeoutMs(): number {
  const raw =
    process.env.PEIMA_PREVIEW_VISUAL_ENHANCE_LLM_TIMEOUT_MS ??
    process.env.PEIMA_PREVIEW_VISUAL_ENHANCE_TIMEOUT_MS;
  const n = raw == null || raw === "" ? 800 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 800;
}

export function previewVisualEnhanceCacheTtlMs(): number {
  const raw = process.env.PEIMA_PREVIEW_VISUAL_ENHANCE_CACHE_TTL_MS;
  const n = raw == null || raw === "" ? 86_400_000 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 86_400_000;
}

export function isPreviewVisualEnhanceEnabled(): boolean {
  const v = process.env.PEIMA_PREVIEW_VISUAL_ENHANCE_ENABLED;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * For each gated row with `hasImage` + `firstImageId`, run visual enhance client under timeout.
 * On llm failures, fallback to stub. On any unparseable result, omit `visualEnhance` for that row.
 */
export async function applyPreviewVisualEnhanceStubGAll(
  gAll: GatedCandidateForLayering[],
  client: PreviewVisualEnhanceClient,
  timeoutMs: number,
): Promise<void> {
  const fallbackClient =
    client instanceof StubPreviewVisualEnhanceClient ? client : new StubPreviewVisualEnhanceClient();
  const ttlMs = previewVisualEnhanceCacheTtlMs();

  const path = client instanceof LlmPreviewVisualEnhanceClient ? "llm" : "stub";
  const eligibleRows = gAll.filter(
    (r) => r.hasImage && r.firstImageId != null && r.firstImageId !== "",
  ).length;
  previewVisualEnhanceDebugLog.log(
    `start path=${path} clientKey=${client.cacheKey()} timeoutMs=${timeoutMs} eligibleRows=${eligibleRows}`,
  );

  const stats = { cacheHits: 0, llmPrimaryOk: 0, fallbacks: 0 };

  const tasks = gAll.map(async (row) => {
    if (!row.hasImage || row.firstImageId == null || row.firstImageId === "") {
      return;
    }

    const imageKey = row.firstImageUrl?.trim() || row.firstImageId;
    const mode = normalizeImageInputMode(client, row.firstImageUrl ?? null);
    const cacheKey = `${client.cacheKey()}|mode=${mode}|${imageKey}`;
    const now = Date.now();
    const cached = enhanceCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      stats.cacheHits++;
      row.visualEnhance = cached.signal;
      return;
    }

    const input: VisualEnhanceInput = {
      imageId: row.firstImageId,
      imageUrl: row.firstImageUrl ?? null,
    };

    const primaryResult = await tryEnhanceOnce(client, input, row.firstImageId!, timeoutMs);
    const primary = primaryResult.signal;
    if (client instanceof LlmPreviewVisualEnhanceClient && primary != null) {
      stats.llmPrimaryOk++;
    }
    let finalSignal = primary;
    if (!finalSignal && !(client instanceof StubPreviewVisualEnhanceClient)) {
      if (client instanceof LlmPreviewVisualEnhanceClient) {
        const reason = primaryResult.failure ?? "unknown";
        const hs = primaryResult.httpStatus;
        const bp = primaryResult.httpBodyPreview?.replace(/\s+/g, " ").trim();
        previewVisualEnhanceDebugLog.warn(
          `llm_primary_failed reason=${reason}${hs != null ? ` httpStatus=${hs}` : ""}${bp ? ` bodyPreview=${bp}` : ""}`,
        );
      }
      const fb = await tryEnhanceOnce(fallbackClient, input, row.firstImageId!, timeoutMs);
      finalSignal = fb.signal;
      if (finalSignal != null) {
        stats.fallbacks++;
      }
    }
    if (!finalSignal) return;

    row.visualEnhance = finalSignal;
    previewVisualEnhanceDebugLog.log(
      `llm_visual_result candidateUserId=${row.id} visualTags=${JSON.stringify(finalSignal.visualTags)} visualConfidence=${finalSignal.visualConfidence} visualSignalScore=${finalSignal.visualSignalScore} visualReason=${finalSignal.visualReason}`,
    );
    enhanceCache.set(cacheKey, {
      signal: finalSignal,
      expiresAtMs: now + ttlMs,
    });
  });
  await Promise.all(tasks);

  previewVisualEnhanceDebugLog.log(
    `done path=${path} cacheHits=${stats.cacheHits} llmPrimaryOk=${stats.llmPrimaryOk} fallbacks=${stats.fallbacks}`,
  );
  if (stats.fallbacks > 0) {
    previewVisualEnhanceDebugLog.warn(
      `stub fallback used after LLM failure (count=${stats.fallbacks}); check keys/timeout/imageUrl`,
    );
  }
}
