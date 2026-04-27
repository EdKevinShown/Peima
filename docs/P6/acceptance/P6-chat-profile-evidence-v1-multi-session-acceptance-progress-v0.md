# P6：聊天补全画像 v1 — 多会话阈值验收进展（v0）

> 仅记录手工验收事实与结论；不涉及代码 / schema / 接口变更。

## 验收路径总览：真实 P6.8 链 vs 测试辅助

| 轮次 / 节 | 路径类型 | 说明 |
|------------|----------|------|
| **第一、二轮** | **真实产品路径** | 经 **P6.8** `POST profile-completion-suggestion` → 模型产出 → 用户 **accept** → 写入 `chat_profile_evidence` 并重算 `effectiveProfileChatOverlayV1`（与主文档一致）。 |
| **第三、四轮** | **测试辅助，非产品路径** | 为规避 LLM 或场景不可控，在库里 **直接 upsert / 准备** `chat_profile_evidence` 行后，**单独执行 overlay 重算**；**不**表示用户真实点击 accept 链。 |

> **测试辅助**仅用于**规则/状态机/保守回退**的验收，**不能**替代线上「建议生成 → 用户 accept」的端到端证明。

## 背景：stable 与 baseline_only 语义修正（重算器）

- 早先版本在「有问卷、≥3 独立会话、聊天与问卷同分支」时，overlay 曾 **错误** 输出 `baseline_only`。  
- **重算器已修正**：`baseline_only` **仅**表示**该轴无聊天证据**、仅靠问卷；当存在聊天证据且多会话同向与问卷一致时，应输出 **`stable`**，语义为 **「聊天证据强化问卷基线」**（`finalEffectiveBranch` 与问卷仍一致，非「覆盖」）。

---

## 测试用户

- `userId`：`cmo7ksq8s00006znosryc9k0n`

## 已验证闭环（**真实** P6.8：建议 → **accept** → 证据 + 重算）

1. **accept suggestion** 后，`profile_update_suggestions.status` 从 `pending` 变为 `accepted`。
2. **`chat_profile_evidence`** 按预期写入（`userId` + `conversationId` + `axisId` 维度可追踪）。
3. **`user_profile.effectiveProfileChatOverlayV1`** 在 accept 后成功重算。

---

## 第一轮：单会话（真实 P6.8 accept 路径）

| 字段 | 值 |
|------|-----|
| `conversationId` | `cmoc261mh000c6zr0o4qt0ar3` |
| `axisId` | `1` |
| `branch` | `B` |
| `state`（overlay `axes.1`） | `observing` |
| `independentConversationCount` | `1` |

---

## 第二轮：双会话（第二会话 accept，真实 P6.8 路径）

| 字段 | 值 |
|------|-----|
| `conversationId` | `cmo7nqkq900016za0nd71s2qt` |
| `suggestionId` | `cmogeqrj1001d6zhs0mvs5m3y` |
| `axisId` | `1` |
| `branch` | `B` |
| `status` | `accepted` |
| `resolvedAt` | `2026-04-26 23:38:39.352`（验收环境记录） |

### 证据聚合（`axisId = 1`，验收时查询口径）

- `row_count`：`2`
- `distinct_conversations`：`2`
- `total_weight`：`2`（与当时 `evidenceWeight` 聚合口径一致）

### Overlay（`axes.1`）

| 字段 | 值 |
|------|-----|
| `state` | `leaning` |
| `questionnaireBaselineBranch` | `B` |
| `finalEffectiveBranch` | `B` |
| `independentConversationCount` | `2` |

---

## 第三轮：三会话 → stable（测试辅助 + 重算验证）

> 为规避 LLM 在第三段真实会话中无法稳定产出「axis 1 / B」的情况，本轮使用**测试辅助**在 `chat_profile_evidence` 中写入/对齐三会话、同轴同分支证据后**再执行 overlay 重算**（非产品路径，仅作规则验收）。  

| 字段 | 值 |
|------|-----|
| `userId` | `cmo7ksq8s00006znosryc9k0n` |
| `axisId` | `1` |
| `questionnaireBaselineBranch` | `B` |

### 测试辅助证据（`axisId = 1`, `branch = B`, 各 `evidenceWeight = 1`）

| `conversationId` | 说明 |
|------------------|------|
| `cmoc261mh000c6zr0o4qt0ar3` | conv1 |
| `cmo7nqkq900016za0nd71s2qt` | conv2 |
| `p6v1_stable_conv_20260427_001` | conv3 |

### Overlay（`axes.1`）重算结果

| 字段 | 值 |
|------|-----|
| `state` | `stable` |
| `questionnaireBaselineBranch` | `B` |
| `finalEffectiveBranch` | `B` |
| `independentConversationCount` | `3` |

**含义**：本例 **`stable` 为「强化问卷基线」** — `finalEffectiveBranch` 与问卷均为 `B`，**不是**「覆盖问卷」型 stable。

---

## 第四轮：多会话、同轴不同分支 → `mixed_conflict`（测试辅助 + 重算验证）

> 本轮 **非产品路径**：不经过 P6.8 accept 链，仅在 `chat_profile_evidence` 中**测试辅助**写入/ upsert 同轴、不同 `branch` 后执行 overlay 重算，用于验证**冲突**与**保守回问卷**语义。

| 字段 | 值 |
|------|-----|
| `userId` | `cmo7ksq8s00006znosryc9k0n` |
| `axisId` | `1` |
| `questionnaireBaselineBranch` | `B` |

### 测试辅助证据（`axisId = 1`，各 `evidenceWeight = 1`）

| `conversationId` | `branch` |
|------------------|----------|
| `cmoc261mh000c6zr0o4qt0ar3` | `A` |
| `cmo7nqkq900016za0nd71s2qt` | `B` |
| `p6v1_stable_conv_20260427_001` | `C` |

### Overlay（`axes.1`）重算结果

| 字段 | 值 |
|------|-----|
| `state` | `mixed_conflict` |
| `questionnaireBaselineBranch` | `B` |
| `finalEffectiveBranch` | `B`（保守回问卷基线） |
| `leadingBranch` | `A` |
| `secondBranch` | `B` |
| `conflictReasons` | `["top2_weight_ratio_lt_1_2", "last_3_sessions_branch_mismatch"]` |

**含义**：`leading` 与问卷 `B` 不一致时，进入冲突态后**不**用聊天领先支强行写最终；有问卷时 **`finalEffectiveBranch` 回退为问卷 `B`**。`conflictReasons` 可审计触发原因（本例含并列差距与近次会话方向不一致类标记）。

---

## 结论（截至本记录）

| 验收项 | 结果 |
|--------|------|
| **1 个独立会话** → `observing` | **通过** |
| **2 个独立会话、同轴同分支** → `leaning` | **通过** |
| **有问卷基线时**，2 次聊天证据 **不随意覆盖** 最终画像：`finalEffectiveBranch` **仍与问卷锚点一致**（本例问卷 dominant 与聊天均为 `B`，表现为锚点保持） | **通过** |
| **3 个独立会话、同轴同分支** → **`stable`（强化问卷，非覆盖）** | **通过** |
| **多会话、同轴不同分支** → **`mixed_conflict`**，有问卷时 **`finalEffectiveBranch` 保守回 `questionnaireBaselineBranch`**；**`conflictReasons` 有记录** | **通过** |

---

## 规则对照说明（便于后续轮次对齐）

状态机与阈值见主文档：`docs/P6/P6-chat-profile-evidence-effective-overlay-v1.md`。
