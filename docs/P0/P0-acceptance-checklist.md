# P0 Acceptance Checklist

> 目标：验收“配吗（peima）”P0 最小闭环是否可用（不进入 P1）。

## 1) 你理解到的当前现状（简述）

- 已实现最小鉴权：`/auth/register`、`/auth/login`、`/auth/me`（JWT）。
- 核心交互接口已要求 `Authorization: Bearer <token>`，并校验 token 用户与请求中的 `userId/senderUserId` 一致：
  - `/matching/*`
  - `/preview-pool/*`
  - `/questionnaire/submit`
  - `/chat/*`
- 前端登录成功后把 `peimaToken` 写入 `localStorage`，并在核心请求里自动带上 Authorization 头；401 会给出明确提示。
- `/questionnaire/questions` 保持公开。
- 其余业务（worker cron、匹配规则精筛、最终解释等）仍按 P0 的最小版本验收，不做 P1 扩展。

---

## 当前验收结论

- P0 主流程：**已跑通 / 可视为完成**（不进入 P1）。
- 已通过验收的模块（按你这次 P0 范围）：
  - [x] Auth（`/auth/register`、`/auth/login`、`/auth/me`，JWT 已接入核心交互）
  - [x] Questionnaire（题库可获取、提交可落库并允许进入匹配队列）
  - [x] Preview Pool（`generate` 可落库并在前端展示 6 个 item）
  - [x] Matching（enqueue 后 worker batch-match 产出 `MatchResult`，status 变为 ready）
  - [x] Chat（最终结果后可进入会话并发送消息）
  - [x] Deployment（docker-compose 跑通：postgres/api/web/worker，worker cron 可触发 batch-match）

说明：
- 下方 checklist 仍保留用于复验子项（例如 token 一致性、排序与分层、401/404/400 行为等）。

## 2) Auth（鉴权）模块验收项

- [ ] `POST /auth/register` 可创建用户  
  - 要验证什么：同一 `phone` 不能重复注册；能成功创建并返回 `token` 与用户基础信息。  
  - 如何验证：用 `curl` 调用 `/auth/register`；分别用同一 phone 注册两次。  
  - 预期结果是什么：第一次 `200/201` 返回 `{ token, user }`；第二次返回 `409 Conflict`（phone already exists）。

- [ ] `POST /auth/login` 可为已存在用户签发 JWT  
  - 要验证什么：输入 `phone`，若用户存在能返回 `token`；若不存在返回 404。  
  - 如何验证：对已注册 phone 登录；对未注册 phone 登录。  
  - 预期结果是什么：存在返回 `{ token, user }`；不存在返回 `404 Not Found`（user not found）。

- [ ] `GET /auth/me` 在携带 token 时返回当前用户信息  
  - 要验证什么：token 有效时返回用户基础信息；token 缺失/无效返回 401。  
  - 如何验证：  
    - 不带 header 调 `/auth/me`  
    - 带 `Authorization: Bearer <token>` 调 `/auth/me`  
  - 预期结果是什么：未带 token => `401`；带 token => `200` 且返回当前用户字段（id/phone/nickname 等）。

- [ ] 前端能保存 token 并跳转到匹配等待页  
  - 要验证什么：登录后 `localStorage.peimaToken` 与 `localStorage.peimaUserId` 写入成功，并跳转 `/matching-waiting`。  
  - 如何验证：打开 `/login`，注册/登录；在浏览器 DevTools -> Application -> Local Storage 检查 key。  
  - 预期结果是什么：token/userId 写入且页面跳转成功。

---

## 3) Preview Pool（预览池）模块验收项

- [ ] `POST /preview-pool/generate` 受 JWT 保护且校验 `userId` 一致  
  - 要验证什么：必须带 token；请求 body 里的 `userId` 与 token sub 一致，否则 401。  
  - 如何验证：  
    - 不带 token 调用 generate  
    - 带 token，但 body `userId` 换成另一个  
  - 预期结果是什么：无 token => 401；userId 不一致 => 401（userId mismatch）；一致 => 成功创建。

- [ ] 生成时候选人不足会失败（P0 策略）  
  - 要验证什么：只有“有 images 的用户”才能被选入候选集合；不足 6 直接失败。  
  - 如何验证：准备用户，但确保候选用户 images 数量不足 6 个用户。  
  - 预期结果是什么：`400 BadRequest`，message 包含 `not enough candidates`。

