#!/bin/bash
#
# Impact Testing — 根据 git diff 智能选择测试文件
#
# 用法：
#   npm run test:impact              # 只跑受影响的测试
#   npm run test:impact -- --all     # 跑全量测试
#   npm run test:impact -- --dry-run # 只显示会跑哪些测试，不执行
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 解析参数
RUN_ALL=false
DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --all) RUN_ALL=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

# 获取项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 如果是 --all，直接跑全量
if [ "$RUN_ALL" = true ]; then
  echo -e "${GREEN}▶ 跑全量测试${NC}"
  npx vitest run --config vitest.config.ts
  exit 0
fi

# 获取变更文件列表
# 优先级：暂存区 > 工作区 > 最近一次 commit
if git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -q .; then
  CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)
  echo -e "${YELLOW}▶ 检测暂存区变更${NC}"
elif git diff --name-only --diff-filter=ACMR 2>/dev/null | grep -q .; then
  CHANGED_FILES=$(git diff --name-only --diff-filter=ACMR)
  echo -e "${YELLOW}▶ 检测工作区变更${NC}"
else
  CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || echo "")
  echo -e "${YELLOW}▶ 检测最近一次 commit 变更${NC}"
fi

if [ -z "$CHANGED_FILES" ]; then
  echo -e "${GREEN}✔ 没有变更文件，跳过测试${NC}"
  exit 0
fi

echo "变更文件:"
echo "$CHANGED_FILES" | sed 's/^/  /'

# 映射规则：源文件 → 测试文件
TEST_FILES=""

while IFS= read -r file; do
  # 跳过非 src/ 目录的文件
  if [[ ! "$file" =~ ^src/ ]]; then
    continue
  fi

  # 跳过测试文件本身
  if [[ "$file" =~ \.test\.ts$ ]] || [[ "$file" =~ \.spec\.ts$ ]]; then
    continue
  fi

  # 跳过类型定义文件
  if [[ "$file" =~ \.d\.ts$ ]] || [[ "$file" =~ /types/ ]]; then
    continue
  fi

  # 映射规则 1：services/x.ts → unit/services/x.test.ts
  if [[ "$file" =~ ^src/services/(.+)\.ts$ ]]; then
    service_path="${BASH_REMATCH[1]}"
    test_file="src/__tests__/unit/services/${service_path}.test.ts"
    if [ -f "$test_file" ]; then
      TEST_FILES="$TEST_FILES $test_file"
    fi
  fi

  # 映射规则 2：tools/x.ts → unit/tools/x.test.ts
  if [[ "$file" =~ ^src/tools/(.+)\.ts$ ]]; then
    tool_path="${BASH_REMATCH[1]}"
    test_file="src/__tests__/unit/tools/${tool_path}.test.ts"
    if [ -f "$test_file" ]; then
      TEST_FILES="$TEST_FILES $test_file"
    fi
  fi

  # 映射规则 3：agent/x.ts → unit/agent/x.test.ts
  if [[ "$file" =~ ^src/agent/(.+)\.ts$ ]]; then
    agent_path="${BASH_REMATCH[1]}"
    test_file="src/__tests__/unit/agent/${agent_path}.test.ts"
    if [ -f "$test_file" ]; then
      TEST_FILES="$TEST_FILES $test_file"
    fi
  fi

  # 映射规则 4：依赖链 — 改了 service，也跑相关 tool 测试
  if [[ "$file" =~ ^src/services/ ]]; then
    # 查找引用这个 service 的 tool 文件
    service_name=$(basename "$file" .ts)
    for tool_file in src/tools/*.ts; do
      if grep -q "from.*${service_name}" "$tool_file" 2>/dev/null; then
        tool_name=$(basename "$tool_file" .ts)
        test_file="src/__tests__/unit/tools/${tool_name}.test.ts"
        if [ -f "$test_file" ]; then
          TEST_FILES="$TEST_FILES $test_file"
        fi
      fi
    done
  fi

  # 映射规则 5：改了 mocks，跑所有测试
  if [[ "$file" =~ ^src/__tests__/mocks/ ]]; then
    echo -e "${YELLOW}⚠ 检测到 mocks 变更，建议跑全量测试${NC}"
    echo "  使用 npm run test:impact -- --all"
  fi

done <<< "$CHANGED_FILES"

# 去重
TEST_FILES=$(echo "$TEST_FILES" | tr ' ' '\n' | sort -u | tr '\n' ' ')

if [ -z "$TEST_FILES" ]; then
  echo -e "${GREEN}✔ 没有找到受影响的测试文件${NC}"
  exit 0
fi

echo ""
echo -e "${GREEN}▶ 受影响的测试文件:${NC}"
echo "$TEST_FILES" | tr ' ' '\n' | sed 's/^/  /'

# 执行测试
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}▶ [DRY RUN] 不执行测试${NC}"
  exit 0
fi

echo ""
echo -e "${GREEN}▶ 执行测试...${NC}"
npx vitest run --config vitest.config.ts $TEST_FILES
