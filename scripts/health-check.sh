#!/bin/bash
# TravelAgent — 线上健康检查脚本
#
# Usage:
#   bash scripts/health-check.sh              # 检查 production
#   bash scripts/health-check.sh preview      # 检查 preview
#   bash scripts/health-check.sh <URL>        # 检查自定义 URL
#
# 返回码：
#   0 = 所有检查通过
#   1 = 检查失败

set -euo pipefail

# ─── URL 解析 ──────────────────────────────────────────────

PROD_URL="https://travel-agent-ebl.pages.dev"
PREVIEW_URL="https://preview.travel-agent-ebl.pages.dev"

case "${1:-production}" in
  production|prod)
    BASE_URL="$PROD_URL"
    ENV_NAME="Production"
    ;;
  preview)
    BASE_URL="$PREVIEW_URL"
    ENV_NAME="Preview"
    ;;
  http*|https*)
    BASE_URL="$1"
    ENV_NAME="Custom"
    ;;
  *)
    echo "Usage: $0 [production|preview|<URL>]"
    exit 1
    ;;
esac

echo "=== 线上健康检查 ==="
echo "环境: $ENV_NAME"
echo "URL:  $BASE_URL"
echo ""

ERRORS=0

# ─── 1. 页面可访问 ──────────────────────────────────────────

echo -n "1. 页面可访问... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -L "$BASE_URL/index.html")
if [[ "$STATUS" == "200" ]]; then
  echo "✅ HTTP $STATUS"
else
  echo "❌ HTTP $STATUS"
  ERRORS=$((ERRORS + 1))
fi

# ─── 2. API 端点响应 (OPTIONS preflight) ────────────────────

echo -n "2. API 端点响应... "
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X OPTIONS -L \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  "$BASE_URL/api/chat")
if [[ "$API_STATUS" == "204" || "$API_STATUS" == "200" ]]; then
  echo "✅ HTTP $API_STATUS"
else
  echo "⚠️  HTTP $API_STATUS (可能需要认证)"
fi

# ─── 3. 静态资源加载 ────────────────────────────────────────

echo -n "3. 静态资源加载... "
JS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/modules/context.js")
if [[ "$JS_STATUS" == "200" ]]; then
  echo "✅ HTTP $JS_STATUS"
else
  echo "❌ HTTP $JS_STATUS"
  ERRORS=$((ERRORS + 1))
fi

# ─── 4. CSS 加载 ────────────────────────────────────────────

echo -n "4. CSS 加载... "
CSS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/styles/main.css")
if [[ "$CSS_STATUS" == "200" ]]; then
  echo "✅ HTTP $CSS_STATUS"
else
  echo "❌ HTTP $CSS_STATUS"
  ERRORS=$((ERRORS + 1))
fi

# ─── 5. 认证端点 ────────────────────────────────────────────

echo -n "5. 认证端点... "
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/api/auth/status")
if [[ "$AUTH_STATUS" == "200" ]]; then
  echo "✅ HTTP $AUTH_STATUS"
else
  echo "⚠️  HTTP $AUTH_STATUS (可能需要登录)"
fi

# ─── 6. 响应时间 ────────────────────────────────────────────

echo -n "6. 响应时间... "
TOTAL_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$BASE_URL/index.html")
TIME_MS=$(echo "$TOTAL_TIME * 1000" | bc | cut -d. -f1)
if [[ "$TIME_MS" -lt 3000 ]]; then
  echo "✅ ${TIME_MS}ms"
else
  echo "⚠️  ${TIME_MS}ms (较慢)"
fi

# ─── 结果 ────────────────────────────────────────────────────

echo ""
if [[ "$ERRORS" -eq 0 ]]; then
  echo "✅ 所有检查通过"
  exit 0
else
  echo "❌ $ERRORS 项检查失败"
  exit 1
fi
