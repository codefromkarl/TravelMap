#!/usr/bin/env bash
set -euo pipefail

# TravelAgent — Deploy to Cloudflare Pages
# Usage:
#   bash scripts/deploy.sh          → 部署到 production
#   bash scripts/deploy.sh preview  → 部署到 preview

# 安全地 source ~/.bashrc（非交互式 shell 中 PS1 等变量可能未定义）
if [[ -f ~/.bashrc ]]; then
  set +u
  source ~/.bashrc 2>/dev/null || true
  set -u
fi

# 代理环境绕过（Cloudflare API 走直连更快）
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy

export CLOUDFLARE_API_TOKEN="${TRAVEL_DEPLOY_TOKEN:-${CLOUDFRAME_API_KEY:-}}"
if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
  echo "❌ 请设置 TRAVEL_DEPLOY_TOKEN 或 CLOUDFRAME_API_KEY 环境变量"
  exit 1
fi
export CLOUDFLARE_ACCOUNT_ID="df7eff124c99996394244b7e94324ffc"

PROJECT="travel-agent"
BRANCH="main"
DIR="web"
EXCLUDE_FILES=(
  "config.local.example.js"
  "_headers.bak"
)

if [[ "${1:-}" == "preview" ]]; then
  BRANCH="preview"
fi

# ─── 构建干净的部署目录（排除敏感文件）──────────────────
DEPLOY_DIR=$(mktemp -d)
trap "rm -rf $DEPLOY_DIR" EXIT

echo "📦 准备部署目录..."
rsync -a --exclude='node_modules' "$DIR/" "$DEPLOY_DIR/"

for f in "${EXCLUDE_FILES[@]}"; do
  if [[ -f "$DEPLOY_DIR/$f" ]]; then
    echo "   ⛔ 排除: $f"
    rm "$DEPLOY_DIR/$f"
  fi
done

# 寻找 wrangler：优先本地 node_modules，其次全局，最后回退 npx
WRANGLER=""
if [[ -x "./node_modules/.bin/wrangler" ]]; then
  WRANGLER="./node_modules/.bin/wrangler"
elif command -v wrangler &>/dev/null; then
  WRANGLER="$(command -v wrangler)"
else
  WRANGLER="npx wrangler"
fi

echo "🚀 Deploying to Cloudflare Pages..."
echo "   Project: $PROJECT"
echo "   Branch:  $BRANCH"
echo "   Source:  $DIR → $DEPLOY_DIR (cleaned)"
echo "   Wrangler: $WRANGLER"
echo ""

$WRANGLER pages deploy "$DEPLOY_DIR" \
  --project-name="$PROJECT" \
  --branch="$BRANCH"

echo ""
echo "✅ 部署完成!"
echo "   Production: https://travel-agent-ebl.pages.dev"
echo "   Custom:     https://travel.codefromkarl.xyz (需要完成域名绑定)"

# ─── 部署后健康检查 ───────────────────────────────────────

echo ""
echo "🔍 等待 CDN 缓存更新 (5s)..."
sleep 5

if [[ -f "scripts/health-check.sh" ]]; then
  echo ""
  bash scripts/health-check.sh "$BRANCH" || {
    echo "⚠️  健康检查失败，请手动验证: https://travel-agent-ebl.pages.dev"
    exit 1
  }
else
  echo "⚠️  跳过健康检查 (scripts/health-check.sh 不存在)"
fi
