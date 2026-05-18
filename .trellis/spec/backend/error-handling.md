# Error Handling

> How errors are handled in this project.

---

## Overview

- 服务层统一通过 `src/services/http-client.ts` 进行外部 API 调用
- 所有外部 API 调用必须有 try-catch 包装 + fallback 降级逻辑
- 禁止空 `catch { }` 块 — 至少保留 `console.warn` 上下文日志

---

## Error Types

定义在 `src/services/http-client.ts`：

| 类型 | 场景 | 使用方 |
|------|------|--------|
| `NetworkError` | DNS 失败、连接中断等非 HTTP 错误 | `fetchWithTimeout` / `fetchWithRetry` |
| `TimeoutError` | 请求超过 `timeout`（默认 4s） | `fetchWithTimeout` |
| `ApiError` | HTTP 4xx/5xx 响应 | `fetchWithRetry`（5xx 重试耗尽后） |
| `AuthError` | 认证/授权失败 | 预留，当前由调用方自行处理 |

### 使用示例

```ts
import { fetchWithTimeout, TimeoutError, NetworkError } from "./http-client.js";

try {
  const res = await fetchWithTimeout(url, { timeout: 8000 });
} catch (err) {
  if (err instanceof TimeoutError) {
    // 超时降级逻辑
  } else if (err instanceof NetworkError) {
    // 网络错误降级逻辑
  }
}
```

---

## Error Handling Patterns

### 1. 外部 API 调用 → try-catch + fallback

```ts
// ✅ 正确：有降级路径
try {
  const data = await fetchExternalApi(params);
  return { data, source: "external" };
} catch (err) {
  console.warn("[ServiceName] External API failed:", err);
  return { data: mockData(params), source: "mock" };
}

// ❌ 错误：空 catch
try {
  const data = await fetchExternalApi(params);
} catch { }
```

### 2. JSON.parse 必须加保护

```ts
// ✅ 正确：trvl CLI 可能输出非 JSON
let result: SomeType;
try {
  result = JSON.parse(stdout) as SomeType;
} catch (parseErr) {
  throw new Error(`Invalid JSON output. Snippet: "${stdout.slice(0, 200)}..."`, { cause: parseErr });
}

// ❌ 错误：直接 parse
type Result = JSON.parse(stdout) as SomeType; // 可能抛出 SyntaxError
```

### 3. AbortController 替代 AbortSignal.timeout

```ts
// ✅ 正确：兼容 Node < 18.17 / < v20.13
function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

// ❌ 错误：旧 Node 不支持
fetch(url, { signal: AbortSignal.timeout(15_000) });
```

---

## API Error Responses

服务层返回统一结构（当前逐步迁移中）：

```ts
{
  data: T;        // 业务数据
  source: string; // 数据来源标识（如 "openweathermap" | "mock"）
  warning?: string; // 降级时的警告信息
}
```

> 注意：完整统一返回结构重构留待后续任务（影响所有调用方）。

---

## Common Mistakes

| 反模式 | 后果 | 预防 |
|--------|------|------|
| 空 `catch { }` | 失败静默，调试困难 | lint + 代码审查 |
| 直接 `JSON.parse(stdout)` | CLI 输出非 JSON 时崩溃 | 始终包 try-catch |
| `AbortSignal.timeout()` | 旧 Node 运行时崩溃 | 使用 `createAbortSignal` |
| 无限增长 Map 缓存 | 内存泄漏 | 使用 `LRUCache`（max: 1000） |
| API key 直接拼接 URL 且未脱敏 | key 泄露到日志 | 统一使用 `sanitizeUrl` |
