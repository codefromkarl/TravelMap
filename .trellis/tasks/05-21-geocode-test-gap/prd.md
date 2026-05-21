# 地理编码测试覆盖系统性补充

## 背景

用户发现计划和地图路线对应问题后，分析发现测试覆盖存在系统性 Gap：
- `geocodeAttractions()` 前端函数无单元测试
- E2E 测试预期与实际功能不匹配
- 缺少"前端自动补全 → marker 渲染"的集成测试

## 问题分析

### 测试覆盖 Gap

| 层 | 函数/模块 | 测试状态 | 风险 |
|---|----------|---------|------|
| 后端 | `geocodeTool` | ✅ 有测试 | 低 |
| 后端 | `post-processor` 坐标校验 | ✅ 有测试 | 低 |
| 前端 | `geocodeAttractions()` | ❌ 无测试 | **高** |
| 前端 | `validate-trip.js` | ❌ 无测试 | **高** |
| 前端 | `renderTripOnPageMap()` | ⚠️ E2E 预期过时 | 中 |

### 根因

1. 前端函数没有对应的单元测试文件
2. E2E 测试写在功能实现之前，预期是旧逻辑
3. 缺少集成测试验证完整链路

---

## 测试执行结果

### 单元测试

| 测试文件 | 用例数 | 通过 | 失败 |
|---------|-------|------|------|
| `web/modules/__tests__/map-geocode.test.js` | 9 | 9 | 0 |
| `web/modules/__tests__/validate-trip.test.js` | 18 | 18 | 0 |

### E2E 测试

| 测试文件 | 用例数 | 通过 | 失败 |
|---------|-------|------|------|
| `web/__tests__/flows/itinerary-map-linkage.spec.ts` | 22 | 22 | 0 |
| `web/__tests__/flows/geocode-integration.spec.ts` | 12 | 12 | 0 |

### 测试覆盖评估

| 模块 | 测试类型 | 覆盖场景 |
|------|---------|----------|
| `geocodeAttractions()` | 单元测试 | 有坐标/null/0,0/API失败/无Key/批量/缓存/空行程 |
| `validate-trip.js` | 单元测试 | Schema校验/坐标校验/告警输出/Markdown输出 |
| 行程→地图联动 | E2E | marker渲染/popup内容/行程变更/边界情况 |
| 地理编码集成 | E2E | 骨架→补全→渲染/完整→直接渲染/零坐标补全/行程更新 |

---

## 任务清单

### T1: 前端 `geocodeAttractions()` 单元测试 ✅

**文件**: `web/modules/__tests__/map-geocode.test.js`

**测试用例**:
- [x] 有坐标的景点不触发补全
- [x] `location: null` 的景点触发高德 API 补全
- [x] `location: {0, 0}` 的景点触发补全
- [x] 高德 API 失败时 fallback 到 CITY_CENTERS
- [x] 批量补全并发控制（最多 5 个并发）
- [x] LRU 缓存命中不重复请求
- [x] 无 API Key 时直接返回 0
- [x] 空行程返回 0
- [x] 无 days 字段返回 0

### T2: 前端 `validate-trip.js` 单元测试 ✅

**文件**: `web/modules/__tests__/validate-trip.test.js`

**测试用例**:
- [x] `validateTripPlanSchema()` 正常行程通过
- [x] `validateTripPlanSchema()` 缺少 city 报错
- [x] `validateTripPlanSchema()` 缺少 days 报错
- [x] `validateTripPlan()` 无缺失坐标返回空数组
- [x] `validateTripPlan()` 有缺失坐标返回名称列表
- [x] `validateAndWarn()` 缺失坐标时输出警告
- [x] `validateToMarkdown()` 生成 Markdown 告警文本

### T3: E2E 测试预期更新 ✅

**文件**: `web/__tests__/flows/itinerary-map-linkage.spec.ts`

**已完成**:
- [x] marker 数量预期从 4 → 5（河坊街被补全）
- [x] 零坐标景点预期从 1 → 2（被补全）
- [x] 行程变更测试预期更新

### T4: 集成测试 — 前端自动补全 → marker 渲染 ✅

**文件**: `web/__tests__/flows/geocode-integration.spec.ts`

**测试用例**:
- [x] 注入骨架行程 → 自动触发地理编码 → marker 渲染
- [x] 注入完整行程 → 不触发地理编码 → 直接渲染
- [x] 零坐标景点触发补全
- [x] 行程变更 → 重新触发地理编码 → marker 更新
- [x] 补全后坐标在合理范围内
- [x] 空行程不触发地理编码

### T5: 测试质量评估 — 覆盖率报告

**产出**: 测试覆盖率报告 + 评估指标

**指标**:
- [ ] 前端 `map.js` 函数覆盖率
- [ ] 前端 `validate-trip.js` 行覆盖率
- [ ] 地理编码相关代码分支覆盖率
- [ ] E2E 测试通过率

---

## 验收标准

- [x] `web/modules/__tests__/map-geocode.test.js` 通过 (9/9)
- [x] `web/modules/__tests__/validate-trip.test.js` 通过 (18/18)
- [x] `web/__tests__/flows/itinerary-map-linkage.spec.ts` 全部通过 (22/22)
- [x] `web/__tests__/flows/geocode-integration.spec.ts` 全部通过 (12/12)
- [ ] 测试覆盖率报告生成
- [x] 测试质量评估文档更新
