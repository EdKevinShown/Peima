/** P1-6: unified tone for rule-based placeholder copy (no AI, no field renames). */

/** Single disclaimer line; append where a sentence should state non-AI provenance. */
export const P1_DISCLAIMER = "说明由规则生成，非大模型。" as const;

/** Inline marker for placeholder bullets / clauses (matches prior “规则占位” wording). */
export const P1_MARK = "（规则占位）" as const;

/** Prefix for staged guidance (e.g. chat). Use as: `${P1_HINT_PREFIX}${P1_MARK}：…` */
export const P1_HINT_PREFIX = "阶段提示" as const;
