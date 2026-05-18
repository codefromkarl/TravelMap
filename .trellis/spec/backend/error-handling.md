# Error Handling

> How errors are handled in this project.

---

## Overview

服务层的外部 API 调用统一通过 `src/services/http-client.ts` 处理超时和网络错误。各 service 在此基础上做业务级降级。

---

## Error Types

定义在 `http-client.ts` 中：

| 类型 | 用途 | 重试策略 |
|------|------|---------|
| `NetworkError` | DNS 失败、TCP 断开等底层网络错误 | 幂等请求自动重试（max 3，指数退避） |
| `TimeoutError` | 请求超过 `timeout` 阈值 | 同上 |
| `ApiError` | HTTP 4xx/5xx（除 401/403） | 4xx 不重试；5xx 自动重试 |
| `AuthError` | HTTP 401/403 | **永不重试**，立即抛出 |

---

## Error Handling Patterns

### 服务层调用外部 API

```ts
import { fetchWithTimeout, fetchWithRetry } from "./http-client.js";

// GET 请求：自动重试
const res = await fetchWithRetry(url, { timeout: 8000 });

// POST 请求：不重试，仅超时保护
const res = await fetchWithTimeout(url, { method: "POST", body: json, timeout: 15000 });
```

### 降级策略（所有外部 API 必须实现）

```ts
export async function searchXxx(params): Promise<Result> {
  try {
    const data = await fetchFromRealApi(params);
    return { data, source: "real_api" };
  } catch (err) {
    console.warn("[XxxService] API failed, using mock:", err instanceof Error ? err.message : err);
    return { data: getMockData(params), source: "mock" };
  }
}
```

**强制规则**：
- 每个外部 API 调用必须有 `try-catch`
- `catch` 块必须有日志（禁止空 `catch {}`）
- 必须提供 fallback 数据或抛出带上下文的错误

---

## API Error Responses

服务层返回统一结构：

```ts
{ data: T; source: string; warning?: string }
```

- `source` 标识数据来源（`"google_places"` / `"mock"` / `"default"` 等）
- `warning` 在降级时向调用方说明原因

---

## Common Mistakes

|  Mistake  | Why Bad  | Fix  |
|---|---|---|
| 裸 `fetch()` 不经过 http-client  | 无统一超时、无重试、无日志脱敏  | 统一使用 `fetchWithTimeout`/`fetchWithRetry`  |
| 空 `catch {}`  | 失败静默，生产环境无法排查  | 至少 `console.warn("[Service] xxx failed:", err)`  |
| API Key 直接拼在 URL 中且不做脱敏  | Key 可能泄露到日志/代理  | 使用 `sanitizeUrl()` 脱敏后再打印  |
| 不对错误分类  | 401 也会触发重试，浪费资源  | 区分 `AuthError`（不重试）与 `ApiError`（可重试）  |
