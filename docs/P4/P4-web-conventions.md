# P4：Web 端跨模块约定（Chat / Copilot / 反馈 / 画像建议）

> 与 `P4-productization-plan.md` 配套，描述 **当前实现** 中的统一约定，便于后续 PR 对齐。

## 1. API 基址与鉴权

| 项 | 约定 |
|----|------|
| **基址** | 使用 `getApiBaseUrl()` / `baseUrl`（`apps/web/src/api/auth.ts`），来自 `import.meta.env.VITE_API_BASE_URL`，勿写死端口。 |
| **勿指到 Vite 端口** | `localhost:5173` / `5174` / `4173` 会被 `getApiBaseUrl` 拒绝并回退默认，避免 `Cannot GET`。 |
| **鉴权头** | 需 JWT 的请求统一 `...authHeaders()`，与 `localStorage` 中 `peimaToken` 一致。 |
| **JSON 响应** | 统一经 `handleJson(res)`：401 / 403 有固定中文说明；其它错误尽量解析 Nest `message` 字段。 |

## 2. 用户 id

| 项 | 约定 |
|----|------|
| **解析** | 使用 `resolveUserId(searchParams)`（`apps/web/src/utils/resolveUserId.js`），与路由 query 一致。 |
| **发消息 / 反馈** | `senderUserId` / `userId` 必须与 token 用户一致（由后端校验）。 |

## 3. `sourceType` / `sourceVersion` 展示

- **摘要**：`ChatSummaryCard` 在元信息区展示 `sourceType`（若有）；`sourceVersion` 可按需扩展，保持与 Copilot 行内展示风格一致。
- **Copilot**：`CopilotInsightCard` 展示 `sourceType` / `sourceVersion`。
- **画像建议**：列表项展示 `sourceType · sourceVersion`（`ProfileSuggestionCard`）。
- **快捷反馈**：`FeedbackQuickActions` 内写常量 `SOURCE_TYPE` / `SOURCE_VERSION`，与后端占位口径一致；修改时需同步后端验收。

## 4. 文案口径（规则层 / 不通知对方）

以下模块须在用户可见处保持 **不承诺向对方推送、不代发消息**：

- 聊天页「会话周边」区块说明；
- `ChatSummaryCard` 底部说明；
- `CopilotInsightCard` 底部说明；
- `FeedbackQuickActions` 成功提示；
- `CopilotPage` 空态与页首说明；
- `ProfileSuggestionCard` 引导文案。

## 5. 无障碍（P4 小步）

- 主要错误使用 `role="alert"`，成功/状态使用 `role="status"`（与现有页面一致处沿用）。

## 6. 相关入口文件

- 页面：`ChatPage.jsx`、`CopilotPage.jsx`
- 组件：`ChatSummaryCard.jsx`、`CopilotInsightCard.jsx`、`FeedbackQuickActions.jsx`、`ProfileSuggestionCard.jsx`
- API：`auth.ts`、`chat.ts`、`copilot.ts`、`feedback.ts`、`profile.ts`
