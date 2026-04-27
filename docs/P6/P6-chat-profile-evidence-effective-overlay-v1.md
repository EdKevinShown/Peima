# P6：聊天补全画像 — 证据层 v1 + 最终生效画像重算器（不接主链）

## 三层关系（不覆盖问卷、不改匹配）

- **问卷 20 维与 `questionnaire_answers` 真源**不被 `chat_profile_evidence` 或 `effectiveProfileChatOverlayV1` 覆盖或回写。  
- **`chat_profile_evidence`（证据层）**：**仅**存「accept 后的结构化、可审计聊天证据行」，是事实记录与重算输入；**不**把单次 accept 当作对问卷 layer1/答案的直接改写。  
- **`user_profile.effectiveProfileChatOverlayV1`（派生 overlay）**：由问卷基线 + 证据**重算**的 **只读、派生 JSON**，不反向写回问卷；**不**影响 `MatchResult.finalScore`、**不**经 worker 队列、**不**进入主匹配/排序/预览池决策链；**当前**可视为聊天画像补全的侧车 overlay，**后续**可只读接入解释/展示/运营说明层。  

## 为什么 accept 不直接等于「最终画像改写」

- **问卷 20 维**仍是主锚点（真源在 `questionnaire_answers`；layer1 由 `buildAxisBranchProfilesV3(answers)` 得到）。
- **accept** 在现有 P6.8 路径仍会合并 `user_profile.dimensionBranchChatHints`（供 layer1 **补充** 展示/解释），这是历史行为；**v1 新增**的是独立 **`chat_profile_evidence`** 行：一次 accept 写入**结构化、可审计**证据，而不是把「最终生效」当场写死成用户最后一次点击。
- **ignore / dismiss** 中性：不入证据表、不触发重算。

## 证据层是什么

- 表：`chat_profile_evidence`（Prisma：`ChatProfileEvidence`）。
- 幂等键：`@@unique([userId, conversationId, axisId])` — 同会话同轴重复 accept **upsert**，不重复加票。
- 字段（最小集）：`userId`、`conversationId`、`axisId`、`branch`、`acceptedAt`、`sourceVersion`、`suggestionId?`、`sessionQualityBucket`、`sessionQualityWeight`、`freshnessBucket`、`freshnessWeight`、`evidenceWeight`（`clamp(sessionQualityWeight * freshnessWeight, 0, 1.15)`）、`acceptedByUser`、`revokedAt?`。
- 会话完成度分档：消息条数 → `very_short_probe` / `standard_short` / `medium_complete` / `long_chat`（权重 0.55 / 0.85 / 1.0 / 1.1）。
- 新鲜度：从会话**最后一条消息**时间（无消息则用会话 `createdAt`）到 accept 时刻的分钟差 → 0–10m…24h+ 分档（权重 1.0 … 0.3）。

实现入口：`ProfileSuggestionService.accept` 在 P6.8 dimension-branch hints 分支、写入 `dimensionBranchChatHints` 之后，若存在 `sourceConversationId`，调用 `ChatProfileEvidenceV1Service.upsertEvidenceAndRecomputeOverlay`（同事务）。

## 最终生效画像层怎么表达

- 字段：`user_profile.effectiveProfileChatOverlayV1`（JSON）。
- 内容：`recalcEffectiveProfileChatOverlayV1` 输出 — `schemaVersion: 1`、`computedAt`、按轴 `1`–`20` 的 `state`、`questionnaireBaselineBranch`、`finalEffectiveBranch`、`scoreByBranch`、会话数等。
- **不回写问卷**、不调用 worker、不改 `MatchResult.finalScore`；**第一阶段不接主匹配主链**（不进入预览池/匹配排序/Worker 主公式），仅供只读消费、管理端或**后续**只读接入解释/展示层。

### 每轴 `axes["1"…"20"]` 输出字段含义

| 字段 | 含义 |
|------|------|
| `questionnaireBaselineBranch` | 由**仅问卷** `buildAxisBranchProfilesV3(answers)` 得到的该轴 `dominantBranch`（可 `null`）。 |
| `finalEffectiveBranch` | 经状态机与门槛后的**该轴**可消费结果 branch；`mixed_conflict` 时有问卷多 **回退为问卷** `questionnaireBaselineBranch`。 |
| `state` | 见下节五种状态。 |
| `scoreByBranch` | 该轴上对各 branch（A–E）的 **`evidenceWeight` 求和**；**同一会话+轴**在库里通常一行，但历史若有多行则**全部**计入（用于领先比与占比）。 |
| `leadingBranch` / `secondBranch` | 在正权重 branch 中按**权重**排序的第一、第二名，便于阅读。 |
| `independentConversationCount` | 该轴上**不同** `conversationId` 的个数；「会话方向」由每 `(conversationId, axisId)` 取 **`acceptedAt` 最新**一条。 |
| `conflictReasons` | 仅当 `state === "mixed_conflict"` 时可能非空，枚举冲突检测**命中**原因，便于审计。 |

### 有问卷基线时：1/2/3 独立会话与「是否覆盖 `final`」

- **1 个**独立 `conversationId`：→ **`observing`**；`finalEffectiveBranch` **仍为问卷** dominant，**不**因聊天改写成领先支。  
- **2 个**独立会话、且在 `perConv` 上**同向**（同 branch）：→ **`leaning`**；`finalEffectiveBranch` **仍为问卷** dominant。  
- **≥3 个**独立会话、在 `perConv` 上**同向** 且 聊天与问卷 **同 branch**：→ **`stable`（强化问卷）**；`final` 仍为问卷。  
- **≥3 个**、同向 且 聊天 `leadingBranch` **≠** `questionnaireBaselineBranch`：**仅当** 同时满足（与实现一致）**覆盖门槛** 才 → **`stable`（覆盖向聊天）** 且 `finalEffectiveBranch = leadingBranch`；门槛包括：该同向局面上 **领先支权重/总聊天权重 ≥ 0.65**、**第一/二名权重比 ≥ 1.2**；**否则** 为 **`leaning`**，`final` 仍保守回问卷。  

