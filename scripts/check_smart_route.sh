#!/bin/bash
# Trellis Check 智能路由脚本 — TravelAgent (TypeScript)
# 根据变更规模自动选择检查深度
#
# 返回码：
#   0 = 通过（lint + test 全绿，微小/小型改动无需 check 代理）
#   1 = 未通过（lint/test 失败）
#   2 = 需要启动 check 代理（中等/大型改动）

set -euo pipefail

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --staged) STAGED=true ;;
    esac
done

DRY_RUN="${DRY_RUN:-false}"
STAGED="${STAGED:-false}"

# --- 1. 获取变更统计 ---

GIT_DIFF_CMD="git diff"
GIT_DIFF_NAME_CMD="git diff --name-only --diff-filter=ACMRT"
if $STAGED; then
    GIT_DIFF_CMD="git diff --cached"
    GIT_DIFF_NAME_CMD="git diff --cached --name-only --diff-filter=ACMRT"
fi

CHANGED_FILES=$($GIT_DIFF_NAME_CMD HEAD 2>/dev/null || true)
if [[ -z "$CHANGED_FILES" ]]; then
    echo "✅ 没有变更文件"
    exit 0
fi

FILE_COUNT=$(echo "$CHANGED_FILES" | wc -l)
DIFF_LINES=$($GIT_DIFF_CMD HEAD 2>/dev/null | wc -l || echo "0")

# 只统计项目代码文件
CODE_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(ts|js|json)$' | grep -v '^\.trellis/' | grep -v 'node_modules' || true)
CODE_FILE_COUNT=$(echo "$CODE_FILES" | sed '/^$/d' | wc -l)

# --- 2. 变更分类 ---

echo "=== Trellis Check 智能路由 ==="
echo "变更文件总数: $FILE_COUNT"
echo "代码文件数:   $CODE_FILE_COUNT"
echo "Diff 总行数:  $DIFF_LINES"
echo

SCOPE=""
if [[ "$DIFF_LINES" -lt 30 && "$CODE_FILE_COUNT" -le 1 ]]; then
    SCOPE="tiny"
    echo "📏 规模: 微小（< 30 行，单文件）"
elif [[ "$DIFF_LINES" -lt 100 && "$CODE_FILE_COUNT" -le 2 ]]; then
    SCOPE="small"
    echo "📏 规模: 小型（30-100 行，1-2 文件）"
elif [[ "$DIFF_LINES" -lt 300 && "$CODE_FILE_COUNT" -le 4 ]]; then
    SCOPE="medium"
    echo "📏 规模: 中型（100-300 行，2-4 文件）"
else
    SCOPE="large"
    echo "📏 规模: 大型（> 300 行或 > 4 文件）"
fi

# --- 3. 执行检查 ---

check_ts() {
    echo
    echo "--- TypeScript 检查 ---"

    if $DRY_RUN; then
        echo "[DRY-RUN] npx biome check . && npx tsc --noEmit"
    else
        npx biome check --write . || return 1
        npx tsc --noEmit || return 1
    fi
}

check_tests() {
    echo
    echo "--- 测试 ---"

    if $DRY_RUN; then
        echo "[DRY-RUN] npx vitest run"
    else
        npx vitest run || return 1
    fi
}

case "$SCOPE" in
    tiny)
        check_ts
        echo
        echo "✅ 微小改动检查通过。无需启动 check 代理。"
        exit 0
        ;;

    small)
        check_ts
        check_tests
        echo
        echo "✅ 小型改动检查通过。无需启动 check 代理。"
        exit 0
        ;;

    medium)
        check_ts
        check_tests
        echo
        echo "⚠️  中型改动 — 建议启动 check 代理（精简模式）"
        exit 2
        ;;

    large)
        check_ts
        check_tests
        echo
        echo "⚠️  大型改动 — 必须启动 check 代理（完整模式）"
        exit 2
        ;;
esac
