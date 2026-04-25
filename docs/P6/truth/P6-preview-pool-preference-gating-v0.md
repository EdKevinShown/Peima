# 第一步：Preference Gating v0 — 可开工实现说明

> **当前主链定义（唯一真源）**：以 [`P6-current-matching-chain-single-source-of-truth.md`](./P6-current-matching-chain-single-source-of-truth.md) 为准；本文若与其冲突，以真源文档为准。

> **实现状态（已落地）**：`@peima/shared/matching/preference-hard-gate`；预览池 **`PreviewPoolService.collectGatedCandidates`** 分批扫描时复用 **`passesPreferenceHardGate`**；单测 `apps/api/test/preference-hard-gate.spec.ts`。  
> **实现顺序**：本文件只定义 **第一步** —— **偏好前置硬过滤**；**不改** gate 维度语义。  
> **第二步（已落地）**：在通过 gate 的有界 **`G_all`** 上做 6 槽分层选入，见 **`docs/P6/truth/P6-preview-pool-layered-selection-v0.md`**（与第一步解耦交付，gate 逻辑仍只在本包与 `passesPreferenceHardGate` 调用处）。  
> **性质**：产品与实现边界说明；**本文件不含第二步分层算法**。

---

## 背景（第一步要解决什么）

在第二步落地前，预览池曾用「非本人 + 有图 + `relationProfile`」按 `createdAt` **凑满 6 人**即停。**第一步**目标：在**同一基线门槛**上，增加与 **`computePreferenceScore`** 同维度的 **硬过滤**（`passesPreferenceHardGate`），使「账号与偏好」成为素材池入口的**第一层**约束。**第二步**再在通过 gate 的有界 **`G_all`** 上分槽取 6 人（见分层专文）。

---

## 1. 要改哪些文件

| 文件 | 改动要点 |
|------|-----------|
| **`apps/api/src/modules/preview-pool/preview-pool.service.ts`** | **`collectGatedCandidates`**：`findUnique` viewer 的 `UserPreference` → `gatePref`；分批 `findMany` + **`passesPreferenceHardGate`** 构建有界 **`G_all`**；**`|G_all| < 6`** 时 `BadRequest`。（分层选人见 **`preview-pool-layered-selection.ts`**，不在本步范围。） |
| **新建（推荐）** `packages/shared/src/matching/preference-hard-gate.ts`（路径可微调，以仓库惯例为准） | 导出 **`passesPreferenceHardGate`**（及可选 **`preferenceGateDenominator`**），与 worker `computePreferenceScore` **同维同判**；`@peima/api` 的 `package.json` 增加对 `@peima/shared` 的依赖（若该函数放 shared）。 |
| **`packages/shared/package.json`** / **`apps/api/package.json`** | 若新增 shared 子路径：声明依赖与 `exports`（按现有 monorepo 模式）。 |
| **新建** `apps/api/test/preference-hard-gate.spec.ts`（或放在 `packages/shared` 的测试目录） | 单测 gate 与 `computePreferenceScore` 对齐（见 §6）。 |

**不应修改（第一步）**：`apps/worker/src/jobs/matching-score.ts` 内 **`computeFinalScoreV1` / 权重**（仅**读取**或**复用** `computePreferenceScore` 的维度定义，不在 worker 内改行为）；`LAYER_SPECS`、`generate` 写库结构；问卷与 `relationProfile` 规则。

**第二步才动**：分层选入、视觉/兼容/保底、`G_photo` 与无图入池等 —— **本步编码不涉及**。

---

## 2. 预览池查询逻辑怎么改

**当前行为**：`findMany` 一次，`where` = `id != viewerId` + `images.some` + `relationProfile` 非空，`orderBy: { createdAt: "asc" }`，`take: 6`。

**第一步目标行为**：

1. **`prisma.userPreference.findUnique({ where: { userId: viewerId } })`** → `prefRow`，可为 `null`。
2. **基础 `where` 不变**（与 batch-match / P6 对齐）：非本人、`images: { some: {} }`、`relationProfile: { isNot: null }`。
3. **禁止**再用单次 `take: 6` 定案。改为：
   - 常量 **`BATCH_SIZE`**（如 50）与 **`MAX_SCAN`**（可选上限，防止全表扫死；或先不设上限由产品决定）。
   - 循环：`skip = 0`，`findMany({ where, orderBy: { createdAt: "asc" }, skip, take: BATCH_SIZE, select: { id, age, city, height, education, occupation, relationshipGoal } })`。
   - 对每条记录若 **`passesPreferenceHardGate(prefRow, row)`** 为真，则 `push(id)`，直到 **`picked.length === 6`** 或本批结束。
   - `picked.length < 6` 则 `skip += BATCH_SIZE` 继续，直到某批返回 0 行（耗尽）。
4. **返回**：`picked.map(id => ({ id }))`，与现返回形状一致；长度 0～6。
5. **`generate`**：若 `picked.length < 6`，保持 **`BadRequestException`**；在现有计数错误文案上**追加**一句提示「可能与匹配偏好前置过滤过严有关」（§5）。

