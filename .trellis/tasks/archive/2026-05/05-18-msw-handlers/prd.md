# 补齐 MSW Handlers — 消除未 mock 外部 API 警告

## 背景
当前 `src/__tests__/mocks/handlers.ts` 只覆盖了 5 个外部 API 域名：
- maps.googleapis.com
- api.openweathermap.org
- restapi.amap.com
- nominatim.openstreetmap.org

但源码中实际调用的外部 API 还有以下缺失：
- `api.opentopodata.org` — elevation-service
- `rnote.dev` — xhs-service (Rnote provider)
- `api.justoneapi.com` — xhs-service (JustOneAPI provider)
- `api.tikhub.io` — xhs-service (TikHub provider)
- `localhost:8080` — xhs-service (Crawler provider)

这导致测试中产生 20+ 条 `[MSW] Warning: intercepted a request without a matching request handler`，且 `server.use()` 无法覆盖这些 API 的异常响应测试。

## 目标
1. 在 `handlers.ts` 中为所有缺失的外部 API 添加 mock handler
2. 更新 `quality-guard.test.ts` 的 `EXPECTED_API_DOMAINS`，增加自动化检查
3. 消除所有 MSW warning
4. `npm test` 全部通过

## 验收标准
- [ ] handlers.ts 覆盖所有源码中 `fetchWithTimeout`/`fetchWithRetry` 调用的 URL 域名
- [ ] quality-guard.test.ts 的 HTTP Mock 覆盖检查通过
- [ ] `npm test` 无 MSW warning（或仅有合理的 warning）
- [ ] `npm run check` 通过
