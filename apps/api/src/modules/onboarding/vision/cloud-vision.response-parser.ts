/**
 * P7.5-r7-c1: parse vendor JSON into CloudVisionRawLabels (no full body retention).
 */

import { stripCloudVisionSensitiveFields } from "./cloud-vision-sensitive";
import type {
  CloudVisionRawLabels,
  CloudVisionRawRefusal,
  CloudVisionScoredLabel,
} from "./cloud-vision.types";

export type CloudVisionParseSuccess = {
  ok: true;
  labels: CloudVisionRawLabels;
  refusal?: CloudVisionRawRefusal;
  requestId?: string;
};

export type CloudVisionParseFailure = {
  ok: false;
  reason:
    | "invalid_json"
    | "not_object"
    | "missing_labels"
    | "malformed_labels"
    | "empty_content";
};

export type CloudVisionParseResult =
  | CloudVisionParseSuccess
  | CloudVisionParseFailure;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseLabelArray(value: unknown): CloudVisionScoredLabel[] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const out: CloudVisionScoredLabel[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const tag = String(item.tag ?? "").trim();
    const scoreRaw = item.score;
    const score =
      typeof scoreRaw === "number" && Number.isFinite(scoreRaw)
        ? scoreRaw
        : Number.parseFloat(String(scoreRaw ?? ""));
    if (!tag || !Number.isFinite(score)) continue;
    out.push({ tag, score });
  }
  return out;
}

/** Missing quality/scene keys → [] (photoVisual-only vendor JSON still parses). */
function parseOptionalLabelArray(value: unknown): CloudVisionScoredLabel[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  return parseLabelArray(value);
}

function parseLabelsBlock(value: unknown): CloudVisionRawLabels | null {
  if (!isRecord(value)) return null;
  const photoVisual = parseLabelArray(value.photoVisual);
  const quality = parseOptionalLabelArray(value.quality);
  const scene = parseOptionalLabelArray(value.scene);
  if (photoVisual == null || quality == null || scene == null) {
    return null;
  }
  return { photoVisual, quality, scene };
}

function parseRefusal(value: unknown): CloudVisionRawRefusal | undefined {
  if (!isRecord(value)) return undefined;
  const code = String(value.code ?? "").trim();
  const message = String(value.message ?? "").trim();
  if (!code && !message) return undefined;
  return { code: code || "REFUSAL", message: message || "refused" };
}

function tryParseJsonString(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Unwrap chat-completions style body to inner JSON object. */
export function unwrapCloudVisionVendorPayload(body: unknown): unknown {
  const safe = stripCloudVisionSensitiveFields(body);
  if (!isRecord(safe)) return safe;

  if (isRecord(safe.labels)) {
    return safe;
  }

  const refusal = parseRefusal(safe.refusal);
  if (refusal) {
    return safe;
  }

  const choices = safe.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (isRecord(first)) {
      const message = first.message;
      if (isRecord(message)) {
        const content = message.content;
        if (typeof content === "string") {
          const parsed = tryParseJsonString(content);
          if (parsed != null) return parsed;
        }
      }
    }
  }

  if (typeof safe.content === "string") {
    const parsed = tryParseJsonString(safe.content);
    if (parsed != null) return parsed;
  }

  return safe;
}

/**
 * Parse vendor HTTP JSON body into scored labels (sensitive fields stripped).
 */
export function parseCloudVisionVendorResponse(
  body: unknown,
  options?: { requestId?: string },
): CloudVisionParseResult {
  const payload = unwrapCloudVisionVendorPayload(body);
  if (payload == null) {
    return { ok: false, reason: "invalid_json" };
  }
  if (!isRecord(payload)) {
    return { ok: false, reason: "not_object" };
  }

  const refusal = parseRefusal(payload.refusal);
  const labelsFromRoot = parseLabelsBlock(payload.labels);
  const labelsDirect = labelsFromRoot ?? parseLabelsBlock(payload);

  if (
    !labelsDirect &&
    !refusal &&
    payload.labels !== undefined &&
    !isRecord(payload.labels)
  ) {
    return { ok: false, reason: "malformed_labels" };
  }

  if (
    !labelsDirect &&
    !refusal &&
    isRecord(payload.labels) &&
    labelsFromRoot == null
  ) {
    return { ok: false, reason: "malformed_labels" };
  }

  if (!labelsDirect && !refusal) {
    if (typeof payload === "object" && Object.keys(payload).length === 0) {
      return { ok: false, reason: "empty_content" };
    }
    return { ok: false, reason: "missing_labels" };
  }

  if (!labelsDirect && refusal) {
    return {
      ok: true,
      labels: { photoVisual: [], quality: [], scene: [] },
      refusal,
      requestId: options?.requestId,
    };
  }

  if (!labelsDirect) {
    return { ok: false, reason: "malformed_labels" };
  }

  return {
    ok: true,
    labels: labelsDirect,
    refusal,
    requestId: options?.requestId,
  };
}
