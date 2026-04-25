# docs/P6 整理执行清单（Round 1）

> **本轮目标**：只做 **「新建 `README.md` + `archive/` 首批归档」**，**不**改正文、**不**合并正文、**不**删文件。  
> **总方案**：见此前约定的 **docs/P6 文档整理方案 v0**（`truth/`、`acceptance/`、`specs/`、`archive/` 分层）。Round 1 **不移动** `truth/` / `acceptance/` / `specs/` 内文件，仅 **预创建空目录**（可选）以便后续轮次。

---

## 1. 先创建哪些目录

在仓库根执行（PowerShell 示例；**若目录已存在会报错，可忽略**）：

```powershell
cd docs/P6
mkdir archive/historical -Force
mkdir archive/drafts -Force
```

**可选（为后续 Round 2 占位，本轮不往里 `git mv`）**：

```powershell
mkdir truth -Force
mkdir acceptance -Force
mkdir specs -Force
```

---

## 2. `docs/P6/README.md` 最小应该写什么

在 **`docs/P6/README.md`**（新建）中建议 **仅包含**：

1. **一句目的**：本目录为 P6 文档根；**默认真源**见下方列表。  
2. **「真源（Truth）」小节**：无序列表，链到当前仍在根目录的 7 个文件（**Round 1 尚未移动**，用**现有相对路径**）：  
   - [`P6-current-matching-chain-single-source-of-truth.md`](./truth/P6-current-matching-chain-single-source-of-truth.md) — 主链顺序
   - [`P6-ai-simulation-v1-implementation-notes.md`](./truth/P6-ai-simulation-v1-implementation-notes.md)
   - [`P6-backend-intelligent-prescreen-v0-implementation-notes.md`](./truth/P6-backend-intelligent-prescreen-v0-implementation-notes.md)
   - [`P6.z-readout-fusion-v0-implementation-notes.md`](./truth/P6.z-readout-fusion-v0-implementation-notes.md)
   - [`P6-preview-pool-gating-and-layered-v0.md`](./truth/P6-preview-pool-gating-and-layered-v0.md)
   - [`P6-preview-pool-layered-selection-v0.md`](./truth/P6-preview-pool-layered-selection-v0.md)
   - [`P6-preview-pool-preference-gating-v0.md`](./truth/P6-preview-pool-preference-gating-v0.md)
3. **一句「能力地图」**：[`P6-current-stage-capabilities-P6x-P6y.md`](./specs/P6-current-stage-capabilities-P6x-P6y.md)  
4. **一句「归档区」**：草稿与长文历史见 [`archive/`](./archive/)（Round 1 已迁入首批文件）。  
5. **不写**：长篇背景、重复 implementation 摘要、其它文档索引（留待 Round 2）。

---

## 3. 第一批应移动到 `archive/` 的文件列表

| 源文件（均在 `docs/P6/` 下） | 目标 |
|-----------------------------|------|
| `AI-MATCHING-SIMULATION-PLAN.md` | `archive/historical/AI-MATCHING-SIMULATION-PLAN.md` |
| `P6-ai-production-evolution-plan.md` | `archive/historical/P6-ai-production-evolution-plan.md` |
| `ai-simulated-matching-boundaries-draft.md` | `archive/drafts/ai-simulated-matching-boundaries-draft.md` |
| `ai-simulated-matching-minimal-start-definition.md` | `archive/drafts/ai-simulated-matching-minimal-start-definition.md` |
| `P6.8-suggestion-generation-review-minimal-rules-draft.md` | `archive/drafts/P6.8-suggestion-generation-review-minimal-rules-draft.md` |

**共 5 个文件**；均为低依赖风险的 **历史长文 / 草稿**。

---

## 4. 每一步建议的 `git mv` 命令

在 **仓库根** `peima/` 执行（路径按 Unix 风格，`git` 在 Windows 上同样可用）。

### Step A — 创建目录后、移动 archive 之前

（无 `git mv`；若未执行 §1 的 `mkdir`，请先执行。）

### Step B — 迁入 `archive/historical/`

```bash
git mv docs/P6/AI-MATCHING-SIMULATION-PLAN.md docs/P6/archive/historical/AI-MATCHING-SIMULATION-PLAN.md
git mv docs/P6/P6-ai-production-evolution-plan.md docs/P6/archive/historical/P6-ai-production-evolution-plan.md
```

### Step C — 迁入 `archive/drafts/`

```bash
git mv docs/P6/ai-simulated-matching-boundaries-draft.md docs/P6/archive/drafts/ai-simulated-matching-boundaries-draft.md
git mv docs/P6/ai-simulated-matching-minimal-start-definition.md docs/P6/archive/drafts/ai-simulated-matching-minimal-start-definition.md
git mv docs/P6/P6.8-suggestion-generation-review-minimal-rules-draft.md docs/P6/archive/drafts/P6.8-suggestion-generation-review-minimal-rules-draft.md
```

### Step D — 新建 `docs/P6/README.md`

（用编辑器新增文件；**不**用 `git mv`。）

```bash
git add docs/P6/README.md
```

---

## 5. 每一步之后该跑什么 `git grep` 检查引用

### 在 Step B 之后（每批 historical 移完可跑一次）

```bash
git grep -n "AI-MATCHING-SIMULATION-PLAN"
git grep -n "P6-ai-production-evolution-plan"
```

### 在 Step C 之后（drafts 全部移完）

```bash
git grep -n "ai-simulated-matching-boundaries-draft"
git grep -n "ai-simulated-matching-minimal-start-definition"
git grep -n "P6.8-suggestion-generation-review-minimal-rules-draft"
```

### 在 Step D（README add）之后 — 全库扫旧路径

```bash
git grep -n "docs/P6/AI-MATCHING-SIMULATION-PLAN"
git grep -n "docs/P6/P6-ai-production-evolution-plan"
git grep -n "docs/P6/ai-simulated-matching"
git grep -n "P6.8-suggestion-generation-review-minimal-rules-draft"
```

**命中处理原则（Round 1）**：只把链接 **改为新路径**（例如 `docs/P6/archive/historical/...`），**不**改正文段落。

**补充扫（可选）**：`git grep -n "P6/AI-MATCHING"`、`git grep -n "SIMULATION-PLAN"` 防漏网别名。

---

## 6. 本轮明确不做什么

- **不**把 `truth/` / `acceptance/` / `specs/` 下已有文档做 `git mv`（留 **Round 2**）。  
- **不**改正文、**不**合并文档、**不**删除任何文件。  
- **不**要求一次修完所有仓库外链（仅 **grep 命中处** 做路径替换即可）。  
- **不**改 `apps/`、`packages/` 内业务代码。

---

## Round 1 建议执行顺序（小结）

1. `mkdir` → `archive/historical`、`archive/drafts`（可选 `truth` / `acceptance` / `specs`）。  
2. `git mv` → **historical**（2 个文件）。  
3. `git grep` → 检查 `AI-MATCHING` / `P6-ai-production-evolution`。  
4. `git mv` → **drafts**（3 个文件）。  
5. `git grep` → 检查三份 draft 旧路径。  
6. 新建 **`docs/P6/README.md`**（最小真源索引 + 归档区一句）。  
7. `git grep` → 全库旧路径收尾；**仅改链接**。  
8. `git status` / 提交（提交说明写清：P6 docs Round1 README + archive moves only）。

---

*本文路径：`docs/P6/P6-docs-reorganization-round1-execution-checklist.md`*