**第一步不做的查询变化**：不按槽位分池、不要求无图用户入池、不改变 `images.some` 全局条件。

---

## 3. 与 worker 的 `computePreferenceScore` 维度如何保持一致

- **规则**：凡在 **`apps/worker/src/jobs/matching-score.ts`** 的 **`computePreferenceScore`** 中会导致 **`denom++`** 的条件，在 gate 中必须 **同一条件 + 同一 `norm`/`inList` 语义** 下要求 **命中**（该项视为硬通过）。多维度同时配置时 **全部** 通过才 `true`。

| `computePreferenceScore` 分支 | 硬门槛 |
|------------------------------|--------|
| `minAge != null && maxAge != null` | `age` 在区间内；`age == null` → 不通过 |
| `preferredCities.length > 0` | `inList(city, preferredCities)` |
| `minHeight != null && maxHeight != null` | `height` 在区间内；`height == null` → 不通过 |
| `educationPreferences.length > 0` | `inList(education, …)` |
| `occupationPreferences.length > 0` | `inList(occupation, …)` |
| `relationshipGoalPreferences.length > 0` | `inList(relationshipGoal, …)` |

- **`styleTags`**：**不在** `computePreferenceScore` 的 denom 中 → **第一步 gate 不包含**。

**实现策略**：优先把 **`norm` / `inList` / gate 逻辑**抽到 **`@peima/shared`**，worker 后续可选改为从 shared 引用以彻底单源；**最小落地**允许在 API 侧复制逻辑，**必须在注释中写明**须与 `matching-score.ts` 同步。

---

## 4. viewer 无 preference 或无可评维度时怎么处理

| 情况 | 行为 |
|------|------|
| **`userPreference` 行不存在** | **`passesPreferenceHardGate` 恒为 `true`**（与当前「不读偏好」等价）。 |
| **行存在但与 `computePreferenceScore` 等价的 `denom === 0`**（无任何一项进入计分维度） | **恒为 `true`**，不施加偏好过滤。 |

实现建议：抽 **`preferenceGateDenominator(pref)`** 与 worker 同源，或直接在 gate 内复用同一套 `if` 计数，`denom === 0` → return true。

---

## 5. 候选不足 6 人怎么处理

- **仍不降级**：不满 6 人 → **`BadRequestException`**（与现行为一致）。
- **文案**：保留现有 `eligible` / `others_with_image_and_profile` 等统计；**追加**简短说明：在已启用**匹配偏好前置过滤**时，同时满足「有图 + 有画像 + 偏好硬条件」的候选人可能不足 6 人；可放宽偏好或增加池内用户数据。
- **可选**：`console` / 结构化 log 输出 `scannedRows`、`passedGateCount`（仅排障，不落库）。

---

## 6. 最小测试怎么跑

1. **单元测试 `passesPreferenceHardGate`**（或与 worker 对齐的 shared 函数）：  
   - `pref === null` → 任意候选 `true`。  
   - `denom === 0` → `true`。  
   - 仅年龄区间：边界内 `true`、外 `false`、`age` null `false`。  
   - 城市列表非空：命中 `true`、不命中 `false`；与 `norm`/`inList` 一致。  
   - 多维度组合：缺一即 `false`。
2. **与 worker 对齐抽查**：选 3～5 组手工构造 `User` + `UserPreference`，在同一候选上比较 **`computePreferenceScore === 1`** 与 **`passesPreferenceHardGate === true`** 是否等价（在 `denom>0` 时）。
3. **`PreviewPoolService` 级（集成 / mock）**：无 preference 行或零 denom 时，**`G_all`** 的 gate 行为与「仅基线 where」一致（可与固定种子数据断言）；**`|G_all| < 6`** 仍报错。
4. **极严偏好**：mock 返回大量用户但 0 人通过 gate → `generate` 抛 `BadRequest`，且文案含偏好提示。
5. **回归 smoke**：本地跑通「生成预览池 → enqueue → batch-match」主链，**不**断言最终 `MatchResult` 具体是谁，仅断言 **6 槽满时**无异常。

---

## 第一步与第二步的硬边界（防范围蔓延）

| 第一步只做 | 第一步不做 |
|------------|------------|
| 谁进 **`G_all`**（硬 gate + 基线 `where`） | 在 **`G_all`** 内按槽**分源排序**取 6 人（属**第二步**） |
| 与 **`computePreferenceScore` denom** 同维同判 | 把 **`styleTags`** 并入硬门槛 |
| 基线仍 **`images.some` + `relationProfile`**（与现实现一致） | 单独放宽 **`images.some`**（属产品 v0.1，需另评） |

---

*第二步已落地：见 **`docs/P6/truth/P6-preview-pool-layered-selection-v0.md`**；gate 变更仍只走本专文与 `preference-hard-gate.ts`。*

