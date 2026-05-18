#!/usr/bin/env bash
#
# 架构守卫：禁止在 services/ 层使用裸 fetch
#
# 用途：pre-commit 钩子或 CI 质量门禁
# 规则：
#   - src/services/*.ts 中不允许直接使用 `fetch(`（必须走 http-client.ts）
#   - http-client.ts 自身除外
#   - 注释中包含 "skip-guard" 的行除外（用于特殊场景）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "🔍 [Guard] 检查 services/ 层是否使用裸 fetch..."

# 查找 services/ 中直接使用 fetch( 的行（排除 http-client.ts 和含 skip-guard 注释的行）
OFFENDERS=$(rg "^[^/]*\bfetch\(" "${REPO_ROOT}/src/services/" --type ts \
  | grep -v "http-client.ts" \
  | grep -v "skip-guard" \
  || true)

if [ -n "$OFFENDERS" ]; then
  echo "❌ [Guard] 发现 services/ 层直接使用裸 fetch，请改用 http-client.ts："
  echo ""
  echo "$OFFENDERS"
  echo ""
  echo "如需例外，在该行末尾添加注释 // skip-guard"
  exit 1
fi

echo "✅ [Guard] services/ 层无裸 fetch，通过"
