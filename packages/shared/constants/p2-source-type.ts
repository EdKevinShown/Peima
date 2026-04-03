/**
 * P2: allowed values for `source_type` on generated or persisted payloads.
 * Not exhaustive for future LLM-backed types; add new ids without changing existing keys.
 */

export const P2SourceType = {
  RuleBased: "rule_based",
  TemplateBased: "template_based",
  Placeholder: "placeholder",
  Hybrid: "hybrid",
} as const;

export type P2SourceTypeId = (typeof P2SourceType)[keyof typeof P2SourceType];
