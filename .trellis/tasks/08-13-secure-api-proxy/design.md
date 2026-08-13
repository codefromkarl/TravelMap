# Design

## 请求链

```text
Browser (same origin)
  -> POST /api/chat
  -> Origin check
  -> required JWT secret + JWT verification
  -> user record lookup in RATE_LIMIT_KV
  -> RATE_LIMIT_KV minute buckets: user key + IP key
  -> request schema/size validation
  -> daily quota consumption
  -> fixed provider/model/url from server config
  -> upstream with server Secret
  -> sanitized response + quota headers
```

## 服务端配置契约

- 必需：`JWT_SECRET`, `RATE_LIMIT_KV`, `LLM_PROVIDER`, `LLM_MODEL`。
- provider 对应的 key 优先使用专用 Secret（如 `OPENAI_API_KEY`），兼容 `LLM_API_KEY` 作为单一固定 provider 的 Secret。
- 不再支持客户端或 `LLM_BASE_URL` 动态覆盖上游；上游 URL 存在代码 allowlist。
- 生产 Secret 仅通过 Cloudflare Dashboard/CLI 设置，不进入 `.dev.vars.example` 之外的仓库文件；示例文件只含占位符。

## 响应契约

- `401 unauthenticated`：无有效登录。
- `403 forbidden_origin`：Origin 与请求 origin 不同。
- `429 rate_limited` / `quota_exceeded`：速率或日额度耗尽。
- `503 security_not_configured` / `provider_not_configured`：安全绑定或上游配置缺失。
- `502 upstream_error`：供应商失败；不透传供应商响应正文。
- 所有错误仅返回稳定 code 和通用 message，不包含密钥、URL、请求体和供应商详情。

## 前端契约

- 生产模式不读取 LLM Key 或 base URL；provider SDK 请求被转换为同源 `/api/chat`。
- 页面启动时恢复 `/api/auth/status` 检查；未登录显示登录覆盖层。
- `/api/chat` 返回 401 时显示登录覆盖层；额度头用于更新 UI。

## 部署安全

- Pages 不支持 Workers Rate Limiting binding；KV 分钟窗口是最终一致的应用层防护，必须叠加 Cloudflare WAF Rate Limiting Rule 和供应商硬预算。严格计数需独立 Durable Object Worker。
- Git ignore 覆盖 `.dev.vars`、环境文件与本地配置。
- 当前已跟踪的敏感文件从工作树删除，添加不含真实值的 example。
- `deploy.sh` 显式排除敏感文件，并在上传前扫描目标目录；发现即中止。
- 不在日志中输出环境对象、Authorization、Cookie、原始请求/响应正文。
