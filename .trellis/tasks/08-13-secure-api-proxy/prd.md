# 生产 API 安全代理与密钥治理

## 背景

当前线上 `/api/chat` 匿名开放、允许客户端影响 provider/base URL，并使用服务端付费密钥调用上游；同时 `.dev.vars` 被纳入静态部署范围。该状态同时带来密钥外带、费用滥用和静态资源泄漏风险。

## 目标

1. 浏览器只能请求同源 `/api/chat`，不能获取、携带或选择服务端密钥与上游地址。
2. Pages Function 只使用 Cloudflare 加密 Secret 中的 `LLM_API_KEY`，并只调用服务端配置所确定的固定 provider/model/host。
3. 每个聊天请求在调用上游前必须通过同源检查、JWT 登录、用户存在性检查、KV 分钟窗口限流、每日额度和请求体约束。
4. 任何真实密钥不得出现在 Git 当前树、静态部署产物、浏览器代码或应用日志中。
5. 缺少安全绑定或 Secret 时 fail closed，不使用开发默认密钥或不安全降级。

## 非目标

- 本任务不轮换供应商密钥，不操作 Cloudflare Dashboard，不部署生产环境。
- 本任务不重写 Git 历史；历史清理需在密钥轮换后单独执行。
- 本任务不统一 `src/` 与 `web/` 两套 Agent 架构，也不重构所有外部数据代理。
- KV 每日额度是成本防护的一层，不宣称具有强一致原子计费语义；硬成本上限仍需供应商预算和 Cloudflare 平台规则兜底。

## 验收标准

- 未认证请求返回 401；缺少 JWT、KV 或 LLM Secret 返回 503。
- 跨源请求返回 403，响应不再包含 `Access-Control-Allow-Origin: *`。
- `_provider`、`baseUrl`、`apiKey` 等客户端上游控制字段被拒绝；上游 URL 只能来自代码内 allowlist。
- provider/model 只能来自服务端环境配置；请求体 model 被覆盖为服务端模型。
- 用户和 IP 速率限制在额度消费和上游调用之前执行；超限返回 429。
- 每日额度耗尽返回 429；成功受理后返回剩余额度头。
- 上游失败不向客户端返回供应商原始错误正文，也不记录请求体或密钥。
- `.dev.vars` 不再被 Git 当前树跟踪，ignore 和部署脚本阻止敏感文件进入产物。
- 相关 Functions、认证前端与部署安全测试通过。

## 上线前人工门禁

1. 轮换所有已暴露密钥并审计账单。
2. Cloudflare Pages 设置 `LLM_API_KEY`、`JWT_SECRET` 加密 Secret并绑定 `RATE_LIMIT_KV`；另在 Cloudflare WAF 配置 `/api/chat` Rate Limiting Rule。
3. 删除线上公开敏感资源并 purge cache。
4. 用托管环境执行登录、401/403/429、正常流式聊天和额度头 smoke test。
