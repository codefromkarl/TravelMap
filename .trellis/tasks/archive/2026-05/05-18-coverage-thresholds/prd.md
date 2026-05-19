# 提升覆盖率阈值 + 补全低覆盖模块

## 现状

- 覆盖率阈值已配置为 lines:75/functions:70/branches:65/statements:75
- 大部分模块已达标，但仍有以下缺口：

| 文件 | 行覆盖 | 函数覆盖 | 分支覆盖 | 缺口 |
|-----|--------|---------|---------|------|
| `tools/geocode.ts` | 67.6% | 100% | **33.3%** | 行+分支 |
| `services/post-processor.ts` | 76.9% | 75.0% | **61.9%** | 分支 |
| `tools/restaurants.ts` | 82.3% | 100% | **33.3%** | 分支 |
| `tools/attractions.ts` | 83.6% | 100% | **55.6%** | 分支 |
| `services/attraction-service.ts` | 91.4% | 100% | **46.2%** | 分支 |
| `services/xhs/adapters/tikhub.ts` | 92.1% | 100% | **20.0%** | 分支 |

## 目标

所有 src/ 模块行覆盖 ≥ 75%，分支覆盖 ≥ 65%。

## 任务

### 1. geocode.ts — 行覆盖 67.6% → 75%+

- [ ] 补充 execute 中 API 降级路径测试
- [ ] 补充无效坐标/空结果处理测试

### 2. post-processor.ts — 分支覆盖 61.9% → 65%+

- [ ] 补充 budget 计算中 travelers 参数缺失路径
- [ ] 补充 actionLinks 生成失败降级路径

### 3. tool 层分支覆盖

- [ ] restaurants.ts — 补充 cuisine/mealType 分支
- [ ] attractions.ts — 补充 preferences 筛选分支

### 4. service 层分支覆盖

- [ ] attraction-service.ts — 补充 UGC 融合失败降级路径
- [ ] tikhub.ts — 补充 API 响应格式变异处理

## 验收标准

- [ ] `npm run test:coverage` 通过，无阈值突破
- [ ] 所有新增测试通过
- [ ] lint + typecheck 通过
