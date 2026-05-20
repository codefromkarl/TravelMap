# 架构深化 #3: 后处理管线引入 Pipeline 抽象

## 优先级
⭐⭐ — 中影响，中工作量

## 问题

`postProcessTripPlan()` 是一个硬编码的顺序管线：

```
餐厅丰富 → 交通丰富 → 预算计算 → 链接生成 → 预算检查 → 一致性校验
```

每个步骤是 `if (enableXXX)` + `try/catch` 的重复模式。添加新的后处理步骤需要修改这个函数。

## 方案

### Pipeline + Step 模式

```typescript
interface PostProcessStep {
  name: string;
  run(tripPlan: TripPlan, ctx: PostProcessContext): Promise<TripPlan>;
}

class PostProcessPipeline {
  private steps: PostProcessStep[] = [];

  add(step: PostProcessStep): this { ... }
  async run(tripPlan: TripPlan, config: PostProcessorConfig): Promise<PostProcessorResult> { ... }
}
```

- 每个 step 是一个独立模块，满足统一接口
- Pipeline 负责：步骤注册、依赖排序、错误隔离、结果收集
- 默认 pipeline 包含现有 6 个步骤
- 新步骤（如"人群适配检查"）只需 `pipeline.add(new Step())` 即可

### 内置步骤

| Step | 说明 |
|------|------|
| `RestaurantEnrichStep` | 餐厅推荐丰富 |
| `TransportEnrichStep` | 城际交通方案丰富 |
| `BudgetCalcStep` | 预算计算 |
| `ActionLinksStep` | 行动链接生成 |
| `BudgetCheckStep` | 预算上限检查 |
| `ConsistencyCheckStep` | 行程一致性校验 |

## 涉及文件

### 新建
- `src/services/post-process/pipeline.ts` — Pipeline 类
- `src/services/post-process/types.ts` — Step 接口
- `src/services/post-process/steps/*.ts` — 各步骤实现

### 修改
- `src/services/post-processor.ts` — 退化为 pipeline 构建 + re-export

### 测试
- 每个 Step 独立单元测试
- Pipeline 集成测试（步骤顺序、错误隔离）

## 收益

- **Depth**: 添加新步骤不改 pipeline 代码
- **Locality**: 每个步骤的 bug 集中在自己的文件
- **可测试**: 每个 Step 可独立验证

## 验收标准

- [ ] `postProcessTripPlan()` 内部使用 pipeline.run()
- [ ] 每个 Step 独立文件、独立测试
- [ ] 添加新 Step 不需要修改 pipeline.ts
- [ ] 现有测试通过
- [ ] 错误隔离：单个 Step 失败不阻塞后续 Step
