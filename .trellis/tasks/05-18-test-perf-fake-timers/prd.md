# 测试性能优化：消除 fake timers 等待

## 现状

- 593 个测试总耗时约 10-15s
- `xhs-service.test.ts` 单文件 6.1s（含大量 5s sleep / 真实等待）
- 测试运行慢影响开发体验和 CI 效率

## 目标

总测试时间 < 5s，消除测试中不必要的真实等待。

## 任务

### 1. xhs-service.test.ts — 最大瓶颈

- [ ] 分析测试中导致 6.1s 的具体原因（sleep/setTimeout/fetch retry 等待）
- [ ] 使用 `vi.useFakeTimers()` + `vi.advanceTimersByTime()` 替代真实等待
- [ ] 确保 mock 响应不依赖真实时间

### 2. 全局检查其他慢测试

- [ ] 运行 `vitest --reporter=verbose` 找出耗时 > 1s 的单个测试
- [ ] 对所有含 `setTimeout`/`sleep` 的测试使用 fake timers

### 3. vitest 配置优化

- [ ] 评估 `pool: "forks"` 是否最优（当前配置）
- [ ] 考虑 `isolatedThreads` 或 `vmThreads` 提速

## 验收标准

- [ ] `npm run test:unit` 总耗时 < 5s
- [ ] 所有测试仍通过
- [ ] lint + typecheck 通过
