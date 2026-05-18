# 外部 API 集成系统性修复

## 背景
上轮回审查发现外部 API 集成存在 20 项缺陷，按严重程度分层。本任务按优先级分批修复，确保生产环境稳定性和安全性。

## 修复批次

### Batch 1 — P0 架构/安全/可靠性（核心）

#### 1.1 统一 HTTP 客户端层
- **问题**：`fetchWithTimeout` 在 `geocode-service.ts` 和 `dual-map-service.ts` 中重复实现；xhs 4 个 provider 各自重复 fetch 模板；超时策略分散（4s/15s/30s）。
- **方案**：新建 `src/services/http-client.ts`，统一封装：
  - `fetchWithTimeout(url, options)` — 使用 `AbortController + setTimeout`（兼容旧 Node）
  - `fetchWithRetry(url, options)` — 指数退避重试（max 3 次，仅对 GET/幂等请求）
  - `createApiClient(baseConfig)` — 返回预配置 timeout、headers、proxy 的客户端
  - 统一的错误分类：`NetworkError`, `TimeoutError`, `ApiError`, `AuthError`
- **影响文件**：`geocode-service.ts`, `dual-map-service.ts`, `xhs-service.ts`, `weather-service.ts`, `multi-source-service.ts`, `attraction-service.ts`
- **兼容性**：`fetchWithTimeout` 保持原有 4s 默认超时；各服务通过选项覆盖

#### 1.2 AbortSignal.timeout 兼容性修复
- **问题**：`xhs-service.ts` 多处使用 `AbortSignal.timeout(15_000)`，Node < v18.17 / < v20.13 不支持。
- **方案**：全部替换为 `AbortController + setTimeout` 模式（由 http-client 统一提供）。

#### 1.3 API Key 安全加固
- **问题**：Amap/Google/OWM 的 key 直接拼接到 URL query param，可能泄露到日志。
- **方案**：
  - Amap：URL 中保留 key（该 API 设计如此），但统一客户端在日志中自动脱敏 URL
  - Google Places/Geocode：URL 中保留 key（该 API 设计如此），日志脱敏
  - JustOneAPI：token 从 URL query 迁移到 Header `Authorization: Bearer`
  - OWM：URL 中保留 appid（该 API 设计如此），日志脱敏
- **注意**：Google Maps 和 Amap 的 key 在 URL 中是 API 设计限制，无法改到 Header。缓解措施是统一日志脱敏。

#### 1.4 缓存加 LRU 大小限制
- **问题**：`xhs-service.ts` 的 `noteCache` 和 `multi-source-service.ts` 的 `searchCache` 是无限增长的 Map。
- **方案**：引入 `lru-cache`（轻量级，无依赖），设置 max: 1000, TTL: 30min。

### Batch 2 — P1 错误处理/可观测性

#### 2.1 空 catch 块补日志
- **问题**：`action-link-service.ts` 多处 `catch { }` 完全静默。
- **方案**：补充 `console.warn`（后续可升级到结构化日志），包含上下文（城市、日期、错误类型）。

#### 2.2 trvl JSON.parse 加保护
- **问题**：`trvl-service.ts` 的 `JSON.parse(stdout)` 无 try-catch，trvl CLI 可能输出非 JSON。
- **方案**：包 try-catch，抛出带原始 stdout 片段的友好错误。

#### 2.3 统一返回结构（最小化改动）
- **问题**：各服务返回结构不统一（有的 `{ data, source }`，有的直接返回数据）。
- **方案**：本次不改动公共 API（影响面太大），仅在文档中标注。留待后续任务。

### Batch 3 — P2 测试补全

#### 3.1 补充测试场景
- `weather-service`: OWM 5xx 降级、网络超时降级
- `trvl-service`: `JSON.parse` 失败、stderr 输出
- `xhs-service`: cache TTL 过期

## 非目标（留待后续任务）
- 引入 Zod 运行时 Schema 验证（影响面大，需单独任务）
- 结构化日志系统（需单独任务设计 logger 抽象）
- 熔断器/限流器（当前流量不高，优先级降低）
- 统一返回结构重构（影响所有调用方，需单独任务）
- 进程级全局状态集群化（需 Redis，架构变更）

## 验收标准
- [ ] `npm run check` 全部通过（lint + typecheck + test）
- [ ] 所有服务使用统一 `http-client.ts` 的 `fetchWithTimeout`
- [ ] `AbortSignal.timeout` 在项目代码中清零
- [ ] xhs cache + multi-source cache 使用 LRU，max 1000
- [ ] action-link-service 所有 catch 块都有日志
- [ ] trvl-service `JSON.parse` 有错误保护
- [ ] 新增 http-client.ts 有单元测试（正常/超时/重试/错误分类）
- [ ] 测试覆盖 Batch 3 的新场景
