# Cloudflare Pages API 安全部署

线上浏览器只通过同源 `/api/chat` 使用模型。模型 API Key 不得写入 Git、前端配置、静态文件或日志。

## 必需绑定

在 Cloudflare Pages 的 Production 环境配置：

- 加密 Secret：`JWT_SECRET`
- 加密 Secret：`LLM_API_KEY`，或当前 provider 对应的专用 Secret
- 普通变量：`LLM_PROVIDER`（必须是代码 allowlist 中的 provider）
- 普通变量：`LLM_MODEL`
- KV binding：`RATE_LIMIT_KV`

不要设置 `LLM_BASE_URL`。代理不会读取该变量，也不会接受浏览器传入的 provider、base URL 或 API Key。

## Secret 设置示例

通过 Cloudflare Dashboard 的 Pages Settings → Variables and Secrets 设置生产 Secret。使用 CLI 时，应从交互式标准输入写入 Secret，不能把值放入命令历史、脚本参数或仓库文件。

本地开发可复制 `.dev.vars.example` 为 `.dev.vars` 并使用可撤销、低额度的测试凭据。`.dev.vars` 已被 Git 和部署脚本排除。

## 上线门禁

1. 轮换所有曾进入 Git 或静态站点的旧 Key。
2. 删除线上 `/.dev.vars` 等敏感资源并清理 CDN 缓存。
3. 在供应商侧设置硬预算、告警和域/IP/接口限制（如果供应商支持）。
4. 验证匿名请求为 401、跨源请求为 403、限流/额度耗尽为 429。
5. 登录后验证流式聊天、`X-Quota-Remaining` 与服务端固定模型。
6. 检查浏览器 Network、静态产物和 Cloudflare 日志均没有真实 Key。

Pages Function 使用 `RATE_LIMIT_KV` 实现用户/分钟、IP/分钟和用户日额度三层成本防护。KV 的 get/put 不是强一致原子计费器，因此生产必须同时配置 Cloudflare WAF Rate Limiting Rule 和供应商硬预算/告警。需要严格并发或日预算时，应创建独立 Durable Object Worker，再通过 Pages 支持的 Durable Object 或 Service binding 接入；Durable Object 不能直接定义在 Pages 项目中。
