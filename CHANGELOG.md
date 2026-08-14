# CHANGELOG

本文件按版本记录 TravelMap 的变更。版本号沿用语义化版本约定。

> **版本说明**：当前 `package.json` 版本为 `0.1.0`。下面三个并行优化批次构成一次大版本迭代，本条目暂按建议版本 **0.2.0** 撰写，最终版本号以主代理发布决策为准。

## [0.2.0] 2026-08-14 — 三轮并行优化（分享/云同步/安全与离线）

> ⏳ 本批次仍在进行中：PWA 安装提示（beforeinstallprompt）等项待主代理合并后补充。

### 第三批：全站 CSP / SW 预缓存 / 实时行程编辑 / 分享埋点

#### 安全

- 全站 CSP 安全头（`web/_headers`）：`default-src 'self'` + script/style/img/connect 精确白名单；瓦片/天气/头像域枚举；`object-src 'none'`、`frame-ancestors 'self'`

#### 性能

- Service Worker 预缓存：`sw.js` 占位标记 + 构建期注入约 100 项哈希资产清单，逐项 `cache.add` 容错，核心资源真正离线可用

#### 功能

- 聊天面板内实时行程编辑：AI 生成后可直接调整（景点排序/跨天移动/删除整天），保存即更新地图并存入历史；编辑按钮随行程就绪显示
- 分享转化漏斗埋点：`share_click` / `share_generated` 事件（图片/链接/二维码），analytics 类型容错与 PII 白名单文档
- 体验增强：欢迎页/新手引导改造（compose 快捷入口、welcome-action-card）；修复 mobile 智能推荐用例被 guest-banner 遮挡；新增 onboarding/trip-stats 模块

#### 工程

- fixture 兼容 byte-stable；工件 precache_manifest=100、116 files
- 测试：前端 692 / 后端 1218 / 质量 190 / E2E 156 全部通过

### 第二批：行程云同步 / API TTL 缓存 / SSE 可靠性 / SEO 城市落地页

#### 功能

- 行程云同步（`web/functions/api/trips.js` + `infra/trip-sync.js`）：GET/PUT/DELETE `/api/trips`，JWT 认证 + IP 限流，KV 90 天 TTL；登录后按 `updatedAt` 双向合并（本地新上传/服务端新下载），5s 防抖去重；`db.js` 保存/删除后派发 `travelmap-trip-changed` 事件触发同步
- SEO 城市落地页（`web/city/*.html` × 10）：北京/上海/广州/深圳/成都/杭州/西安/重庆/南京/武汉；每页 SEO meta + OG + JSON-LD（BreadcrumbList/WebPage），sitemap 15 URL；部署管线支持 `city/` 目录复制与白名单

#### 性能

- 前端 API TTL 缓存（`infra/ttl-cache.js`）：高德 POI 搜索 24h / Nominatim 7 天缓存，localStorage 上限 200 条全容错；搜索命中零请求

#### 工程

- SSE 流式可靠性（`chat-init.js`）：60s 首字节超时检测，中止请求 + 可重试错误提示（三语文案）；流中断/5xx 经既有 agent_end 错误链路覆盖
- 附 `docs/product-polish-plan.md` 产品展示优化规划
- 测试：前端 659 / 后端 1218 / 质量 190 / E2E 156 全部通过

### 第一批：分享短链服务端化 / Provider 故障转移 / 轻量埋点 / i18n 三语

#### 功能

- 分享短链服务端化（`web/functions/api/share.js`）：POST `/api/share` 存 KV（30 天 TTL，32KB 上限，IP 限流 10/min）；GET `/api/share?id=` 服务端取回，前端 `loadSharedTrip` 本地 miss 时回源；二维码长行程不再依赖 localStorage，分享真正跨设备可用
- i18n 三语补全：trip-editor/history 全部文案走 zh/en/ja 字典（23 个新键）
- 前端轻量埋点（`web/functions/api/track.js` + `infra/analytics.js`）：page_view 等事件批量节流上报，IP 限流 20/min，meta 脱敏；仅生产启用（本地开发/E2E 静默）

#### 工程

- LLM Provider 故障转移（`web/functions/_lib/provider-chain.js`）：`env.LLM_FALLBACK_PROVIDERS` 配置 fallback 链（白名单校验、去重、排除主 provider）；主 provider 失败自动切换，每 provider 独立超时，流式响应同样转发；配额/限流只消费一次
- 新增 trip-editor.test.js 10 用例
- CI 新增 `npm audit --audit-level=high` 门禁
- 测试：前端 602 / 后端 1218 / 质量 190 / E2E 156 全部通过
