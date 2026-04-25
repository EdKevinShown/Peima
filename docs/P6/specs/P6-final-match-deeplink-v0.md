# Final Match 深链生成 / 复制 v0 — 最小体验改进（定义）

> **实现（Round 1）**：已在 **`FinalMatchPage`** 顶部增加可折叠 **「内部工具：生成 Final Match 深链」** 条（方案 B），见 `apps/web/src/pages/FinalMatchPage.jsx`。

> **目标**：内部人员在已有 **`simulationJobId`**（及对应 **`viewerUserId`**）时，**不必手工拼接**  
> **`/final-match?userId=...&aiSimJobId=...`**。  
> **性质**：仅 **定义**；**不**改 AI 模拟主链、**不**改 worker / `MatchResult` / preview pool；**不**新增「按用户自动发现 job」等后端能力。

**上游文档**：[`P6-ai-simulation-sidecar-v0-round1.md`](../acceptance/P6-ai-simulation-sidecar-v0-round1.md) **§7.3**（当前最别扭点与改进方向）。

---

## 1. 这个入口最适合放在哪里

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| **A. 纯静态内部页（Web 内新路由）** | 例如 `/internal/final-match-deeplink` 或挂在现有仅内部可访问区域；两个输入框 + 三个按钮。**不依赖** enqueue 响应体在浏览器里出现。 | **首选**：实现面最小，与 Admin API 解耦，任何人只要有 id 即可生成。 |
| **B. FinalMatchPage 顶部窄条** | 当 URL **未带** `aiSimJobId` 时，显示可折叠的「生成审核深链」迷你表单（同一域名、同一登录态）。 | **次选**：省一条路由，但 **FinalMatchPage** 已较重，需控制视觉权重。 |
| **C. Admin 仅文档 / runbook** | 只维护 Markdown 里的 URL 模板 + 示例。 | **零开发**；**不**消除抄错，仅算运维兜底。 |

**推荐 v0**：**A 或 B 二选一**；若希望 **与侧车同一心智**，优先 **B**（同一页内完成「没带参 → 补参」）；若希望 **完全不污染 Final Match 首屏**，用 **A**。

---

## 2. 最小需要哪些输入

| 字段 | 必填 | 说明 |
|------|------|------|
| **`viewerUserId`**（或表单标签 `userId`） | **是** | 必须与创建 AI 模拟 job 时的 **`viewerUserId`** 一致，且与最终 URL 中 **`userId`** 查询参数一致。 |
| **`simulationJobId`** | **是** | 来自 **`POST /admin/ai-simulation/v1/enqueue`** 响应的 **`simulationJobId`**（或从 GET job URL 中抄出的 job id）。 |

**不需要**（本轮明确排除）：`poolId`、`hintSnapshot`、候选列表、自动解析「最新 job」。

**Base URL**：使用与现有 Web 一致的 **origin**（如 `import.meta.env` 或 `window.location.origin`），或只生成 **路径 + query** 由用户自行贴到正确环境（二选一在实现 PR 里写死一种即可）。

---

## 3. 最小交互是什么

1. **生成链接**：根据输入拼出完整 URL：  
   `{origin}/final-match?userId={encodeURIComponent(viewerUserId)}&aiSimJobId={encodeURIComponent(simulationJobId)}`  
   在只读文本框或 `<output>` 中展示，便于目视核对。  
2. **复制链接**：一键 **`navigator.clipboard.writeText`**（失败则提示用户手动全选复制）；按钮文案如「复制链接」。  
3. **直接打开**：`window.open(url, "_blank", "noopener,noreferrer")` 或当前页 `location.href = url`（实现 PR 二选一；**推荐新标签页**以免覆盖未保存输入）。

**可选 v0.1（非必须）**：校验 `userId` / `aiSimJobId` 非空、trim、无非法字符；**不**调用后端校验 job 是否存在。

---

## 4. 本轮明确不做什么

- **不**自动发现 job（不按 viewer、不按 pool、不按时间查「最新 simulationJobId」）。  
- **不**新增 Admin 或业务 API（**不**为深链单独加 `GET`/`POST`）。  
- **不**改 **`POST /admin/ai-simulation/v1/enqueue`** 响应形状（除非将来顺带返回 `deeplink` 字段，**非 v0 必做**）。  
- **不**改主匹配链、worker、`MatchResult`、preview pool；**不**把深链写入业务库。  
- **不**做权限模型扩展（页面仍可按现有 **仅内网 / 或依赖前端路由不暴露给 C 端** 策略处理；细节由实现 PR 与部署约定）。

---

## 5. 最小手工验证建议

1. 取一对真实 **`viewerUserId` + `simulationJobId`**（来自已跑通的 job）。  
2. 在入口输入后点 **生成**，肉眼确认 query 与 [`P6-ai-simulation-sidecar-v0-round1.md`](../acceptance/P6-ai-simulation-sidecar-v0-round1.md) **§2** 约定一致。  
3. **复制** 到剪贴板，粘贴到地址栏打开，确认侧车 **成功态** 与直接手工拼接 URL **行为一致**。  
4. **直接打开**：确认新标签页（若采用）中 **`getMatchingResult`** 的 **`candidateUserId`** 仍落在该 job 的 **`results`** 内（否则侧车会提示「不在该模拟 job 中」——属数据对齐问题，非深链生成器 bug）。  
5. 故意留空一项：按钮 **禁用** 或提示，**不**产生非法 URL。

---

*本文路径：`docs/P6/specs/P6-final-match-deeplink-v0.md`*
