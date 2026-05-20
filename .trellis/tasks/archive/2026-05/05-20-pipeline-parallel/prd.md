# 后处理 Pipeline 并行化

## Goal

将后处理 Pipeline 从串行执行改为分组并行，预计从 ~12s 降到 ~4s。

## Current State

```
串行执行:
budget-calc → action-links → restaurant-enrich → transport-enrich → hotel-enrich → budget-check → consistency-check
```

## Target State

```
Phase 1 (并行): budget-calc + action-links + restaurant-enrich + transport-enrich + hotel-enrich
Phase 2 (串行): budget-check (依赖 budget-calc 结果)
Phase 3 (无依赖): consistency-check
```

## Requirements

### 1. Pipeline 引擎改造
- `PostProcessPipeline.run()` 支持步骤分组
- 同组步骤用 `Promise.allSettled()` 并行执行
- 不同组之间串行（有依赖关系）
- 单步骤失败不阻塞同组其他步骤

### 2. 步骤依赖声明
- 每个 `PostProcessStep` 可声明 `dependsOn?: string[]`
- Pipeline 自动计算执行顺序（拓扑排序或显式分组）

### 3. 错误收集
- `Promise.allSettled()` 收集所有结果
- 成功步骤的结果传递给下游
- 失败步骤记录错误但不阻塞

### 4. 性能指标
- 记录每个步骤的执行时间
- 记录总并行时间 vs 串行时间对比

## Acceptance Criteria

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | enrich 步骤并行执行 | 日志中时间戳重叠 |
| 2 | budget-check 在 budget-calc 之后执行 | 步骤执行顺序正确 |
| 3 | 单个 enrich 步骤失败不阻塞其他 | 单步注入错误，其他步骤正常完成 |
| 4 | 所有现有测试通过 | `npm test` |
| 5 | Pipeline 执行时间减少 50%+ | 性能测试对比 |

## Implementation Notes

- 修改 `src/services/post-process/pipeline.ts`
- 新增 `StepGroup` 类型，支持并行执行
- 保持向后兼容：无 `dependsOn` 的步骤默认串行
