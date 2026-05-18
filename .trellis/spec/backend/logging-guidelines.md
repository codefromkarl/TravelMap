# Logging Guidelines

> How logging is done in this project.

---

## Overview

当前阶段使用最小化日志：`console.warn`/`console.log`。未来如需结构化日志，应统一替换为 `logger.ts` 抽象，而非在 services 中直接引入 `pino` 等库。

---

## Log Levels

| 级别 | 使用场景 | 示例 |
|------|---------|------|
| `console.log` | 开发调试信息（提交前应清理） | 临时打印中间变量 |
| `console.warn` | 降级、异常但可恢复 | `[WeatherService] OWM failed, using mock: timeout` |
| `console.error` | 致命错误，无法降级 | 未捕获异常、启动失败 |

**禁止**：在生产代码中保留 `console.log` 调试语句。

---

## Structured Logging（预留接口）

未来统一 logger 应包含字段：

```ts
{
  service: "weather-service",
  provider: "openweathermap",
  action: "fetch_forecast",
  duration: 120,
  status: "success" | "degraded" | "error",
  source: "openweathermap" | "mock",
  errorType?: "TimeoutError" | "NetworkError",
}
```

当前过渡方案：在 `console.warn` 中保持 `[ServiceName]` 前缀，方便 grep。

---

## What to Log

### 必须记录
- 外部 API 降级（source 从真实变为 mock）
- 重试事件（http-client 已自动打印）
- 认证失败（AuthError，立即记录）

### 禁止记录
- API Key、Token、密码等敏感信息（使用 `sanitizeUrl()` 脱敏）
- 用户个人身份信息（PII）
- 完整的请求/响应 body（可能包含敏感数据）

---

## URL 脱敏规范

使用 `http-client.ts` 中的 `sanitizeUrl()`：

```ts
import { sanitizeUrl } from "./http-client.js";

// 脱敏前: https://api.example.com?key=SECRET&lat=1
// 脱敏后: https://api.example.com/?key=***&lat=1
console.warn("Request failed:", sanitizeUrl(url));
```

脱敏字段：`key`, `appid`, `token`, `api_key`, `apikey`, `secret`, `password`, `auth`
