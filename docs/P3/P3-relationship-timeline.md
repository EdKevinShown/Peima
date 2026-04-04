# P3：关系时间线（Relationship Timeline）— 整阶段收口文档

## 1. 标题与阶段定义

- **阶段名称**：**P3（关系时间线）** — 本仓库在本轮迭代中的 **唯一** P3 含义；指 **单会话、只读、前后端已联调通过** 的「关系时间线」产品切片。
- **明确边界**：**不等于** README 或口头习惯里可能出现的「所有中长期能力」统称；**不包含** 独立 Analytics 产品化、Worker 侧自动生成摘要/信号、建议中心后台、会话历史版本治理等 —— 那些属于 **后续产品方向**，见本文 §8 与 README「当前限制 / 后续方向」。
- **技术口径**：不接真实大模型生产链；**不新增** 时间线专用数据表；时间线 **读取** P0 消息与会话及 **P2 已落库** 的摘要/信号/反馈等。

---

## 2. 本阶段目标

1. 提供 **JWT 保护、仅参与者可读** 的只读时间线聚合 API，默认首屏行为与早期 P3-1 约定兼容。
2. 在用户端提供 **`/chat/timeline`** 页面，并从 **`/chat`**、**`/final-match`** 两处进入，与既有聊天会话 **一致**（同 `conversationId`）。
3. 对 **长会话** 提供 **消息维度的分页**（`messageSkip` / `messageLimit` + 前端「加载更多消息」），非消息类事件仍在首屏全量呈现。

---

## 3. 已完成范围（P3-1 / P3-2 / P3-3）

| 子项 | 状态 | 交付摘要 |
|------|------|----------|
| **P3-1** | **已完成** | **API**：`GET /chat/conversations/:conversationId/timeline`（JWT；仅参与者）。**Web**：路由 **`/chat/timeline`**（`RelationshipTimelinePage`），**ChatPage**「查看关系时间线（只读）」。首屏（`messageSkip=0` 或未传）返回混合时间线：`conversation_opened`、首屏消息窗口、本会话摘要快照、双方行为信号、**当前用户**对该会话的反馈；响应含 **`messagePagination`**。 |
| **P3-2** | **已完成** | **`/final-match`** 在「进入聊天」旁增加 **「查看关系时间线（只读）」**；与进聊天一样先 **`createConversation(userId)`**，保证 **同一 `conversationId`** 再跳转时间线 URL。 |
| **P3-3** | **已完成** | **Query**：可选 **`messageSkip`**、**`messageLimit`**（默认 `0` / `200`，**`messageLimit` 硬上限 200**）。**`messageSkip > 0`** 时仅返回 **`message_sent`** 切片 + **`messagePagination`**；时间线页 **「加载更多消息」** 与已有 items **按 `occurredAt` + `id` 合并、去重、排序**。非法 query → **400**。 |

**未纳入本阶段（刻意不做）**

- 时间线专用新表、服务端导出、管理端审计视图、多会话合并时间线、WebSocket 实时推送、全文检索、与 Analytics 大盘的联动产品化等。

---

## 4. 最终交付结果

- **API（Nest）**：时间线路由与实现（含独立 `chat-timeline.controller` 挂载、与既有 `chat` 前缀一致）；`chat.service` 中 `getRelationshipTimeline` 与 `chat-timeline.mapper`、DTO 对齐契约。
- **Web（Vite/React）**：`/chat/timeline` 页面；`api/chat.ts` 中 **`getConversationTimeline`** 与 **`auth.ts` 中 API 基址约定**（与 chat / copilot 同源）；路由与 **ChatPage / FinalMatchPage** 入口。
- **测试**：`apps/api/test/chat-timeline.e2e-spec.ts`（可选，需可用 `DATABASE_URL`）。
- **文档**：本文件为 P3 **整阶段收口**；README 中项目状态、限制与文档索引与本文件 **口径一致**。

---

## 5. 联调与验收结论

**结论**：本轮 **P3（关系时间线）已联调通过**：PowerShell / 浏览器在 **API 基址指向正确后端（默认 `http://localhost:3000`）** 的前提下，`GET .../timeline` 返回 **200 JSON**；`/chat/timeline` 首屏与「加载更多消息」行为符合 §3；**`/final-match`** 第二入口与聊天 **同会话**。

