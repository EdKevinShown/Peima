# 第二步：预览池分层选入 v0 — 实现说明与验收索引

> **当前主链定义（唯一真源）**：以 [`P6-current-matching-chain-single-source-of-truth.md`](./P6-current-matching-chain-single-source-of-truth.md) 为准；本文若与其冲突，以真源文档为准。

## 落地状态（已落地）

**Preview Pool Layered Selection v0** 已在 API 侧实现，与第一步 **Preference Gating v0** 串联使用（gate 逻辑**未改**，仍见 `@peima/shared/matching/preference-hard-gate`）。

| 说明 | 路径 |
|------|------|
| 预览池服务（有界 `G_all`、写库 6 槽） | `apps/api/src/modules/preview-pool/preview-pool.service.ts` |
| 分层选人纯函数（视觉 / 兼容 / 保底 / 借位） | `apps/api/src/modules/preview-pool/preview-pool-layered-selection.ts` |
| 与 worker 一致的排序键（仅预览池内使用） | `packages/shared/matching/preference-score.ts`（`computePreferenceScore`、`computeStyleScore`） |
| 单元测试 | `apps/api/test/preview-pool-layered-selection.spec.ts` |

> **前提（仍冻结）**：第一步专文见 **`docs/P6/truth/P6-preview-pool-preference-gating-v0.md`**。合并路线图见 **`docs/P6/truth/P6-preview-pool-gating-and-layered-v0.md`**。第三步见 **`docs/P6/specs/P6-preview-pool-visual-signal-enhancement-v0.md`**（**stub 主链已落地**；真实供应商未接）。

---

## 当前实际限制（与「结构上预留」的区别）

- **`baseWhere` 仍包含 `images: { some: {} }`**：进入 **`G_all`** 的候选人**必须至少有一张照片**。因此文档里常见的「**无图用户可进兼容位 / 保底位**」在**当前实现中尚未成立**——那只是 **`G_all` 去掉全局有图条件之后**的产品/结构预留；**现状**下兼容位与保底位候选人**同样有图**（与第一步基线一致）。
- **逻辑上**仍区分 **`G_photo`**（`hasImage === true`，用于视觉排序与借位判断）：在现网 `baseWhere` 下与 **`G_all`** 成员集合一致；**借位**在「有图子集不足以填满 2 个视觉位」时触发（单测与极端数据下可见；常规全有图库中较少触发）。

---

## `rankInPool` × `candidateType` 语义（已写库，勿与旧 P0 混淆）

第二步起，写库的 **`LAYER_SPECS`** 为：

| `rankInPool` | 槽类 | `candidateType` | 默认 `displayMode` | 说明 |
|--------------|------|-------------------|---------------------|------|
| 1–2 | 视觉位 | **`visual`** | **`full`** | 按 **`computeStyleScore`**（viewer `styleTags` ∩ 首图 `styleTags`）排序选人。 |
| 3–4 | 兼容位 | **`preference`** | **`full`** | 按 **`computePreferenceScore`** 排序选人（与 worker 维度一致，**不改** worker 权重）。 |
| 5–6 | 保底位 | **`backup`** | **`locked`** | 剩余候选人中 **`createdAt` asc**，并列 **`preferenceScore` 降序**。 |

**与旧版（第二步前）的差异**：曾存在 **rank 1–2 为 `preference`、rank 3–4 为 `visual` + `blurred`** 的写库组合；现已改为 **上表**。若文档、验收清单或口头说明仍写「前两槽偏好、三四槽视觉」，需按本表更正。

**借位**：视觉位不足 2 人时从兼容排序队首借人；该槽 **`displayMode` 降为 `blurred`**，`itemMeta.slotReason` 会追加借位说明。

---

## 与第一步的衔接（行为摘要）

1. 分批扫描同一 **`baseWhere`**，对每行仍用 **`passesPreferenceHardGate`**；通过者进入有界 **`G_all`**（上限 **`MAX_GATED_CANDIDATES = 200`**，见 `preview-pool-layered-selection.ts`）。  
2. 在 **`G_all` 上**执行分层 **`assignLayeredSixUserIds`**，产出 **6 个互异** `candidateUserId`。  
3. **`|G_all| < 6`** → **`BadRequest`**，不放宽 gate。

---

## 1. 最终推荐的 6 槽结构

与上文「已写库」表一致；**不再**建议「保留前两槽 `preference` 字面量」——实现已统一为 **`visual` / `preference` / `backup`**。

---

## 2. 每类槽位的职责

- **视觉位（×2）**：在 **`G_photo`** 上按 **`computeStyleScore`** 选人；不承担硬匹配结论。  
- **兼容位（×2）**：在 **未占视觉位** 的 **`G_all`** 上按 **`preferenceScore`** 选人。  
- **保底位（×2）**：在剩余 **`G_all`** 上稳定补位（见上表）。

---

## 3. 每类槽位从哪一批候选里选

