# 第三步：视觉信号增强 v0 — 实现说明（stub 主链已落地）

> **当前主链定义（唯一真源）**：以 [`P6-current-matching-chain-single-source-of-truth.md`](../truth/P6-current-matching-chain-single-source-of-truth.md) 为准；本文若与其冲突，以真源文档为准。

> **前提**：**Preference Gating v0**、**Preview Pool Layered Selection v0**、以及 **前端 / `itemMeta` / 文案** 已收口。  
> **当前范围（本轮收口）**：**stub 主链已在 API 落地**——**不**接真实多模态 HTTP 供应商、**不**接 **Redis**、**不**扩字段到 `photo_kind` / `face_frame` 等完整专文形态；仅 **`viewer_fit_score` + `confidence` + `image_id` 校验** 参与 **`S_visual`**。  
> **`S_visual` 作用域**：**仅**用于 **`pickVisualCandidates`** 内的视觉排序（**rank 1–2** 候选人来源）；**不**改 **`pickCompatCandidates` / `pickBackupCandidates`** 的排序键；**rank 3–6** 行为与第二步一致。  
> **失败语义**：**按候选人（按首图）单条回退**——该人若无合法增强分则 **`visualEnhance` 不写入**，该人在视觉上 **等同纯 `computeStyleScore`**；**不**因单图失败让 **`POST /preview-pool/generate` 失败**（在 **`|G_all| ≥ 6`** 前提下仍 **200**）。  
> **约束（仍有效）**：**不**改 worker `computeFinalScoreV1`、**不**改 batch-match 读写字段语义、**不**改问卷 / `relationProfile`、**不**改 6 槽表结构。

---

## 0. 落地状态（stub v0）

| 项 | 说明 |
|----|------|
| **实现** | **`apps/api/src/modules/preview-pool/visual-signal-enhance-stub.ts`** — `StubPreviewVisualEnhanceClient`、`parseStubVisualEnhancePayload`、`applyPreviewVisualEnhanceStubGAll`、超时 `Promise.race`。 |
| **编排** | **`apps/api/src/modules/preview-pool/preview-pool.service.ts`** — `generate` 内开关为真时，在 **`assignLayeredSixUserIds`** 前调用 **`applyPreviewVisualEnhanceStubGAll`**。 |
| **排序** | **`apps/api/src/modules/preview-pool/preview-pool-layered-selection.ts`** — **`computeVisualSortScore`**：`α=0.55`·tag + `β=0.45`·`viewer_fit_score`·`confidence`；无 **`visualEnhance`** 时 **= 纯 tag**。 |
| **首图 id** | **`collectGatedCandidates`** 已 `select` 首图 **`id`** → **`firstImageId`**。 |
| **环境变量** | **`.env.example`**：`PEIMA_PREVIEW_VISUAL_ENHANCE_ENABLED`、`PEIMA_PREVIEW_VISUAL_ENHANCE_TIMEOUT_MS`。 |
| **单测** | **`apps/api/test/preview-pool-layered-selection.spec.ts`**、**`apps/api/test/visual-signal-enhance-stub.spec.ts`**。 |

**明确未做（与真实供应商版差距）**：无 **HTTP 客户端**、无 **Redis / DB 缓存**、无 **`photo_kind` / `face_frame` / `vibe_labels`** 权重表、无 **多模态 prompt 版本化** 与 **按 viewer 的缓存键细分**（除 stub 内 `image_id` 对齐外）。

---

## 与第二步分步的原因（摘要）

- **故障隔离**：增强失败应 **单候选回退**，不拖垮整池。  
- **观测与预算**：开关与超时已为后续供应商接入预留。  
- **合规**：真实图像上云、日志脱敏等 **在接供应商前** 另案评审。

---

## 1. 第三步与第二步的边界

| 维度 | **第二步（已落地）** | **第三步（当前 stub）** |
|------|----------------------|---------------------------|
| **输入** | 有界 **`G_all`** + 首图 **`styleTags`** + **`firstImageId`** | 同上；stub 仅消费 **`firstImageId`** 生成确定性 JSON |
| **输出** | 6 槽写库 | 不变；**仅**可能改变 **rank 1–2** 人选（**`G_photo` 内排序**） |
| **排序** | **`computeStyleScore`** + `createdAt` | **`computeVisualSortScore`**（有合法 stub 则融合，否则 **= tag**） |
| **失败** | — | **单图**：不写 **`visualEnhance`** → **该人 tag-only**；**整池仍成功** |

---

## 2. 代码接入位置（已实现 stub）

1. **`PreviewPoolService.generate`**：`collectGatedCandidates` 之后、**`assignLayeredSixUserIds`** 之前，若 **`isPreviewVisualEnhanceEnabled()`** 则 **`applyPreviewVisualEnhanceStubGAll`**。  
2. **`pickVisualCandidates`** → **`compareVisualStyleOrder`** → **`computeVisualSortScore`**（**仅**影响视觉段）。  
3. **后续接真实供应商**：替换 / 并行实现 **`PreviewVisualEnhanceClient`**，保留 **编排位置** 与 **单候选回退** 契约即可。

---

## 3. 缓存、失败回退、schema（当前 vs 规划）

### 3.1 当前 stub 行为

- **无 Redis**：每次生成对 **`G_photo`** 并发调用内存 stub（**无**跨请求缓存）。  
- **Schema**：**`parseStubVisualEnhancePayload`** — 非 object、`image_id` 不匹配、缺字段、非数 → **null** → 不写 **`visualEnhance`**。  
- **超时**：**`PEIMA_PREVIEW_VISUAL_ENHANCE_TIMEOUT_MS`**（默认 800）与 **`client.enhance`** `Promise.race`；超时 → **该候选不写** `visualEnhance`。  
- **非法 JSON**：stub 不经网络；若未来 HTTP 层 **`JSON.parse` 失败**，须 **等同 schema 失败** 单条回退。

