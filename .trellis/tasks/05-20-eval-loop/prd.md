# AI 评估闭环体系

## 概述

本项目实现了一套完整的 AI 评估闭环体系，用于持续监控和提升旅行规划 Agent 的输出质量。

## 架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI 评估闭环架构                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  评估    │───▶│  检测    │───▶│  归因    │───▶│  优化    │              │
│  │  Runner  │    │ Regression│    │ Attribution│   │ Optimization│            │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│       │                │                │                │                  │
│       ▼                ▼                ▼                ▼                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ 多维度   │    │ 基线对比 │    │ 根因分析 │    │ Prompt   │              │
│  │ 评估器   │    │ 趋势分析 │    │ 建议生成 │    │ 自动调整 │              │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        基线管理器 (Baseline Manager)                  │  │
│  │  - 基线保存/加载                                                      │  │
│  │  - 历史记录管理                                                       │  │
│  │  - 回归检测                                                           │  │
│  │  - 趋势分析                                                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 评估维度

### 1. 结构维度 (25%)

| 子维度 | 权重 | 必须通过 | 说明 |
|--------|------|----------|------|
| 结构完整性 | 15% | ✅ | 必填字段、日期格式、天数连续性 |
| 格式规范性 | 10% | ❌ | 标题结构、列表结构、分段展示 |

### 2. 语义维度 (30%)

| 子维度 | 权重 | 必须通过 | 说明 |
|--------|------|----------|------|
| 逻辑连贯性 | 15% | ✅ | 景点顺序、时间安排、衔接自然 |
| 需求相关性 | 15% | ✅ | 主题契合、预算匹配、人群适配 |

### 3. 实用维度 (30%)

| 子维度 | 权重 | 必须通过 | 说明 |
|--------|------|----------|------|
| 可执行性 | 15% | ✅ | 景点真实、时间安排、交通建议 |
| 预算合理性 | 8% | ❌ | 费用估算、日均预算 |
| 时间安排合理性 | 7% | ❌ | 每天行程时长 |

### 4. 安全维度 (15%)

| 子维度 | 权重 | 必须通过 | 说明 |
|--------|------|----------|------|
| 内容安全性 | 10% | ✅ | 无危险建议、无违法内容 |
| 人群适配性 | 5% | ❌ | 老人/儿童/孕妇/行动不便者适配 |

## 核心组件

### 1. 评估运行器 (EvalRunner)

```typescript
import { EvalRunner } from "./evaluation/runner.js";

const runner = new EvalRunner({
  enableLLM: true,        // 启用 LLM 评估
  detectRegression: true, // 检测回归
  generateAttribution: true, // 生成归因
});

// 单场景评估
const result = await runner.run(input, output, context);

// 批量评估
const batchResult = await runner.runBatch(scenarios);
```

### 2. 基线管理器 (BaselineManager)

```typescript
import { BaselineManager } from "./evaluation/baseline-manager.js";

const manager = new BaselineManager();

// 创建基线
const baseline = manager.createBaseline(reports, "v1.0 基线");

// 检测回归
const regressions = manager.detectRegressions(newReports);

// 获取趋势
const trends = manager.getTrends();
const stats = manager.getScoreStats();
```

### 3. 归因分析器 (AttributionAnalyzer)

```typescript
import { AttributionAnalyzer } from "./evaluation/attribution-analyzer.js";

const analyzer = new AttributionAnalyzer();

// 分析单个报告
const attribution = analyzer.analyzeReport(report);

// 批量分析
const batchResult = analyzer.analyzeBatch(reports);
console.log(batchResult.summary);
```

### 4. 优化闭环 (OptimizationLoop)

```typescript
import { OptimizationLoop, DefaultOptimizationExecutor } from "./evaluation/optimization-loop.js";

const loop = new OptimizationLoop(
  new DefaultOptimizationExecutor(),
  {
    maxIterations: 5,
    targetPassRate: 1.0,
    targetScore: 0.8,
  },
);

const result = await loop.run(
  evaluateFn,
  generateFn,
  context,
);
```

## 使用流程

### 1. 初始评估

```bash
# 运行评估测试
npm run eval:loop

# 查看报告
cat eval-results/reports/summary-*.md
```

### 2. 建立基线

```bash
# 运行评估并更新基线
npm run eval:loop:baseline
```

### 3. 持续监控

```bash
# CI 模式运行
npm run eval:loop:ci

# 查看回归检测结果
cat eval-results/reports/regression-*.json
```

### 4. 自动优化

```bash
# 启动优化闭环
npm run eval:loop:optimize
```

## 评估报告格式

### 单场景报告

```json
{
  "id": "eval-xxx",
  "timestamp": "2025-05-20T10:00:00Z",
  "input": "帮我规划北京三日游",
  "output": "...",
  "overallScore": 0.85,
  "passed": true,
  "dimensions": [
    {
      "dimensionId": "structure",
      "score": 0.9,
      "passed": true,
      "checks": [...]
    }
  ],
  "failedRequired": [],
  "allSuggestions": [],
  "metadata": {
    "model": "gpt-4o",
    "provider": "openai",
    "duration": 1500
  }
}
```

### 批量报告

```json
{
  "runId": "batch-xxx",
  "timestamp": "2025-05-20T10:00:00Z",
  "overallScore": 0.82,
  "passRate": 0.8,
  "passed": true,
  "regressions": [],
  "reportDir": "eval-results/reports/batch-xxx"
}
```

## 回归检测

回归检测基于基线对比：

1. **总体退化**: 当前得分 < 基线得分 - 10%
2. **维度退化**: 单维度得分 < 基线维度得分 - 15%
3. **严重程度**:
   - `warning`: 退化 10-25%
   - `error`: 退化 > 25%

## 归因分析

归因分析识别失败的根本原因：

1. **失败分类**: 按维度分组失败项
2. **根因推断**: 基于检查项推断根本原因
3. **建议生成**: 生成可操作的改进建议
4. **优先级排序**: 按影响范围和修复难度排序

## 设计原则

1. **独立性**: 每个维度独立评估，不相互影响
2. **无偏见**: 基于客观标准，不依赖主观判断
3. **全面覆盖**: 从结构、语义、实用性、安全性多角度评估
4. **可追溯**: 记录每次评估的详细结果和优化历史
5. **自动化**: 支持自动回归检测和优化闭环

## 文件结构

```
src/evaluation/
├── index.ts                    # 入口文件
├── dimensions.ts               # 维度定义
├── dimensions/
│   ├── structure.ts            # 结构维度评估器
│   ├── semantic.ts             # 语义维度评估器
│   ├── practical.ts            # 实用维度评估器
│   └── safety.ts               # 安全维度评估器
├── baseline-manager.ts         # 基线管理器
├── attribution-analyzer.ts     # 归因分析器
├── optimization-loop.ts        # 优化闭环
└── runner.ts                   # 评估运行器

scripts/
├── eval-loop.sh                # CI 评估脚本
└── analyze-attribution.mjs     # 归因分析脚本

eval-results/
├── baseline.json               # 基线文件
├── history.json                # 历史记录
├── golden-*.json               # 评估报告
└── reports/
    ├── summary-*.md            # 汇总报告
    ├── regression-*.json       # 回归报告
    └── attribution-*.json      # 归因报告
```

## 最佳实践

1. **定期建立基线**: 每次重大更新后运行 `npm run eval:loop:baseline`
2. **监控回归**: CI 中启用 `npm run eval:loop:ci`
3. **分析失败**: 查看归因报告，理解失败原因
4. **迭代优化**: 根据建议调整 prompt 或参数
5. **持续改进**: 完善评估维度和检查项
