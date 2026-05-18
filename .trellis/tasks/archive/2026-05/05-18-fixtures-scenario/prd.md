# Fixtures Scenario 工厂 — 业务场景替代数据结构

## 背景
当前 `fixtures.ts` 的 12 个工厂函数都是"数据结构工厂"——描述对象长什么样，而不是业务场景中发生了什么。

这导致测试 setup 代码冗长：
```ts
createMockTripPlan({
  days: [{ ...createMockDayPlan(), attractions: [] }]
})
```

## 目标
引入 **scenario 工厂**——描述业务意图而非数据结构：
- `createScenarioSingleCityDay(options)` — 单城市一日游
- `createScenarioMultiCityTrip(cities)` — 多城市行程
- `createScenarioTransferDay(from, to)` — 中转日

同时保持现有的数据结构工厂作为底层 building block。

## 验收标准
- [ ] 新增 3-5 个 scenario 工厂函数
- [ ] 至少 5 个现有测试改用 scenario 工厂
- [ ] 测试代码行数减少（setup 更简洁）
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