| 槽类 | 逻辑池 |
|------|--------|
| **视觉位** | **`G_photo` ⊆ `G_all`**（`hasImage`） |
| **兼容位** | **`G_all \` 已选视觉** |
| **保底位** | **`G_all \` 已选视觉 \ 已选兼容** |

---

## 4. 生成顺序

1. 视觉 → 2. 兼容 → 3. 保底；**全程 `candidateUserId` 去重**。

---

## 5. 候选不足时如何补位

| 场景 | 策略 |
|------|------|
| **`|G_photo|` 不足以填满 2 个视觉位** 且 **`|G_all| ≥ 6`** | 从 **兼容排序**借人填视觉槽；**`displayMode` → `blurred`**。 |
| **`|G_all| < 6`** | **`BadRequest`**。 |

---

## 6. 视觉位的轻量信号 v0

- **输入**：viewer **`UserPreference.styleTags`**；候选人 **首图**（`UserImage` **`createdAt` asc** 取 1）**`styleTags`**。  
- **得分**：**`computeStyleScore`**（与 worker 一致）；**不接 LLM**。

---

## 7. 保底位如何避免变成纯凑数

- 仍在 **`G_all`**（已过 gate）；**`createdAt` asc** + 并列 **`preferenceScore` 降序**。

---

## 8. 最小测试建议（自动化）

见 **`apps/api/test/preview-pool-layered-selection.spec.ts`**（分层、借位、去重、保底排序等）。

---

## 9. 前端与文案同步清点

| 位置 | 说明 |
|------|------|
| **`apps/web/src/pages/PreviewPoolPage.jsx`** | **已同步**：页内可见说明 rank1–2 **`visual`** / 3–4 **`preference`** / 5–6 **`backup`** 及借位 **`blurred`**。 |
| **`apps/web/src/api/previewPool.ts`** | **已同步**：`generatePreviewPool` 的 JSDoc 与当前 gate + 分层语义一致。 |
| **`apps/api/.../preview-pool.service.ts` → `buildItemMetaPlaceholder`** | **已同步**：rank 3–4 的 **`itemMeta.slotReason`** 为 **「兼容排序槽」** +「按账户偏好维度对齐度排序」。 |
| **`docs/P0/P0-acceptance-checklist.md`** | 此前旧规则已改为 P6 第二步；验收时勿再按 **rank1–2 `preference`、3–4 `visual`**。 |
| **历史池数据 / 报表** | **未改数据**：旧池仍为 rank1–2 **`preference`**；新池为 **`visual`**。按 `pool.createdAt` 区分。 |
| **README / P0 handoff** | 已写清新映射；其它散落副本若有旧 **rank↔type** 句需人工搜一遍。 |

**未发现**前端把 **`candidateType === 'preference'`** 写死为「仅 rank1–2」的逻辑。

---

## 10. 最小手工验收 checklist（第二步）

在测试库准备：**≥6** 名带图、有 **`relationProfile`**、且过 viewer 偏好 gate 的候选用户；viewer 配置 **`UserPreference.styleTags`** 与部分候选首图 **`styleTags`** 以便拉开 **`computeStyleScore`**。

1. **视觉位（rank 1–2）**  
   - [ ] 调用 **`POST /preview-pool/generate`** 成功后，`items` 中 **rank 1、2** 的 **`candidateType` 均为 `visual`**。  
   - [ ] 在 DB 或接口中核对：两名候选人首图与 viewer 的 **style 交集**应相对其余有图候选**更高**（viewer 无 `styleTags` 时人人 style 分为 0，则顺序主要由 **`createdAt` asc** 打破平局，属预期）。

2. **借位与 `displayMode`**  
   - [ ] 在**能构造「有图不足以支撑视觉位」**的数据集上（或依赖单测），借位填入的视觉槽 **`displayMode` 为 `blurred`**，且 **`itemMeta.slotReason`** 含借位说明。  
   - [ ] 无借位时，rank 1–2 为 **`full`**。

3. **兼容位（rank 3–4）**  
   - [ ] **`candidateType` 为 `preference`**，**`displayMode` 为 `full`**。  
   - [ ] 两名用户为 **「去掉视觉位 2 人后」** 按 **`computePreferenceScore` 最高**者优先（可与手算或脚本对照）。

4. **保底位（rank 5–6）**  
   - [ ] **`candidateType` 为 `backup`**，**`displayMode` 为 `locked`**。  
   - [ ] 两人为剩余候选中 **`createdAt` 最早**者优先；同 `createdAt` 时 **`preferenceScore` 高**者优先。

5. **不足 6 人**  
   - [ ] 收紧偏好或清空候选后 **`POST /preview-pool/generate`** 返回 **400**，body 含 **`not enough candidates`** / **`eligible_gated_pool`** 等提示。

6. **去重**  
   - [ ] 六个 **`candidateUserId`** 互不相同。

7. **回归**  
   - [ ] **`POST /matching/enqueue`** + worker **batch-match** 仍能消费该池跑通（不强制断言最终 winner）。

---

*第一步 gate 语义变更请走缺陷单，勿与本步分层实现混改。*
