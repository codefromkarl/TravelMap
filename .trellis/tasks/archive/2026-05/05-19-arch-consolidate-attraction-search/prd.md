# 架构深化 #1: 收拢景点搜索碎片化管线

## 优先级
⭐⭐⭐ — 高影响，中工作量

## 问题

景点数据的获取链路被拆散在至少 5 个模块中：

```
attraction-service.ts      ← L1 Google Places（重复实现）
multi-source-service.ts    ← L1+L1.5+L2 融合编排
free-sources/fusion-engine.ts  ← 去重算法
free-sources/adapters/*    ← 各数据源获取
xhs-service.ts             ← UGC 层
```

**重复点**：
- `attraction-service.ts` 和 `multi-source-service.ts` 都调 Google Places API
- 两者都有 `AttractionSearchParams` 接口
- 两者都有 `mapCategory` 函数的重复实现
- 两者都用 `getMockAttractions` fallback

**删除测试**: 删掉 `attraction-service.ts` 不会丢失任何能力 — `multi-source-service.ts` 已包含其全部功能。它是浅层透传模块。

## 方案

1. 以 `multi-source-service.ts` 为核心，将其作为景点搜索的唯一入口
2. `attraction-service.ts` 退化为纯 re-export（向后兼容），或直接删除
3. `AttractionSearchParams` 统一为一份定义
4. `mapCategory` 保留在 multi-source 中，删除 attraction-service 中的副本
5. 更新 `search-orchestrator.ts` 和 `tools/attractions.ts` 的导入路径

## 涉及文件

### 修改
- `src/services/multi-source-service.ts` — 确保是完整的景点搜索入口
- `src/services/search-orchestrator.ts` — 更新导入
- `src/tools/attractions.ts` — 更新导入

### 删除/简化
- `src/services/attraction-service.ts` — 删除或退化为 re-export

### 测试更新
- `src/__tests__/unit/services/attraction-service.test.ts` — 合并到 multi-source 测试
- `src/__tests__/unit/services/multi-source-service.test.ts` — 扩展覆盖

## 收益

- **Locality**: "搜索景点"的 bug 只需看 multi-source-service.ts 一个文件
- **Leverage**: 调用者只需关心 `searchAttractionsMultiSource()` 一个接口
- **测试面**: 从 2 个 service 的交叉测试简化为 1 个融合引擎的单元测试
- 消除约 80 行重复代码

## 验收标准

- [ ] `attraction-service.ts` 删除或退化为 re-export
- [ ] 所有景点搜索通过 `multi-source-service.ts` 统一入口
- [ ] 无重复的 `AttractionSearchParams` / `mapCategory`
- [ ] 现有测试全部通过
- [ ] `tools/attractions.ts` 功能不受影响
