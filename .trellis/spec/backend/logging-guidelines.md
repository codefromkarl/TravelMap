# Logging Guidelines

> How logging is done in this project.

---

## Overview

- 当前使用 `console.warn` / `console.error` 作为过渡方案
- 结构化日志系统留待后续任务设计 logger 抽象
- 所有日志中的 URL 必须经 `sanitizeUrl` 脱敏处理

---

## Log Levels

| 级别 | 使用场景 | 示例 |
|------|----------|------|
| `console.warn` | 外部 API 降级、非致命异常 | `[WeatherService] OWM failed, using mock` |
| `console.error` | 致命错误、无法降级 | （当前较少使用） |
| `console.info` | 关键生命周期事件 | （预留） |

### 规范格式

```ts
// ✅ 正确：包含服务名、上下文、错误信息
console.warn(
  `[ServiceName] 操作失败 (${context}):`,
  err instanceof Error ? err.message : err,
);

// ❌ 错误：信息不足
console.warn("failed");
```

---

## Structured Logging

> 待后续任务实现。目标格式：

```json
{
  "timestamp": "2025-05-18T15:30:00Z",
  "level": "warn",
  "service": "weather-service",
  "message": "OWM API timeout",
  "context": { "city": "北京", "source": "openweathermap" },
  "error": "TimeoutError: Request timeout after 5000ms"
}
```

---

## What to Log

- 外部 API 调用失败（降级前）
- 降级路径触发（帮助排查数据质量问题）
- CLI 工具 stderr 输出（如 trvl）
- 缓存命中/未命中（调试用，可关闭）

---

## What NOT to Log

- ❌ API Key、Token、密码等凭证（即使脱敏也避免出现在日志中）
- ❌ 用户个人隐私信息（PII）
- ❌ 完整 HTTP 响应体（可能包含敏感数据）

### URL 脱敏

使用 `http-client.ts` 中的 `sanitizeUrl`：

```ts
import { sanitizeUrl } from "./http-client.js";

// 输入: https://api.example.com/data?key=secret123&appid=abc
// 输出: https://api.example.com/data?key=***&appid=***
console.warn("Request failed:", sanitizeUrl(url));
```

---

## Secret Handling Rules

| API | key 位置 | 缓解措施 |
|-----|----------|----------|
| Amap | URL query `key` | 日志脱敏 |
| Google Places/Geocode | URL query `key` | 日志脱敏 |
| OpenWeatherMap | URL query `appid` | 日志脱敏 |
| JustOneAPI | **Header `Authorization: Bearer`** | 已从 URL 迁移到 Header |

> Google Maps 和 Amap 的 key 在 URL 中是 API 设计限制，无法改到 Header。缓解措施是统一日志脱敏。
