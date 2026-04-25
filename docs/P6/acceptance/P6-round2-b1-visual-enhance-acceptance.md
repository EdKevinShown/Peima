# P6 Round 2 — B1：Preview Pool 视觉增强（stub / LLM）验收收口

## 本轮改了哪些文件

- `apps/api/src/modules/preview-pool/visual-signal-enhance-stub.ts`
- `apps/api/src/modules/preview-pool/preview-pool.service.ts`
- `apps/api/src/modules/preview-pool/preview-pool-layered-selection.ts`（类型与视觉排序所用字段对齐；未改分层选入算法主体）
- `.env.example`（B1 相关环境变量示例）

## provider 双路径怎么切

- 环境变量：`PEIMA_PREVIEW_VISUAL_ENHANCE_PROVIDER=stub|llm`
- `stub`：进程内确定性 stub，无外呼
- `llm`：OpenAI 兼容 `chat/completions` 单路径；若 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 任一缺失，实现侧回落为 stub
- 仍受 `PEIMA_PREVIEW_VISUAL_ENHANCE_ENABLED` 控制是否执行增强（与既有 v0 开关一致）

## 统一输出结构是什么

写入 `GatedCandidateForLayering.visualEnhance`（可选）：

- `visualTags: string[]`
- `visualConfidence: number`（0..1）
- `visualSignalScore: number`（0..1）
- `visualReason: string`

视觉排序融合使用 `visualSignalScore * visualConfidence`（无 `visualEnhance` 时回退纯 tag 分数）。

## 缓存 key / TTL 怎么定

- **Key**：`{client.cacheKey()}|mode={url|base64}|{firstImageUrl 或 firstImageId}`  
  - `cacheKey()` 区分 stub / llm 及 baseUrl、model，`mode` 用于区分 URL 与本地 Base64 输入路径
- **TTL**：`PEIMA_PREVIEW_VISUAL_ENHANCE_CACHE_TTL_MS`，缺省 24h（86400000ms）；进程内 `Map`，仅当前 API 进程有效

## timeout / fallback 怎么做

- **Timeout**：`PEIMA_PREVIEW_VISUAL_ENHANCE_LLM_TIMEOUT_MS`，缺省回退 `PEIMA_PREVIEW_VISUAL_ENHANCE_TIMEOUT_MS`（默认 800ms）；单次调用 `Promise.race` 截断
- **Fallback**：LLM 超时、HTTP 非成功、内容非法、解析失败 → 不抛整链；对非 stub 主 client 再试一次 stub；仍失败则该候选不写 `visualEnhance`，preview pool 主流程继续

## 最小手工验收建议

1. `PEIMA_PREVIEW_VISUAL_ENHANCE_ENABLED=1`、`PROVIDER=stub`：触发 preview pool；有首图且 `firstImageId` 有效的候选可带上 `visualEnhance`（四字段）；整体请求不崩
2. `PROVIDER=llm` 且配齐 baseUrl / key / model：再次触发；应尝试外呼；失败时应整体仍成功，并可见 stub 回退或空信号回退
3. 将 `LLM_TIMEOUT_MS` 设为极小或 baseUrl 配错：确认不阻断主链、不 500 整请求（以现有 API 行为为准）
4. 同一批数据连续两次请求：第二次应更快或更少外呼（进程内缓存命中）

## 本轮问题根因与最小修复

- **根因**：候选首图很多是 `http://127.0.0.1/...`（loopback）URL，外部视觉模型服务端不可访问，导致主路径持续 `http_error 400`。
- **最小修复**：仅在智谱视觉分支，把 `localhost / 127.0.0.1 / 0.0.0.0` URL 视为本地来源，映射回本地文件路径后走 Base64 输入；其余供应商与 URL 路径保持不变。
- **边界保持**：未修改 preview-pool 分层算法、worker、`MatchResult.finalScore`、orchestrator A 线与前端消费。

## 本轮验收结果

- 主路径稳定成功：`llmPrimaryOk=6`
- 回退为零：`fallbacks=0`
- 替换测试图（7/8/9）后，`llm_visual_result` 的标签出现明显变化（示例：`city_street`、`posed` 等），说明新图已进入视觉增强链路。

## 剩余小问题（不影响本轮收口）

- `visualReason` 与分值仍有轻微模板化（部分 case 接近固定短语与区间值）。
- 当前问题不影响 B1 收口结论；后续可在不改主链的前提下继续做提示词微调。

## 本轮明确未做什么

- 不改 worker 主公式
- 不写 `MatchResult.finalScore`
- 不做多图融合
- 不做 C 端产品化（未改 web 消费与展示契约）
