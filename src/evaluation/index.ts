/**
 * 评估体系入口
 *
 * 导出所有评估组件
 */

// 归因分析
export {
  AttributionAnalyzer,
  type AttributionResult,
  type FailureCategory,
  type PriorityAction,
  type Recommendation,
  type RootCause,
} from "./attribution-analyzer.js";
// 基线管理
export {
  type Baseline,
  BaselineManager,
  type HistoryEntry,
  type Regression,
  type ScenarioBaseline,
  type ScoreStats,
  type TrendData,
} from "./baseline-manager.js";
export { evaluateExperience } from "./dimensions/experience.js";
export { evaluatePractical } from "./dimensions/practical.js";
export { evaluateSafety } from "./dimensions/safety.js";
export { evaluateSemantic } from "./dimensions/semantic.js";
// 维度评估器
export { evaluateStructure } from "./dimensions/structure.js";
// 核心类型
export type {
  CheckResult,
  DimensionCategory,
  DimensionResult,
  EvalContext,
  EvalDimension,
  EvalReport,
} from "./dimensions.js";
// 维度定义
export {
  EVAL_DIMENSIONS,
  getDimensionsByCategory,
  getRequiredDimensions,
  getTotalWeight,
} from "./dimensions.js";

// 优化闭环
export {
  type AppliedOptimization,
  DefaultOptimizationExecutor,
  type OptimizationConfig,
  type OptimizationContext,
  type OptimizationExecutor,
  type OptimizationIteration,
  OptimizationLoop,
  type OptimizationOutput,
  type OptimizationResult,
} from "./optimization-loop.js";

// 运行器
export {
  type BatchRunResult,
  EvalRunner,
  type RunnerConfig,
  type RunResult,
} from "./runner.js";