### 手动验收 Checklist（可复制执行）

**前置**

- [ ] `api` + `web` 可访问；已登录 JWT。
- [ ] 至少一个双方会话；长会话 **>200 条消息** 更佳（测 P3-3）。

**API — 首屏**

- [ ] 无 Token → 401（或与项目 chat 一致）。
- [ ] 合法参与者 + 合法 `conversationId` → 200；含 `conversationId`、`generatedAt`、`items`；含 **`messagePagination`**（`skip=0`、`limit` 与约定一致、`hasMore` 与消息条数一致）。
- [ ] 不存在会话 → 404；非参与者 → 401。
- [ ] `messageSkip=abc` → **400**。
- [ ] `messageSkip>0` → `items` **仅** `message_sent`；含 **`messagePagination`**。

**Web — ChatPage（P3-1）**

- [ ] 「查看关系时间线（只读）」→ `/chat/timeline?conversationId=…&userId=…`。
- [ ] 「返回聊天」→ `/chat` 且保留 query。

**Web — FinalMatchPage（P3-2）**

- [ ] 「查看关系时间线（只读）」与「进入聊天」并列；点时间线后 **`conversationId` 与进聊天一致**。

**Web — 分页（P3-3）**

- [ ] 消息 ≤200：无「加载更多」或 `hasMore` 为 false。
- [ ] 消息 >200：点击「加载更多」后列表增长，无重复 `id`，时间序正确。

**回归**

- [ ] `ChatPage`：发消息、摘要、Copilot、画像建议、反馈等仍正常。

**自动化（可选）**

- [ ] `pnpm --filter @peima/api test:e2e`：`chat-timeline.e2e-spec.ts`。

---

## 6. 本轮排查过程中的关键问题（备忘）

以下为 **联调期真实踩坑**，便于后续环境与发布自检；**不代表** P3 功能设计缺陷。

1. **前端 timeline 请求误打到 Vite dev server**  
   - **现象**：浏览器报错 **`Cannot GET /chat/conversations/.../timeline`**（由前端 dev server 返回），而 **curl/PowerShell 直连 `localhost:3000` 正常**。  
   - **原因**：`VITE_API_BASE_URL` 误指 **5173/5174** 等前端端口，或等价地导致 fetch **同源到前端**。  
   - **处理**：Web 侧对 API 基址做 **归一化**（开发常见 Vite 端口回退到 `http://localhost:3000`），时间线请求与 chat/copilot **同一套基址与鉴权头**。

2. **Docker / 本地 API 旧构建未带 timeline 路由**  
   - **现象**：同上类 **`Cannot GET`** 或 Nest 层 404，与 **源码已存在路由** 不一致。  
   - **原因**：容器或本地进程仍在跑 **旧 `dist`/旧镜像**。  
   - **处理**：**重新构建并重启** API（`docker compose up -d --build api` 或本地 `start:dev` 拉齐最新代码）。

3. **数据库缺少 P2 相关表或迁移未对齐**  
   - **现象**：时间线或 Copilot 在读 **`conversation_summaries` / `behavior_signals` / `user_feedbacks`** 等时出现 **500**。  
   - **原因**：空库未 **`migrate deploy`**，或与 **`db push`** 历史混用导致表不齐。  
   - **处理**：按仓库迁移说明对齐 DB；API 侧对 P2 读路径可做 **降级**（缺表时仍返回消息与会话骨架类数据），但 **根治依赖迁移**。

4. **本地与 Docker 多个 API 混跑、端口 3000 口径不稳定**  
   - **现象**：「终端里 curl 通、浏览器里仍错」或间歇 404/500。  
   - **原因**：**多个进程** 监听同一端口或浏览器实际指向 **另一实例**。  
   - **处理**：保证 **单一** 权威 API 实例；前端 **`VITE_API_BASE_URL`** 与验证用 URL **一致**。

---

## 7. 当前已知限制

- **消息窗口**：首屏为时间正序下 **前 `messageLimit` 条（默认 200）**；更晚消息依赖 **P3-3** 追加请求；非全量一次返回。
- **仅消息分页**：摘要 / 信号 / 反馈在 **首屏** 全量；**不按页切换** 非消息事件。
- **反馈范围**：仅 **当前用户** 在该会话上的反馈；不含对方反馈（隐私/产品边界）。
- **只读、非实时**：无 WebSocket；不写入时间线。
- **前端 `userId` query**：用于展示与回链；**鉴权以 JWT 为准**。
- **P3 不包含**：导出、运营后台、Analytics 联动产品化、多会话合并、建议中心独立站等（见 §1、§8）。