「同向」在实现上为：各 `conversationId` 上该轴的**代表 branch** 集合为**单一** branch（与**权重聚合**中可能出现多支并存不同，覆盖门槛在后者上计算）。  

## 重算器状态机与阈值（落地在 `chat-profile-effective-overlay-v1.recalc.ts`）

每轴：

- **baseline_only**：**仅当该轴没有任何聊天证据**时；有问卷则 `finalEffectiveBranch = questionnaireBaselineBranch`；无问卷 dominant 时同字段可为 `null`（与「无信号」同档表达，类型上仍为 `baseline_only`）。
- **observing**：该轴有 **1** 次独立会话证据。有问卷时 `finalEffectiveBranch` 仍为问卷 dominant；无问卷时 `finalEffectiveBranch` 为 `null`。
- **leaning**：有问卷且 **2** 次独立会话且方向一致（`finalEffectiveBranch` 仍为问卷锚点）；或无问卷且 **2** 次一致 → **弱生效**（`finalEffectiveBranch` 为聊天领先 branch）。有问卷、**≥3** 次同向但聊天领先 **≠** 问卷且 **未** 满足下方覆盖门槛（占比 / 领先比）时，亦为 **leaning**，保守回问卷。
- **stable**：聊天证据已稳定，含两类语义：  
  - **强化问卷**：有问卷、**≥3** 次独立会话同向，且 `leadingBranch === questionnaireBaselineBranch` → `finalEffectiveBranch` 仍为问卷 dominant（与 **baseline_only** 区分：**baseline_only** 表示无聊天证据；**stable** 表示多会话聊天与问卷一致后的稳定强化）。  
  - **覆盖问卷**：有问卷、**≥3** 次同向、`leadingBranch !== questionnaireBaselineBranch`，且 **占比 ≥65%**、**领先第二名 ≥1.2** → `finalEffectiveBranch = leadingBranch`。  
  - 无问卷且 **≥3** 次同向 → **stable**，`finalEffectiveBranch = leadingBranch`。

**验收快照（多会话、强化型 stable）**：`userId` `cmo7ksq8s00006znosryc9k0n`，`axisId = 1`，问卷与聊天均为 `B`、**3 个独立** `conversationId` 证据后，`state = stable`，`finalEffectiveBranch = B`（见 `acceptance/P6-chat-profile-evidence-v1-multi-session-acceptance-progress-v0.md` 第三轮；含测试辅助证据说明）。

**验收快照（`mixed_conflict`，测试辅助、非产品路径）**：同用户/`axisId = 1` / 问卷 `B` 下，三会话同轴**不同** `branch`（A / B / C，等权）时，`state = mixed_conflict`，`finalEffectiveBranch = B`，`conflictReasons` 可含 `top2_weight_ratio_lt_1_2`、`last_3_sessions_branch_mismatch` 等（见同 acceptance 第四轮，**仅**为旁路直写 `chat_profile_evidence` 后重算，**不是** P6.8 建议 accept 链）。

- **mixed_conflict**：在**进入**按会话档位（1/2/3）推进之前，若**冲突检测**为真，则直接为 `mixed_conflict`。**检测项**（实现）包括且不限于：`scoreByBranch` 中前两名**均有正权重**且 **w1/w2 < 1.2**；**两**个 branch 在**独立会话计数**上均 **≥2**；**最近 3 个**按时间取样的独立会话的 branch **不完全相同**。另有**无问卷**、多 branch 等路径也会落入 `mixed_conflict`（见实现）。**保守**：有问卷时 `finalEffectiveBranch = questionnaireBaselineBranch`；无问卷时 `finalEffectiveBranch` 为 `null`。

冲突检测的简要枚举会写入 `conflictReasons`；与**档位冲突**（如 2 会话不同向、≥3 会话方向不一致）可能叠加出现不同 `conflictReasons` 或代码路径，以运行时 JSON 为准。

**同一 `userId` + `conversationId` + `axisId` 不重复刷票**：`@@unique` 上为 **upsert**；重复 accept 只更新同一条，**不**增加 `independentConversationCount` 的「多票」。

**聚合说明**：`scoreByBranch` 按表内**全量** `evidenceWeight` 求和；每会话的**方向**与**独立会话数**用「该 `conversationId+axisId` 上 `acceptedAt` 最新」的一条代表。旧行若仍存在，会留在求和中，**可能**使领先支占比**低于**覆盖门槛，从而得到保守 **`leaning`**（见上节）。

## 手工验收建议

1. `pnpm --filter @peima/database db:migrate`（或 deploy）+ `db:generate`，确保存在 `chat_profile_evidence` 与 `effectiveProfileChatOverlayV1` 列。
2. 走通一次 P6.8 建议 **accept**：查库 `chat_profile_evidence` 应有对应 `userId + conversationId + axisId` 行；`user_profile.effectiveProfileChatOverlayV1` 非空。
3. **同一对话同轴**再次 accept（新 suggestion）：该行 `branch`/`evidenceWeight` 等更新，**不应多出一行**。
4. **dismiss**：无新证据行、overlay 不变（相对上次 accept）。
5. 读 `effectiveProfileChatOverlayV1.axes["<axis>"]` 核对 `state` 与 `finalEffectiveBranch` 是否符合上述规则。

**多会话阈值验收进展（快照）**：见 `acceptance/P6-chat-profile-evidence-v1-multi-session-acceptance-progress-v0.md`。
