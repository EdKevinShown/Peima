# P6 AI Simulation v1 Shortlist-Only E2E Run Record (v0)

## 元信息

- **日期**：2026-04-27  
- **环境**：以验收执行当日为准（本地 / 预发 / 生产择一注明即可）  
- **当前口径**：Phase C v1.0（10 场景冻结） / Phase D v6 / Phase F v0.5  

## 本次 run 标识

- **viewerUserId**：验收执行日自环境记录（可脱敏；细节见团队 run 台账）  
- **poolId**：同上  
- **simulationJobId**：同上  

## 手工执行顺序

1. `POST /admin/post-pool-deep-screen/run-orchestration-mvp`，请求体 **`runMode=mvp`**。  
2. 记录响应中的 **`acceptedCandidateCount`**。  
3. 记录 **`simulationQueueHint`** 中条目的 **`candidateUserId` 顺序**（仅顺序与人数，不整包贴 JSON）。  
4. `POST /admin/ai-simulation/v1/jobs/:simulationJobId/run`，直至 job **completed**。  
5. `GET /admin/ai-simulation/v1/jobs/:simulationJobId`（或等价只读查询），摘录 **§5** 字段。  
6. 打开 Final Match 深链（带 **`aiSimJobId`** 等既有参数）。  
7. 确认 **三层 sidecar** 与 **AI 模拟参考卡** 可见且与本次 job 一致。  

## 关键响应摘录

**Orchestrator（本次验收快照）**

- `acceptedCandidateCount` = **3**  
- `simulationQueueHint`（仅 **candidateUserId** 顺序）：三人 shortlist，顺序与最终 binding / hint 一致（具体 id 见执行台账，本文不写入真实 user id）。  

**GET job（completed 后）**

- `shortlistBindingPresent` = **true**  
- `sidecarTrioPresent` = **true**  
- `rankConsistent` = **true**  
- `specClassification` = **current_shortlist_contract**  
- `diagnosticBucket` = **current_ok**  
- `buildabilityDetail` = **none**  

**Final Match**

- `shortlistScenariosV0`：**可读**（schema 与 Phase C v1.0 冻结一致）  
- `shortlistFourDimV0`：**可读**  
- `shortlistDecisionV0`：**可读**  
- **AI 模拟参考卡**：**可见**，且与本次 `simulationJobId` 对应  

## 与 legacy 最小对照

| 类型 | shortlistBindingPresent | specClassification | buildabilityDetail | 是否作为成功样本 |
|------|-------------------------|--------------------|--------------------|------------------|
| legacy 旧 job | false | legacy_pre_shortlist_contract | binding_missing（典型） | 否 |
| 本次新 job | true | current_shortlist_contract | none | 是 |

## 最小验收 checklist

- [ ] 仅通过 **`run-orchestration-mvp`**、**`runMode=mvp`** 建出新 job  
- [ ] **`acceptedCandidateCount`** 为 **2～3**  
- [ ] **`simulationQueueHint`** 与 shortlist **同序、同长度**  
- [ ] **`shortlistBindingPresent === true`**  
- [ ] **`sidecarTrioPresent === true`**  
- [ ] **`rankConsistent === true`**  
- [ ] Final Match **成功消费**三层 sidecar（scenarios / fourDim / decision）  
- [ ] **AI 模拟参考卡**成功显示  

## Out of scope

- 不改 worker 主公式  
- 不改 `MatchResult.finalScore`  
- 不新增 API  
- 不扩场景  
- 不重写 truth 总表  