---

## 8. 下一步最自然的小步（轻量，非大规划）

以下 **不** 算作「本阶段 P3」的延期，而是 **自然后续** 可选切片：

- 文档与 **发布 checklist** 固化：新成员首次 Docker 拉起时 **必跑 migrate**、**必核对 `VITE_API_BASE_URL`**。
- 时间线 **e2e** 在 CI 中的可选门禁（需测试库策略）。
- 若产品需要：非消息类事件的 **分页或折叠**（独立需求，需另开阶段/PRD）。
- README 已列的 **后续产品方向**（真实模型链、Worker 策略、历史版本、建议中心等）与 P3 **解耦**，单独排期。

---

## 9. 提交说明 / 阶段说明用短稿（中 + 英）

**中文（可直接贴 commit / 阶段说明）**  
> **P3（关系时间线）整阶段已收口并联调通过**：只读聚合 API `GET .../timeline` 与 `/chat/timeline`；`/final-match` 第二入口与聊天同会话；长会话 `messageSkip`/`messageLimit` 与「加载更多消息」。本阶段 P3 仅指该切片，不含 Analytics/Worker/建议中心等中长期项。详见 `docs/P3/P3-relationship-timeline.md`。

**English (short, for commit / release note)**  
> **P3 (relationship timeline) closed and integration-tested**: read-only `GET .../timeline` + `/chat/timeline`; second entry from `/final-match` (same conversation as chat); long chats via `messageSkip`/`messageLimit` and “load more messages”. This P3 scope is this slice only—not analytics, worker automation, or suggestion-center roadmap. See `docs/P3/P3-relationship-timeline.md`.

---

## 附录 A：能力细节（与实现对齐）

### API（JWT）

- **路径**：`GET /chat/conversations/:conversationId/timeline`
- **鉴权**：仅 **会话参与者**；不存在会话 **404**；非参与者 / 未鉴权与既有 chat 一致。
- **首屏（`messageSkip=0` 或未传）**：混合 `items`（opened、首屏消息、本会话全部摘要快照、双方行为信号、当前用户会话反馈）；**`messagePagination`**（`skip=0`）；`take = limit+1` 判定 **`hasMore`**。
- **`messageSkip > 0`**：仅 **`message_sent`** + **`messagePagination`**；非法参数 **400**。
- **`meta.actorUserId`**：供前端「我 / 对方」标签（与 `userId` query 比对）。

### Web

- **路由**：`/chat/timeline`；推荐 **`?conversationId=&userId=`**。
- **入口**：ChatPage、FinalMatchPage「查看关系时间线（只读）」。
- **API 封装**：`getConversationTimeline`（`apps/web/src/api/chat.ts`），基址与 **`auth.ts`** 一致，**`Authorization: Bearer`** 与其它 chat 请求一致。

### 与 P2 / P2.5

时间线 **读取** P2 已落库数据；**不** 新增 Worker 或运营后台能力。

---

## 附录 B：相关代码入口

- **API**：`chat-timeline.controller.ts`、`chat.service.ts`（`getRelationshipTimeline`）、`chat-timeline.mapper.ts`、`dto/conversation-timeline.response.ts`（`chat.controller.ts` 仍承载其余 chat 路由）
- **Web**：`RelationshipTimelinePage.jsx`、`ChatPage.jsx`、`FinalMatchPage.jsx`、`api/chat.ts`、`api/auth.ts`（API 基址）、`router/index.jsx`
- **测试**：`apps/api/test/chat-timeline.e2e-spec.ts`

---

## 附录 C：Git 推送前收尾清单

- [ ] **构建**：根目录 `pnpm build` 或各包 build 无报错。
- [ ] **文档**：本文件与 `README.md` 中 P3 表述一致。
- [ ] **抽检**：Chat → 时间线；Final-match → 时间线；长会话「加载更多」至少一次。
- [ ] **e2e（可选）**：`pnpm --filter @peima/api test:e2e`。
- [ ] **提交范围**：文档收口时 diff 以 `README.md`、`docs/P3/*` 为主。
