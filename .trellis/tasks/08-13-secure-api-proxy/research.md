# Research: Cloudflare Pages API 安全边界

## 仓库证据

- `web/functions/api/chat.js` 当前允许匿名调用、通配 CORS，并接受客户端 `_provider`/`baseUrl`。
- `web/functions/_lib/jwt.js` 已提供 JWT 验签和 Cookie token 提取，可作为服务端认证基础。
- `web/functions/_lib/quota.js` 已提供 KV 用户额度读取与消费，但其 get/put 流程不是强一致原子计数器。
- `web/modules/auth/auth.js` 当前绕过认证；恢复后应由服务端状态决定 UI 登录状态。
- `scripts/deploy.sh` 当前复制整个 `web/`，需要在复制和上传之间增加 fail-closed 敏感文件检查。

## 设计判断

- 同源 Cookie 认证需要同时校验 `Origin`，避免第三方站点利用浏览器 Cookie 发起跨站付费请求。
- provider/model/base URL 属于服务端策略，不是客户端输入。请求体只承载对话参数，敏感或路由字段直接拒绝。
- Workers Rate Limiting binding 的 `limit({ key })` API 不在 Pages Functions 支持的 binding 子集中，不能作为当前 Pages 项目的直接依赖。当前使用 KV 分钟窗口 + 日额度，并要求 WAF Rate Limiting Rule 与供应商预算兜底；强一致版本应迁移到独立 Durable Object Worker。
- 安全依赖缺失时继续匿名或无限额运行会重新暴露付费代理，因此必须返回 503。
- 部署 denylist 只能作为当前止血措施；长期应迁移到显式 allowlist/构建 manifest。

## 参考资料

- Cloudflare Pages Functions bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Rate Limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Cloudflare KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
