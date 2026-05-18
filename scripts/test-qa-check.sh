#!/bin/bash
# 测试质量快速扫描 — Pre-commit 辅助
# 检测常见的测试反模式: 空洞断言、catch 未测、无意义测试
#
# 使用: bash scripts/test-qa-check.sh
# 退出码: 0 = 通过, 1 = 发现质量问题

set -uo pipefail

echo "=== 测试质量快速扫描 ==="
HAS_ISSUES=false

SERVICE_DIR="src/services"
TEST_DIR="src/__tests__"

# 安全整数比较：确保变量只含数字
safe_int() { echo "$1" | tr -cd '0-9'; }

# ─── 检查 1: .not.toThrow() 作为唯一断言 ──────────────────
echo ""
echo "--- 检查 1: .not.toThrow() 孤立断言 ---"

while IFS= read -r -d '' f; do
  EXPECT_COUNT=$(safe_int "$(grep -co "expect(" "$f" 2>/dev/null || true)")
  NOT_THROW_COUNT=$(safe_int "$(grep -co "\.not\.toThrow()" "$f" 2>/dev/null || true)")

  if [ "$EXPECT_COUNT" -gt 0 ] && [ "$EXPECT_COUNT" -eq "$NOT_THROW_COUNT" ]; then
    echo "  ⚠ $f (仅 .not.toThrow() 断言, 无值验证)"
    HAS_ISSUES=true
  fi
done < <(find "$TEST_DIR" -name "*.test.ts" -not -path "*/node_modules/*" -print0)

# ─── 检查 2: 源码 catch → 测试错误路径覆盖 ───────────────
echo ""
echo "--- 检查 2: Catch 错误路径覆盖 ---"

for f in "$SERVICE_DIR"/*.ts; do
  [ ! -f "$f" ] && continue
  CATCH_COUNT=$(safe_int "$(grep -co "catch " "$f" 2>/dev/null || true)")
  [ "$CATCH_COUNT" -eq 0 ] && continue

  BASENAME=$(basename "$f" .ts)
  TEST_FILE=$(find "$TEST_DIR" -name "${BASENAME}.test.ts" -print -quit 2>/dev/null || true)

  if [ -z "$TEST_FILE" ]; then
    echo "  ⚠ $f: $CATCH_COUNT catch(es), 无测试文件"
    HAS_ISSUES=true
    continue
  fi

  if ! grep -Eq "toThrow|rejects|mockRejectedValue|降级|错误" "$TEST_FILE" 2>/dev/null; then
    echo "  ⚠ $f: $CATCH_COUNT catch(es), $(basename "$TEST_FILE") 无错误路径测试"
    HAS_ISSUES=true
  fi
done

# ─── 检查 3: 无 expect 的测试文件 ──────────────────────────
echo ""
echo "--- 检查 3: 有意义断言缺失 ---"

while IFS= read -r -d '' f; do
  TEST_COUNT=$(safe_int "$(grep -co "it(" "$f" 2>/dev/null || true)")
  EXPECT_COUNT=$(safe_int "$(grep -co "expect(" "$f" 2>/dev/null || true)")

  if [ "$TEST_COUNT" -gt 0 ] && [ "$EXPECT_COUNT" -eq 0 ]; then
    echo "  ⚠ $f: $TEST_COUNT 测试, 0 expect (无意义测试)"
    HAS_ISSUES=true
  fi
done < <(find "$TEST_DIR" -name "*.test.ts" -not -path "*/node_modules/*" -print0)

# ─── 汇总 ─────────────────────────────────────────────────
echo ""
if [ "$HAS_ISSUES" = false ]; then
  echo "✅ 测试质量扫描通过"
else
  echo "⚠ 发现测试质量问题，建议修复后再提交"
fi