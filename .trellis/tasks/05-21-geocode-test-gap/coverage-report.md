# 地理编码测试覆盖率报告

> 生成日期：2026-05-22
> 范围：`web/modules/map.js`、`web/modules/tools/validate-trip.js`、地理编码相关单元测试与 E2E 行为测试

## 执行命令

```bash
npx vitest run --project frontend-unit \
  web/modules/__tests__/map-geocode.test.js \
  web/modules/__tests__/map-coord.test.js \
  web/modules/__tests__/validate-trip.test.js \
  --coverage \
  --coverage.include='web/modules/map.js' \
  --coverage.include='web/modules/tools/validate-trip.js' \
  --coverage.reporter=json-summary \
  --coverage.thresholds.lines=0 \
  --coverage.thresholds.functions=0 \
  --coverage.thresholds.branches=0 \
  --coverage.thresholds.statements=0 \
  --reporter=dot

npx playwright test --config playwright.config.ts \
  web/__tests__/flows/itinerary-map-linkage.spec.ts \
  web/__tests__/flows/geocode-integration.spec.ts \
  --project=desktop

npx playwright test --config playwright.config.ts \
  web/__tests__/flows/itinerary-map-linkage.spec.ts \
  web/__tests__/flows/geocode-integration.spec.ts \
  --project=mobile
```

## 测试结果

| 类型 | 范围 | 通过 | 失败 | 通过率 |
|---|---:|---:|---:|---:|
| 前端单元测试 | map-geocode + map-coord + validate-trip | 36 | 0 | 100% |
| E2E desktop | itinerary-map-linkage + geocode-integration | 17 | 0 | 100% |
| E2E mobile | itinerary-map-linkage + geocode-integration | 17 | 0 | 100% |
| E2E 合计 | desktop + mobile | 34 | 0 | 100% |

## 覆盖率指标

| 文件/范围 | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `web/modules/map.js` | 16.62% | 73.21% | 26.82% | 16.62% |
| `web/modules/tools/validate-trip.js` | 97.45% | 90.24% | 100% | 97.45% |
| 合计（仅上述 include） | 21.57% | 80.41% | 33.33% | 21.57% |

## 结论

1. `validate-trip.js` 覆盖率充足：行覆盖 97.45%，函数覆盖 100%，分支覆盖 90.24%。
2. 地理编码核心路径已有单元测试和 E2E 双重覆盖：坐标缺失、零坐标、缓存、API fallback、marker 渲染均被覆盖。
3. `map.js` 整体覆盖率偏低，原因是该文件承担地图渲染、路线规划、POI 查询、补给点、动画和 DOM 交互等大量职责；当前覆盖主要集中在坐标转换和地理编码链路。
4. E2E 在 desktop/mobile 均 100% 通过，说明用户可见的「前端自动补全 → marker 渲染」链路当前可用。

## 后续建议

- 若要提升 `map.js` 整体函数覆盖率，应优先拆分 `route-planner`、POI 查询、marker 渲染、补给点渲染等子模块，而不是继续向单个 1800+ 行文件堆测试。
- 对地图渲染这类强 DOM/Leaflet 依赖逻辑，继续保留 Playwright E2E 作为主验证方式。
