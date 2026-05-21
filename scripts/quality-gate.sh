#!/bin/bash
# 质量门禁脚本 — CI 和 Pre-commit 综合检查
#
# 检查项：
#   1. Lint (biome check)
#   2. Type Check (tsc --noEmit)
#   3. 测试质量扫描 (test-qa-check.sh)
#   4. 测试通过率检查
#   5. 覆盖率阈值检查
#
# 使用: bash scripts/quality-gate.sh [--strict]
#   --strict: 严格模式，任何警告都视为失败
#
# 退出码:
#   0 = 全部通过
#   1 = 存在阻塞性问题

set -uo pipefail

STRICT_MODE=false
if [[ "${1:-}" == "--strict" ]]; then
  STRICT_MODE=true
fi

echo "╔══════════════════════════════════════════════════════╗"
echo "║              质量门禁检查 (Quality Gate)             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

HAS_BLOCKER=false
HAS_WARNING=false

# ─── 1. Lint 检查 ──────────────────────────────────────
echo "━━━ 1/5 Lint 检查 ━━━"
if npx biome check . 2>/dev/null; then
  echo "✅ Lint 通过"
else
  echo "❌ Lint 失败"
  HAS_BLOCKER=true
fi
echo ""

# ─── 2. 类型检查 ───────────────────────────────────────
echo "━━━ 2/5 类型检查 ━━━"
if npx tsc --noEmit 2>/dev/null; then
  echo "✅ 类型检查通过"
else
  echo "❌ 类型检查失败"
  HAS_BLOCKER=true
fi
echo ""

# ─── 3. 测试质量扫描 ──────────────────────────────────
echo "━━━ 3/5 测试质量扫描 ━━━"
if bash scripts/test-qa-check.sh 2>/dev/null; then
  echo "✅ 测试质量扫描通过"
else
  if [ "$STRICT_MODE" = true ]; then
    echo "❌ 测试质量问题（严格模式）"
    HAS_BLOCKER=true
  else
    echo "⚠️ 测试质量问题（警告）"
    HAS_WARNING=true
  fi
fi
echo ""

# ─── 4. 测试通过率检查 ─────────────────────────────────
echo "━━━ 4/5 测试通过率检查 ━━━"
TEST_OUTPUT=$(npx vitest run --reporter=json 2>/dev/null || echo '{}')
PASS_RATE=$(echo "$TEST_OUTPUT" | jq -r '.numPassedTests // 0')
FAIL_RATE=$(echo "$TEST_OUTPUT" | jq -r '.numFailedTests // 0')
TOTAL_TESTS=$(echo "$TEST_OUTPUT" | jq -r '.numTotalTests // 0')

if [ "$TOTAL_TESTS" -gt 0 ]; then
  PASS_PERCENTAGE=$((PASS_RATE * 100 / TOTAL_TESTS))
  echo "📊 测试通过率: ${PASS_PERCENTAGE}% (${PASS_RATE}/${TOTAL_TESTS})"

  if [ "$FAIL_RATE" -gt 0 ]; then
    echo "❌ 存在 ${FAIL_RATE} 个失败测试"
    HAS_BLOCKER=true
  else
    echo "✅ 全部测试通过"
  fi
else
  echo "⚠️ 无法获取测试结果"
  HAS_WARNING=true
fi
echo ""

# ─── 5. 覆盖率阈值检查 ────────────────────────────────
echo "━━━ 5/5 覆盖率阈值检查 ━━━"
if npx vitest run --coverage 2>/dev/null; then
  echo "✅ 覆盖率阈值检查通过"
else
  echo "❌ 覆盖率未达阈值"
  HAS_BLOCKER=true
fi
echo ""

# ─── 汇总 ─────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo "║                    检查结果汇总                      ║"
echo "╚══════════════════════════════════════════════════════╝"

if [ "$HAS_BLOCKER" = true ]; then
  echo "❌ 质量门禁未通过 — 存在阻塞性问题"
  exit 1
elif [ "$HAS_WARNING" = true ]; then
  if [ "$STRICT_MODE" = true ]; then
    echo "❌ 质量门禁未通过 — 严格模式下存在警告"
    exit 1
  else
    echo "⚠️ 质量门禁通过（有警告）"
    exit 0
  fi
else
  echo "✅ 质量门禁全部通过"
  exit 0
fi
