#!/usr/bin/env bash
set -euo pipefail

# TravelAgent — Deploy to Cloudflare Pages
# Usage:
#   bash scripts/deploy.sh          → 部署到 production
#   bash scripts/deploy.sh preview  → 部署到 preview

[[ -f ~/.bashrc ]] && source ~/.bashrc

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

if [[ "${1:-}" == "preview" ]]; then
  BRANCH="preview"
fi

echo "🚀 Deploying to Cloudflare Pages..."
echo "   Project: $PROJECT"
echo "   Branch:  $BRANCH"
echo "   Dir:     $DIR"
echo ""

npx wrangler pages deploy "$DIR" \
  --project-name="$PROJECT" \
  --branch="$BRANCH" \
  --commit-dirty=true

echo ""
echo "✅ Done!"
echo "   Production: https://travel-agent-ebl.pages.dev"
echo "   Custom:     https://travel.codefromkarl.xyz (需要完成域名绑定)"
