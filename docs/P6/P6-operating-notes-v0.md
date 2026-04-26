# P6 Operating Notes (v0)

> **仅描述当前已存在能力下的推荐操作顺序。** 需要规则与字段语义时打开 `truth/` 对应篇；需要证据与数值快照时打开 `acceptance/` 跑通记录。本文不写路线图。

**前置（常见）**：API 已启动；操作者账号在 **`PEIMA_ADMIN_USER_IDS`** 中；已登录并可调 Admin 接口（JWT）；**`AI_SIMULATION_V1_ENABLED=1`** 等环境变量按部署说明已配置。

## 最短成功链（合规新 job → Final Match）

按顺序执行：

1. **Run orchestration MVP**  
   `POST /admin/post-pool-deep-screen/run-orchestration-mvp`  
   Body 示例：`{ "viewerUserId": "<viewer>", "poolId": "<pool>", "runMode": "mvp" }`  
   （可选 `candidateUserIdsOverride` 以本地测试约定为准。）

2. **取 `simulationJobId`**  
   从响应 **`stages.aiSimulation.simulationJobId`**（或 envelope 中等价字段）读取；仅当编排侧已入队成功时才有值。

3. **Run job**  
   `POST /admin/ai-simulation/v1/jobs/<simulationJobId>/run`  
   等待处理结束（直至 job 状态为 **`completed`**，以实际轮询或前端「跑 job」按钮为准）。

4. **GET job 检查门闩字段**  
   `GET /admin/ai-simulation/v1/jobs/<simulationJobId>`  
   在响应 **`jobAuditV0`**（若存在）中确认至少：  
   - `shortlistBindingPresent === true`  
   - `sidecarTrioPresent === true`  
   - `rankConsistent === true`  
   （与 Phase E 用户卡门闩一致时，通常同时满足 `specClassification === current_shortlist_contract` 等；细节以当前 API 返回为准。）

5. **打开 Final Match 深链**  
   浏览器打开：`/final-match?userId=<viewer>&aiSimJobId=<simulationJobId>`  
   （`userId` 须与本轮匹配的 viewer 一致；对方须在 job 的 `results` 队列中，否则内部侧车会提示未命中。）

6. **确认消费结果**  
   - **三层侧车**：在 Final Match 页折叠「内部」区可读到 `shortlistScenariosV0` / `shortlistFourDimV0` / `shortlistDecisionV0` 相关只读展示（验收用）。  
   - **用户可见 AI 辅助解释卡**：在门闩全部满足时，主内容区出现 **「互动参考（短名单对话模拟）」** 卡片（弱结论文案）；不满足则 **不出现整张卡**。

## 刻意不覆盖（避免与别文重复）

- **不**逐步复述 truth 中的公式与 JSON schema。  
- **不**全文粘贴 acceptance 跑通记录。  
- **不**再写已废弃的 `POST /admin/ai-simulation/v1/enqueue` 请求体示例（该路径已 410）。

## 相关链接

- **当前状态一页纸**：[P6-current-status-v0.md](./P6-current-status-v0.md)  
- **P6 索引**：[README.md](./README.md)  
- **编排定义**：[`specs/P6-round2-orchestration-mvp.md`](./specs/P6-round2-orchestration-mvp.md)