- [ ] `GET /preview-pool/user/:userId/latest` 返回 6 个 item，并按 rank 升序  
  - 要验证什么：返回的 items 长度为 6 且 `rankInPool` 为 1..6 升序；受 JWT 保护且 userId 一致性校验。  
  - 如何验证：调用 latest 接口并检查 payload。  
  - 预期结果是什么：`200` 返回 `previewPool + items`；items 数组按 `rankInPool asc` 排序。

- [ ] `displayMode` 与 `candidateType` 落库符合 **P6 第二步分层**（已替代旧「前两槽 preference / 三四槽 visual」规则）  
  - 要验证什么：**rank 1–2** => **`visual` / `full`**（视觉位；**借位补足**时该槽可为 **`blurred`**）；**rank 3–4** => **`preference` / `full`**（兼容位，按 `preferenceScore` 排序）；**rank 5–6** => **`backup` / `locked`**。  
  - 如何验证：调用 `GET /preview-pool/user/:userId/latest`（或生成接口返回）检查每个 item 的 `rankInPool`、`candidateType`、`displayMode`。  
  - 预期结果是什么：与 **`docs/P6/truth/P6-preview-pool-layered-selection-v0.md`** 写库表一致；**勿**再按旧 P0 文档验收 rank1–2=`preference`。

---

## 4) Questionnaire（问卷）模块验收项

- [ ] `GET /questionnaire/questions` 公共可用（不要求 token）  
  - 要验证什么：可返回固定题库；返回结构含 `version` 与 `questions`（共 12 题）。  
  - 如何验证：不带 Authorization 调用 `/questionnaire/questions`。  
  - 预期结果是什么：`200` 返回题库，题目数量为 12。

- [ ] `POST /questionnaire/submit` 受 JWT 保护且校验 `userId` 一致  
  - 要验证什么：必须带 token；body `userId` 与 token sub 不一致 => 401。  
  - 如何验证：  
    - 不带 token 调 submit  
    - 带 token 但 body userId 改成另一个  
  - 预期结果是什么：无 token => 401；不一致 => 401（userId mismatch）；一致 => 成功保存。

- [ ] 重复提交策略：覆盖旧答案并更新画像  
  - 要验证什么：重复提交不会产生“多个历史快照”，而是用最新提交覆盖。  
  - 如何验证：同一个 userId 提交两次（12 题答案不同），随后查询画像或触发后续流程确认画像变化。  
  - 预期结果是什么：后续读取到的画像反映最新提交逻辑（P0 简化版）。

---

## 5) Matching（匹配）模块验收项

- [ ] `POST /matching/enqueue` 受 JWT 保护且校验 `userId` 一致  
  - 要验证什么：必须带 token；body `userId` 与 token sub 不一致 => 401；若未完成问卷/画像应失败（由 matching/service 决定）。  
  - 如何验证：准备未提交问卷的用户调用 enqueue，再对已完成问卷的用户调用。  
  - 预期结果是什么：未完成 => 失败（通常为 400/404，按现有逻辑）；完成 => 成功返回队列记录。

- [ ] `GET /matching/status/:userId` 返回状态并受 JWT 保护  
  - 要验证什么：状态取值 `not_queued/waiting/processing/ready`；未带 token => 401；userId mismatch => 401。  
  - 如何验证：  
    - 不带 token 调 status  
    - 带 token 但 userId 改成另一个  
    - 带 token 正确调用 status  
  - 预期结果是什么：符合上述 401 行为；正确 token => 返回当前队列状态。

- [ ] 触发批处理后得到最终结果（P0 可跑通版）  
  - 要验证什么：worker 运行后为用户创建 `MatchResult`，并使 status 从 waiting/processing 变到 ready。  
  - 如何验证：  
    - 使用现有 worker 定时或手动触发（按你当前仓库实现方式）  
    - 之后调用 `/matching/result/:userId`  
  - 预期结果是什么：`GET /matching/result` 返回 `candidateUserId/finalScore/reasonSummary` 等字段；若用户没有 preview pool，标记失败（按 matching 逻辑为 failed）。

---

## 6) Chat（聊天入口）模块验收项

- [ ] `POST /chat/conversations` 受 JWT 保护且校验 `userId` 一致  
  - 要验证什么：必须携带 token；请求 body `userId` 与 token sub 不一致 => 401；若用户没有 matchResult => 404。  
  - 如何验证：对未完成匹配的用户调用 createConversation；对完成匹配的用户调用。  
  - 预期结果是什么：未完成 => 404；完成 => 返回 conversation。

