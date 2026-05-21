#!/bin/bash
# AI 评估闭环 CI 脚本
#
# 功能：
#   1. 运行评估测试
#   2. 检测回归
#   3. 生成报告
#   4. 失败时触发归因分析
#
# 使用：
#   bash scripts/eval-loop.sh [--baseline] [--optimize] [--ci]

set -uo pipefail

# ─── 配置 ──────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EVAL_DIR="$PROJECT_ROOT/eval-results"
REPORT_DIR="$EVAL_DIR/reports"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── 参数解析 ──────────────────────────────────────────────

UPDATE_BASELINE=false
ENABLE_OPTIMIZE=false
CI_MODE=false
SCENARIO_FILTER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --baseline)
      UPDATE_BASELINE=true
      shift
      ;;
    --optimize)
      ENABLE_OPTIMIZE=true
      shift
      ;;
    --ci)
      CI_MODE=true
      shift
      ;;
    --scenario=*)
      SCENARIO_FILTER="${1#*=}"
      shift
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

# ─── 辅助函数 ──────────────────────────────────────────────

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# ─── 前置检查 ──────────────────────────────────────────────

log_info "AI 评估闭环开始"
log_info "项目根目录: $PROJECT_ROOT"

# 检查 API Key
if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  log_error "未找到 LLM API Key，请设置 OPENAI_API_KEY、DEEPSEEK_API_KEY 或 ANTHROPIC_API_KEY"
  exit 1
fi

# 确保目录存在
mkdir -p "$EVAL_DIR"
mkdir -p "$REPORT_DIR"

# ─── 运行评估测试 ──────────────────────────────────────────

log_info "运行评估测试..."

cd "$PROJECT_ROOT"

# 运行 AI E2E 测试
TEST_OUTPUT=$(AI_E2E=true npm run test:ai-e2e 2>&1)
TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
  log_success "评估测试通过"
else
  log_error "评估测试失败"
  echo "$TEST_OUTPUT"
fi

# ─── 解析测试结果 ──────────────────────────────────────────

# 找到最新的评估报告
LATEST_REPORT=$(ls -t "$EVAL_DIR"/golden-*.json 2>/dev/null | head -1)

if [ -z "$LATEST_REPORT" ]; then
  log_error "未找到评估报告"
  exit 1
fi

log_info "最新报告: $LATEST_REPORT"

# 解析报告
TOTAL_SCENARIOS=$(jq '.totalScenarios' "$LATEST_REPORT")
PASSED_SCENARIOS=$(jq '.passed' "$LATEST_REPORT")
FAILED_SCENARIOS=$(jq '.failed' "$LATEST_REPORT")
PASS_RATE=$(echo "scale=2; $PASSED_SCENARIOS / $TOTAL_SCENARIOS * 100" | bc)

log_info "场景总数: $TOTAL_SCENARIOS"
log_info "通过: $PASSED_SCENARIOS"
log_info "失败: $FAILED_SCENARIOS"
log_info "通过率: ${PASS_RATE}%"

# ─── 回归检测 ──────────────────────────────────────────────

BASELINE_FILE="$EVAL_DIR/baseline.json"

if [ -f "$BASELINE_FILE" ]; then
  log_info "检测回归..."

  # 比较当前结果与基线
  BASELINE_PASSED=$(jq '.overallThreshold' "$BASELINE_FILE")
  CURRENT_SCORE=$(jq '.overallScore // 0' "$LATEST_REPORT")

  if (( $(echo "$CURRENT_SCORE < $BASELINE_PASSED" | bc -l) )); then
    log_warn "检测到分数退化: 基线=$BASELINE_PASSED, 当前=$CURRENT_SCORE"

    # 生成回归报告
    REGRESSION_REPORT="$REPORT_DIR/regression-$(date +%Y%m%d-%H%M%S).json"
    cat > "$REGRESSION_REPORT" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "type": "regression",
  "baseline_score": $BASELINE_PASSED,
  "current_score": $CURRENT_SCORE,
  "degradation": $(echo "$BASELINE_PASSED - $CURRENT_SCORE" | bc),
  "report": "$LATEST_REPORT"
}
EOF
    log_warn "回归报告: $REGRESSION_REPORT"
  else
    log_success "未检测到回归"
  fi
else
  log_warn "未找到基线文件，跳过回归检测"
fi

# ─── 归因分析 ──────────────────────────────────────────────

if [ $TEST_EXIT_CODE -ne 0 ]; then
  log_info "运行归因分析..."

  # 生成归因报告
  ATTRIBUTION_REPORT="$REPORT_DIR/attribution-$(date +%Y%m%d-%H%M%S).json"

  # 这里可以调用 Node.js 脚本进行更详细的归因分析
  # node scripts/analyze-attribution.js "$LATEST_REPORT" > "$ATTRIBUTION_REPORT"

  log_info "归因报告: $ATTRIBUTION_REPORT"
fi

# ─── 更新基线 ──────────────────────────────────────────────

if [ "$UPDATE_BASELINE" = true ] && [ $TEST_EXIT_CODE -eq 0 ]; then
  log_info "更新基线..."

  cp "$LATEST_REPORT" "$BASELINE_FILE"
  log_success "基线已更新"
fi

# ─── 优化闭环 ──────────────────────────────────────────────

if [ "$ENABLE_OPTIMIZE" = true ] && [ $TEST_EXIT_CODE -ne 0 ]; then
  log_info "启动优化闭环..."

  # 这里可以调用优化脚本
  # node scripts/optimize.js "$LATEST_REPORT"

  log_info "优化完成"
fi

# ─── 生成汇总报告 ──────────────────────────────────────────

SUMMARY_FILE="$REPORT_DIR/summary-$(date +%Y%m%d-%H%M%S).md"

cat > "$SUMMARY_FILE" << EOF
# AI 评估报告

**时间**: $(date '+%Y-%m-%d %H:%M:%S')
**状态**: $([ $TEST_EXIT_CODE -eq 0 ] && echo "✅ 通过" || echo "❌ 失败")

## 概览

| 指标 | 值 |
|------|-----|
| 场景总数 | $TOTAL_SCENARIOS |
| 通过 | $PASSED_SCENARIOS |
| 失败 | $FAILED_SCENARIOS |
| 通过率 | ${PASS_RATE}% |

## 失败场景

$(jq -r '.scenarios[] | select(.passed == false) | "- **\(.id)**: \(.error // "未通过验证")"' "$LATEST_REPORT" 2>/dev/null || echo "无")

## 建议

$(if [ $TEST_EXIT_CODE -ne 0 ]; then
  echo "1. 检查失败场景的具体原因"
  echo "2. 运行归因分析: \`node scripts/analyze-attribution.js $LATEST_REPORT\`"
  echo "3. 根据建议优化 prompt 或参数"
else
  echo "所有测试通过，无需优化。"
fi)

---
*报告由 AI 评估闭环系统自动生成*
EOF

log_info "汇总报告: $SUMMARY_FILE"

# ─── CI 模式处理 ──────────────────────────────────────────

if [ "$CI_MODE" = true ]; then
  # 输出 GitHub Actions 格式的结果
  if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo "::error::AI 评估测试失败，通过率: ${PASS_RATE}%"
    echo "::warning::请检查归因报告并修复问题"
  fi

  # 上传 artifact（如果在 GitHub Actions 中）
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "评估结果将作为 CI artifact 上传"
  fi
fi

# ─── 退出 ──────────────────────────────────────────────────

exit $TEST_EXIT_CODE
