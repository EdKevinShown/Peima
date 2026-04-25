/** Structured log `event` for Interaction Simulation Lite (P6.y). */
export const INTERACTION_SIMULATION_LITE_LOG_EVENT =
  "interaction_simulation_lite";

/** Rule-only `sourceVersion` when no model or rule path only（v2：coherence + summary 统领）。 */
export const INTERACTION_SIMULATION_LITE_RULE_SOURCE_VERSION =
  "p6.y-interaction-lite-rule-v2";

/** Prompt / JSON schema iteration tag (model path). */
export const INTERACTION_SIMULATION_LITE_PROMPT_VERSION =
  "p6.y-interaction-lite-prompt-v1";

/**
 * `fallbackUsed`（与 P6.x Match Review 一致）：
 * - **`false`**：未走模型主路径 —— 规则直出（`ENABLED=0` / 未配 Key 的 `missing_config` / `disabled`），或模型成功返回有效 JSON。
 * - **`true`**：已尝试调用模型但因超时、HTTP、网络层失败（`meta.reason: network`）、空内容、JSON 无效等原因回退到规则填充同一 schema。
 */
export const INTERACTION_SIMULATION_LITE_FALLBACK_USED_DOC =
  "fallbackUsed: false = rule-only or model-ok; true = attempted model then rule fill";
