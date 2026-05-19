# 架构深化 #4: XHS 路由层微调

## 优先级
⭐ — 低影响，低工作量

## 问题

XHS 路由层是项目中架构最好的部分 — 统一路由 + 多 Adapter + 可配置策略。但 `xhs-service.ts` 承担了三种职责：

1. 路由策略解析（`resolveOrder` / `resolveProviders`）
2. 缓存管理（`noteCache`）
3. 批量搜索编排（`batchSearchXhsNotes` 中的并发 worker）

其中批量搜索的并发 worker 模式是内联实现的，其他地方如需类似能力会重复。

## 方案

1. 将路由策略解析提取为 `XhsRouter` 类
2. 将并发 worker 模式提取为通用 `concurrentMap` 工具函数

### XhsRouter 类

```typescript
class XhsRouter {
  resolve(): ProviderName[] { ... }
  async search(keyword: string): Promise<ProviderResult | null> { ... }
}
```

### 通用并发工具

```typescript
async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency?: number
): Promise<R[]>
```

## 涉及文件

### 新建
- `src/services/xhs/router.ts` — XhsRouter 类
- `src/utils/concurrent.ts` — 通用并发工具

### 修改
- `src/services/xhs-service.ts` — 使用 XhsRouter + concurrentMap

## 收益

- 轻微 locality 提升
- `concurrentMap` 可被其他 batch 操作复用

## 验收标准

- [ ] `XhsRouter` 类独立可测
- [ ] `concurrentMap` 工具可复用
- [ ] xhs-service.ts 行数减少
- [ ] 现有测试通过
