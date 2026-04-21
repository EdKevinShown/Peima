# 进入 AI 模拟匹配前 — 边界说明草案

> **依据**：2026-04-21 本轮 **P6.8 / P6.10 最小系统回归（M0–M5）已验证通过的事实**（见同日落盘的 run record）。  
> **范围**：本文只做**边界收口**与**下一阶段入口条件**说明；**不**写实现代码，**不**展开「AI 模拟匹配」的详细技术方案或算法设计。

---

## 1. 这轮回归已经证明了什么

### 1.1 环境与联调基线

- **数据库迁移**：`prisma migrate deploy` 执行成功；`8 migrations found`；`No pending migrations to apply.`  
- **服务与端口**：API 可启动并监听 **`http://0.0.0.0:3001`**；Web（Vite）可访问 **`http://localhost:5173/`**。  
- **前后端指向**：`VITE_API_BASE_URL=http://localhost:3001`，与 API 实际端口一致，避免误指 Vite 端口。  
- **已知非失败附注**：API 启动时出现 **RBAC 种子跳过**（`public.role_permissions` 不存在）；本轮**仅记录**，**不作为** M0–M5 失败依据。

### 1.2 Final match 主链（规则/占位口径下）

在同一 **viewer `userId`** 上，以下顺序在本机可跑通且结果自洽：

- `POST /preview-pool/generate` → **200**，`previewPool.status=active`，`items.length=6`。  
- `POST /matching/enqueue` → **200**，`queue.status=waiting`（含 `queueId`）。  
- **`pnpm --filter @peima/worker run batch-match`** → `totalQueues=1`，`successCount=1`，`failedCount=0`，`queue_done outcome=ok`（含 `candidateUserId`）。  
- `GET /matching/result/:userId` → **200**，`status=ready`（含 `candidateUserId`、`batchId`、`finalScore`）。  
- **Final Match 页面**可读，与 API **一致/不矛盾**。

> 上述事实说明：在**本轮数据与环境**下，**「预览池 → 入队 → worker 一轮 batch → 拉结果 → 页面展示」**闭环成立；**不**自动等价于「AI 模拟匹配」已在其它数据分布或评分变更下被验证。

### 1.3 会话 URL 与顶栏导航

- **`/chat`、`/copilot`、`/chat/timeline`**：在仅有 **`userId`** 的前提下，可自动补全 **`conversationId`**（与本轮观察一致）。  
- **顶栏多跳**：顺序 **聊天 → 沟通洞察 → 关系时间线查看 → 聊天** 下，每一跳落地后 URL **同时保留** `conversationId` 与 `userId`。

### 1.4 P6.8 / P6.10（本清单范围内）

- **生成**：Chat 内点击「根据本轮对话生成画像建议」后，出现**待处理建议卡片**。  
- **`GET /profile-suggestions/mine`**：**200**；存在 `pending`（本轮材料含 `id`、`sourceType=hybrid`、`sourceVersion=p6.8-profile-completion-chat-ai-v1`、`sourceConversationId` 与当前会话一致）。  
- **`accept`**：该条 suggestion 可变为 **`accepted`**。  
- **P6.10**：`pending` 存在时，「根据本轮对话生成画像建议」**不可重复点击**；单行说明为 **「已有待处理建议，请先审阅」**；`accept` 后生成按钮**恢复可点**，阻断说明消失。  
- **`dismiss`**：**本轮未单独执行**；按清单范围记为跳过，**不记失败**。

### 1.5 Worker 复验（清单允许跳过语义）

- 再次执行 **`pnpm --filter @peima/worker run batch-match`**：**正常结束**；日志 **`totalQueues=0`** 且 `successCount=0`、`failedCount=0`、`outcome=ok`；**无 `waiting` 队列** → 本轮记 **「跳过（无 waiting 队列）」**，**不记失败**。

---

## 2. 进入 AI 模拟匹配前还必须固定哪些「主链边界」

> 这里的「主链边界」指：**下一阶段改动时最容易把问题误判到 AI、但实际上来自环境与契约** 的固定项。下列条目均能从本轮事实**直接推出「仍须团队显式对齐」**，但不展开 AI 方案本身。

