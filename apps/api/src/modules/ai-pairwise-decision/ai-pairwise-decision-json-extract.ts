import { extractJsonObjectFromLlmText } from "../ai-simulation-v1/ai-simulation-v1-json-extract";

/**
 * M3.8-M2: extract first JSON object from model text (reuses ai-simulation-v1 fence / balance logic).
 * Failures do not embed full `text` — only a short `reason` token.
 */
export type ExtractJsonObjectFromTextFailure = {
  ok: false;
  code: "json_extract_error";
  reason: string;
};

export type ExtractJsonObjectFromTextResult =
  | { ok: true; jsonText: string }
  | ExtractJsonObjectFromTextFailure;

export function extractJsonObjectFromText(text: string): ExtractJsonObjectFromTextResult {
  const r = extractJsonObjectFromLlmText(text);
  if (r.ok) {
    return { ok: true, jsonText: r.jsonText };
  }
  return { ok: false, code: "json_extract_error", reason: r.reason };
}
