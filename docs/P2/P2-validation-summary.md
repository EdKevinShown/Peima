# P2 验证摘要（P2-MVP）

按模块列出 **验证方式**、**当前结论**、**已知限制**。适用于研发自检与回归清单，非对外宣传材料。

---

## 1. Chat summary

| 项 | 内容 |
|----|------|
| **验证方式** | JWT 用户为会话参与者：`GET /chat/conversations/:id/summary`；无持久化行时应仍能返回与 P1 一致的规则摘要。可选：`POST .../summary/generate` 后再 GET，应 `persisted: true`（或等价字段）。 |
| **当前结论** | 可读、可写快照；归属校验与 chat 一致。 |
| **已知限制** | 多版本快照仅按 `createdAt` 取最新；未做 UI「生成」按钮；未接 Worker 自动重算。 |

---

## 2. Feedback

| 项 | 内容 |
|----|------|
| **验证方式** | `POST /feedback` body `userId` 与 token 一致；`GET /feedback/mine` 仅本人。 |
| **当前结论** | 写入与列表可用。 |
| **已知限制** | 无分页 cursor；`subject` 不做存在性 join 校验。 |

---

## 3. Profile suggestion

| 项 | 内容 |
|----|------|
| **验证方式** | 创建 pending → `accept` 后 `user_profile` 对应字段更新、`dismiss` 不改画像；非 pending 时 accept/dismiss 应 400。 |
| **当前结论** | 状态机与 upsert 路径与「非 accept 不改画像」一致。 |
| **已知限制** | `proposedPatch` 仅白名单 float 维度合并，未知键忽略；无画像历史表。 |

---

## 4. Behavior signal

| 项 | 内容 |
|----|------|
| **验证方式** | `POST /behavior-signals` 追加；`GET /behavior-signals/mine` 倒序列表；无 update/delete API。 |
| **当前结论** | append-only 语义成立。 |
| **已知限制** | `conversationId` 非法时依赖 DB 外键错误；上限条数固定。 |

---

## 5. Analytics

| 项 | 内容 |
|----|------|
| **验证方式** | `GET /analytics/p2-overview` 与 `.../mine` 返回计数 JSON；需 JWT。 |
| **当前结论** | 只读聚合可用。 |
| **已知限制** | 全局 overview **无角色区分**，不适合直接对公网多租户开放。 |

---

## 6. Copilot

| 项 | 内容 |
|----|------|
| **验证方式** | 参与者 `GET /copilot/conversations/:id/insights`；非参与者 401/404 与 chat 一致；响应含 `relationshipState`、建议列表等。 |
| **当前结论** | 只读、规则化、不落库。 |
| **已知限制** | 依赖摘要文案关键词与简单计数，**非**语义理解；与 `getSummary` 并存时存在重复拉会话的额外查询成本。 |

---

## 7. ChatPage 接入

| 项 | 内容 |
|----|------|
| **验证方式** | 登录后带 `conversationId`/`userId` 进入 `/chat`：摘要/Copilot/建议条条件展示；👍😐👎 提交后提示；断 API 或清 token 时主聊天区仍可尽量独立（主错误仍由会话加载决定）。 |
| **当前结论** | 增强层失败降级，不阻塞发消息。 |
| **已知限制** | 建议仅提示条数，无 accept/dismiss；未调用 `POST .../summary/generate`。 |

---

## 8. Shared 契约与 DB

| 项 | 内容 |
|----|------|
| **验证方式** | `pnpm --filter @peima/shared build`（constants）；`pnpm --filter @peima/database build`（Prisma generate）；API `nest build`。 |
| **当前结论** | P2 类型与表与 API 对齐。 |
| **已知限制** | Windows 下偶发 `prisma generate` 文件锁（EPERM），需重试或关闭占用进程。 |