| 边界项 | 本轮已验证的事实锚点 | 进入 AI 模拟匹配前建议固定成什么 |
|--------|----------------------|----------------------------------|
| **API 端口与前端基址** | 本轮 API 为 **`:3001`**；`VITE_API_BASE_URL` 必须指向 API | 团队默认联调表里写清：**默认端口 / 环境变量**与「误指 Vite 端口」的排障检查项 |
| **batch-match 触发路径** | 本轮主路径固定为 **worker：`pnpm --filter @peima/worker run batch-match`** | 若下一阶段引入/混用 **admin/test** 触发，应单独声明：**权限 allowlist、与 worker 等价性、以及回归对照命令** |
| **队列空闲语义** | 本轮证明：**无 `waiting` 时**可出现 **`totalQueues=0` 且仍 `outcome=ok`**，并按清单 **跳过非失败** | 下一阶段日志判读规则要先对齐：**空队列** vs **worker 异常** 的区分标准 |
| **迁移与 RBAC 附注** | 本轮迁移无 pending；但存在 **RBAC 表缺失导致 seed 跳过** 的启动告警 | 若 AI 模拟匹配阶段会触碰 **权限/运营种子/管理面**，需先决定：是 **补迁移/补表** 还是 **接受告警并文档化**，避免环境噪声干扰主链验收 |
| **P6.8 覆盖边界** | 本轮 **未执行 `dismiss`** | 下一阶段若改动建议状态机/并发策略，应声明：**dismiss 是否纳入最小回归**，避免默认「已覆盖」 |
| **本轮对象 ≠ 下一阶段对象** | 本轮验证的是 **规则/占位口径 Final match 主链 + URL 自愈 + P6.8/P6.10** | 「AI 模拟匹配」应自带 **独立的输入/输出契约与最小对照步骤**；不得默认本轮结论自动外推 |
| **正式结果写入口 / 数据语义** | 本轮 Final match 与 `matching/result`、以及 P6.8 的 **`sourceType` / `sourceVersion`** 等，均代表**已存在的「正式读路径」与可追溯语义** | 进入 AI 模拟匹配前必须先行约定：**AI 产出究竟写入既有「正式结果」字段、写入旁路「影子结果」、还是仅做对照输出（不落正式库）**，并在验收口径上写清边界，**避免模拟结果与正式结果在数据层或产品语义上混淆** |

---

## 3. 为什么现在不能跳过这些边界直接进入实现

1. **避免把「环境契约」误判为「模型/打分问题」**  
   端口、`VITE_API_BASE_URL`、DB 迁移与 RBAC 告警若不先写清，下一阶段最常见的成本是：联调失败时无法快速判断属于 **配置/迁移** 还是 **AI 逻辑**。

2. **避免把「无队列可处理」误判为「batch 失败」**  
   本轮已用事实说明：**`totalQueues=0` 可与正常结束并存**。若边界不写清，下一阶段容易在排障时走偏方向。

3. **避免「范围错觉」导致回归空洞**  
   本轮 **未覆盖 `dismiss`**，且 **AI 模拟匹配未纳入本轮最小系统回归范围**。跳过边界说明直接进入实现，通常会把 **未声明的前提** 写进代码，最终在合并/验收阶段才发现：**最小回归无法证明新改动仍尊重已收口的 P6.8/P6.10/Final match 主链**。

4. **避免把「模拟结果」在产品语义上误当成「正式匹配结果」**  
   若不先固定 **页面/API 读取口径**（例如 Final match 与 `matching/result` 以何为「真」），以及 **`sourceType` / `sourceVersion` 的区分与展示/聚合规则**，验收阶段容易出现：**用户或运营把模拟输出当作已生效匹配结论**、或 **建议/匹配两条线交叉误读**；这与本轮已验证的「规则主链 + P6.8 可追溯字段」并不矛盾，但**必须在进入实现前用文档钉死语义**，否则风险集中在产品解释与验收争议，而非单纯代码 bug。

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-04-21 | 草案：仅基于当日最小系统回归 run record 中已验证事实整理；下一阶段若补充新证据，应更新本草案对应条目。 |