- [ ] `GET /chat/conversations/:conversationId` 受 JWT 保护并校验会话归属  
  - 要验证什么：token 用户必须是 conversation 的参与者（viewer/candidate）。  
  - 如何验证：用另一个用户的 token 调用同一 conversationId。  
  - 预期结果是什么：非参与者 => 401；参与者 => 返回 conversation + messages（按 createdAt asc）。

- [ ] `POST /chat/messages` 受 JWT 保护并校验 senderUserId  
  - 要验证什么：senderUserId 必须属于 conversation 的双方之一；senderUserId 与 token sub 一致。  
  - 如何验证：  
    - 带 token，发送消息  
    - 改 senderUserId 为非参与者  
  - 预期结果是什么：正确 => 保存并返回 message；错误 => 400/401（按现有校验逻辑）。

---

## 7) Deployment（最小 Docker 部署）验收项（P0）

- [ ] `docker-compose` 能拉起 `postgres/api/worker/web`  
  - 要验证什么：容器启动成功、端口监听正常。  
  - 如何验证：  
    - `docker compose up -d --build api worker web postgres`  
    - `docker compose ps` / 查看 logs  
  - 预期结果是什么：所有服务处于 `running`。

- [ ] worker 自动注册 cron（或在当前实现中能按配置触发 batch）  
  - 要验证什么：worker 启动后日志包含 cron registered / batch started 等关键信息（按现有实现输出）。  
  - 如何验证：`docker compose logs -f worker` 观察关键字。  
  - 预期结果是什么：能看到 `worker started` 与 cron 注册/触发日志。

- [ ] Web 页面能访问受保护接口（带 token 后）  
  - 要验证什么：web 容器内能正常访问 api（VITE_API_BASE_URL 配置正确）；登录后带 token 能访问 preview/matching/questionnaire/chat。  
  - 如何验证：  
    - 浏览器访问 `http://<host>:WEB_PORT`  
    - 登录 -> 访问 `/matching-waiting` / `/preview-pool` / `/questionnaire`  
  - 预期结果是什么：无网络层错误；未带 token => 401，带 token => 正常。

---

## 建议验收顺序

1. `Auth`：注册/登录 -> `/auth/me` 可用 -> 前端 token 写入成功  
2. `Questionnaire`：提交问卷（确保 `/questionnaire/submit` 返回成功；且题目已答满 12 题）  
3. `Preview Pool`：为当前 user 生成 preview pool（候选不足要先用图片数据补齐）并在 `/preview-pool` 页面可读取 6 个 item  
4. `Matching`：enqueue -> 触发 worker 批处理 -> status 变为 ready -> `/final-match` 页面展示结果字段  
5. `Chat`：点击进入聊天 -> conversation 创建成功 -> 能发送并刷新消息列表  
6. `Deployment`：最后用 `docker-compose` 跑通同样的端到端链路（至少验证关键接口与页面可用）

---

## 常见失败点

- token 缺失：调用 `/matching/*`、`/preview-pool/*`、`/questionnaire/submit`、`/chat/*` 返回 401（前端应提示“先登录（/login）”）
- token 与请求 userId 不一致：同一接口返回 401（`userId mismatch` / `senderUserId mismatch`）
- preview pool 生成候选不足：`POST /preview-pool/generate` 返回 400 `not enough candidates`（通常是“候选用户 images 不足 6 个用户”）
- 问卷未答满 12 题：前端会禁用提交/或后端按 DTO 验证失败；需确保 payload 覆盖全部 12 题
- 没有 matchResult：聊天创建会返回 404（`No match result for user ...`）
- 会话归属错误：用非参与者 token 访问 conversation，会返回 401 `conversation not accessible by this user`
- worker 未触发：status 一直停留在 waiting/processing，说明 batch 没跑到或 cron 配置/触发方式不符合当前实现

---

## 如何使用这份验收文档

- 按“建议验收顺序”逐项勾选。
- 遇到失败时，优先回看“常见失败点”，再用下面定位方式快速确认：
  - 401：先确认 token 是否存在、是否匹配 userId
  - 400：通常是 P0 简化策略（候选不足/DTO 校验失败）
  - 404：通常是前置条件没满足（没有用户、没有 preview pool、没有 match result、没有 conversation）
- 验收完成后，你可以认为 P0 已具备“最小身份边界 + 端到端链路可跑通”的基本可用性（不进入 P1）。

---

## 当前验收总结

- P0 主流程验收已通过：用户端从登录到问卷、预览池、匹配、最终结果、聊天的端到端链路可用。
- 建议仍可继续做轻量回归与边界测试（例如 401 无 token、userId mismatch、preview pool 候选不足、无 matchResult、conversation 非参与者访问等），但不影响对 P0 完成度的判断。