### 3.2 规划（真实供应商 + Redis 前再实现）

- 缓存键：`prompt_version` + `model` + `image_id`（± viewer **`styleTags` hash**）。  
- Redis TTL、命中率指标、全局每请求 **LLM 次数上限** 等 —— 见下文 **「升级到真实供应商版的最小前置条件」**。

---

## 4. `S_visual` 与字段映射（当前 stub）

\[
S_{\mathrm{visual}} = 0.55 \cdot \mathrm{tagVisualScore} + 0.45 \cdot \mathrm{viewer\_fit\_score} \cdot \mathrm{confidence}
\]

- **`tagVisualScore`**：`computeStyleScore(viewerPref, 首图 styleTags)`。  
- **`viewer_fit_score` / `confidence`**：stub 输出，**`[0,1]`** 钳制。  
- **无 `visualEnhance`**：**\(S_{\mathrm{visual}} = \mathrm{tagVisualScore}\)**（与第二步一致）。

**完整专文字段**（`photo_kind`、`face_frame`、`vibe_labels` 等）留待 **真实模型版** 再接入权重表。

---

## 5. 无图、半露脸、风格照（规划）

当前 stub **不**区分半脸 / 风格照；**不**改 **`G_photo`** 成员集合。未来供应商版按本专文原 **§5** 表实现 **`w_face` / `w_photo`**。

---

## 6. 本轮仍不做什么

- **不**接真实多模态供应商、**不**加 Redis。  
- **不**改 worker、**不**改 rank3–6 算法路径、**不**改 gate / `baseWhere`。  
- **不**对 **`MAX_GATED_CANDIDATES`（200）** 全量强制打外部 LLM（后续用 **预算 + 截断**）。

---

## 7. 自动化测试（已实现）

见 **`apps/api/test/preview-pool-layered-selection.spec.ts`**、**`apps/api/test/visual-signal-enhance-stub.spec.ts`**（开关等价、stub 改序、非法 payload、超时、`parse` 边界）。

---

## 8. 最小手工 smoke checklist（预览池第三步 stub）

在测试库具备 **≥6** 名带图、有画像、过 gate 的候选人；viewer 已登录 JWT。

1. **`PEIMA_PREVIEW_VISUAL_ENHANCE_ENABLED=0`（或不设）**  
   - [ ] 连续两次 **`POST /preview-pool/generate`**（或对比关开前后）：**rank1–2 的 `candidateUserId` 顺序**与仅第二步预期一致（或与关闭前一次相同数据下一致）。  
   - [ ] **rank3–6** `candidateType` / 顺序逻辑无异常。

2. **`PEIMA_PREVIEW_VISUAL_ENHANCE_ENABLED=1`**  
   - [ ] 同一数据下 **rank1–2** 与 **`ENABLED=0`** 时 **可比观测差异**（stub 为确定性分数，可与「仅 tag」对照）。  
   - [ ] 响应 **200**，**6 槽**无重复 id。

3. **回退（非法 payload / 超时）**  
   - [ ] 将 **`PEIMA_PREVIEW_VISUAL_ENHANCE_TIMEOUT_MS=1`** 并临时使用会阻塞的 client（若仅文档验收可依赖单测）：或依赖 CI 中单测已覆盖 **超时 / `image_id` 不匹配** → **整池仍 200**，视觉序 **退化为纯 tag**。  
   - [ ] API 日志 / 行为：**无未捕获 500**。

4. **`enqueue` + `batch-match`**  
   - [ ] 生成池后 **`POST /matching/enqueue`**，跑一轮 worker **batch-match**：**无新增失败**（worker 不读增强字段）。

---

## 9. 从 stub 版升级到「真实供应商版」的最小前置条件

1. **供应商契约**：固定 **HTTPS** 端点、**API Key** 与密钥轮转、**请求/响应大小上限**、**429/5xx 重试策略**（与「单候选回退」兼容）。  
2. **输入**：首图 **可访问 URL** 或 **受控内网拉流** 规则；**prompt** 内允许的 viewer 侧字段白名单（**禁止**灌入完整自由文本问卷 v0）。  
3. **输出**：与 **`parseStubVisualEnhancePayload`** 同级或 **超集** 的 **JSON schema** + **`response_format`**；**版本号**写入缓存键。  
4. **缓存**：**Redis**（或等价）+ **TTL** + **键 = f(model, prompt_version, image_id, viewer_style_hash)`**；可选 **进程内 LRU** 作二级。  
5. **可观测性**：按 **`image_id`** 的 **latency、失败码、schema_reject 计数**；**不**记录原始图像 base64 入应用日志。  
6. **成本与 P99**：每请求 **LLM 调用上限**、队列化 / 异步预计算（若产品允许「先生成池、后刷新视觉序」另议）。  
7. **合规**：用户协议 / 地区法下 **图像发送许可**；**NSFW / 未成年人** 与产品安全策略对齐（可仍 **软降权** 而非硬删 v0）。  
8. **Nest 注入**：**`PreviewVisualEnhanceClient`** 接口 + **真实实现 provider**，stub 保留为 **测试与本地默认**。

---

*第二步基线：**`docs/P6/truth/P6-preview-pool-layered-selection-v0.md`**；合并导航：**`docs/P6/truth/P6-preview-pool-gating-and-layered-v0.md`**。*
