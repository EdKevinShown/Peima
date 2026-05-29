/**
 * Pure helpers: extract first JSON object from LLM text and build safe invalid_json observability payloads.
 * No prompts, no API keys, no full raw LLM text in failureDetail (snippets only).
 */

export type InvalidJsonObservabilityReason =
  | "empty_content"
  | "no_json_object_found"
  | "fenced_json_unwrapped_failed"
  | "truncated_or_unbalanced_json"
  | "json_parse_error";

export type ExtractJsonObjectFromLlmTextResult =
  | { ok: true; jsonText: string }
  | {
      ok: false;
      reason: Exclude<InvalidJsonObservabilityReason, "empty_content" | "json_parse_error">;
      parseMessage?: string;
    };

const SNIPPET_HEAD_MAX = 800;
const SNIPPET_TAIL_MAX = 400;
const PARSE_MESSAGE_MAX = 500;

function stripBomAndTrim(s: string): string {
  let t = s.trim();
  if (t.charCodeAt(0) === 0xfeff) {
    t = t.slice(1).trim();
  }
  return t;
}

function truncateUtf16(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

/** First ``` … ``` block (optional `json` language tag). */
function tryExtractFirstFenceInner(text: string): { inner: string } | { fail: true } | null {
  const open = text.indexOf("```");
  if (open < 0) return null;
  let pos = open + 3;
  if (text.slice(pos, pos + 4).toLowerCase() === "json") {
    pos += 4;
  }
  while (pos < text.length && /\s/.test(text[pos]!)) pos += 1;
  const close = text.indexOf("```", pos);
  if (close < 0) {
    return { fail: true };
  }
  const inner = text.slice(pos, close).trim();
  if (inner.length === 0) {
    return { fail: true };
  }
  return { inner };
}

/**
 * From `start` (index of `{`), find matching `}` with string/escape awareness (JSON-ish double quotes).
 */
export function extractBalancedJsonObjectSlice(
  s: string,
  start: number,
): { jsonText: string } | { reason: "truncated_or_unbalanced_json" } {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return { jsonText: s.slice(start, i + 1) };
      }
    }
  }
  return { reason: "truncated_or_unbalanced_json" };
}

function firstJsonObjectFromWork(work: string): { jsonText: string } | { reason: "no_json_object_found" | "truncated_or_unbalanced_json" } {
  const i = work.indexOf("{");
  if (i < 0) {
    return { reason: "no_json_object_found" };
  }
  const bal = extractBalancedJsonObjectSlice(work, i);
  if ("reason" in bal) {
    return bal;
  }
  return { jsonText: bal.jsonText };
}

/**
 * Extract the first complete top-level JSON object from model output.
 * Supports plain JSON, ``` / ```json fences, leading/trailing prose, BOM/whitespace.
 */
export function extractJsonObjectFromLlmText(text: string): ExtractJsonObjectFromLlmTextResult {
  const normalized = stripBomAndTrim(text);
  if (normalized.length === 0) {
    return { ok: false, reason: "no_json_object_found" };
  }

  let work = normalized;
  const fence = tryExtractFirstFenceInner(work);
  if (fence && "fail" in fence) {
    return { ok: false, reason: "fenced_json_unwrapped_failed" };
  }
  if (fence && "inner" in fence) {
    work = fence.inner;
  }

  const obj = firstJsonObjectFromWork(work);
  if ("reason" in obj) {
    return { ok: false, reason: obj.reason };
  }
  return { ok: true, jsonText: obj.jsonText };
}

export function buildInvalidJsonObservabilityDetail(input: {
  reason: InvalidJsonObservabilityReason;
  parseMessage?: string;
  rawContent: string;
}): Record<string, unknown> {
  const rawContentLength = input.rawContent.length;
  const rawContentSnippet =
    rawContentLength === 0 ? undefined : truncateUtf16(input.rawContent, SNIPPET_HEAD_MAX);
  let rawContentTailSnippet: string | undefined;
  if (rawContentLength > SNIPPET_HEAD_MAX) {
    rawContentTailSnippet = truncateUtf16(
      input.rawContent.slice(Math.max(0, rawContentLength - SNIPPET_TAIL_MAX)),
      SNIPPET_TAIL_MAX,
    );
  }
  const out: Record<string, unknown> = {
    stage: "json_parse",
    reason: input.reason,
    rawContentLength,
  };
  if (input.parseMessage != null && input.parseMessage !== "") {
    out.parseMessage = truncateUtf16(input.parseMessage, PARSE_MESSAGE_MAX);
  }
  if (rawContentSnippet != null) {
    out.rawContentSnippet = rawContentSnippet;
  }
  if (rawContentTailSnippet != null) {
    out.rawContentTailSnippet = rawContentTailSnippet;
  }
  return out;
}
