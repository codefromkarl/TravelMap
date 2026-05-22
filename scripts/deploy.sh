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

# ─── 构建 _worker.js（Direct Upload 项目必须显式构建 Functions）───
echo "🔧 构建 Pages Functions → _worker.js..."
WORKER_BUILD_DIR=$(mktemp -d)
if wrangler pages functions build "$DIR/functions" --outdir="$WORKER_BUILD_DIR" 2>&1; then
  cp "$WORKER_BUILD_DIR/index.js" "$DEPLOY_DIR/_worker.js"
  echo "   ✅ _worker.js 已生成"
else
  echo "   ⚠️ Functions 构建失败，跳过 _worker.js"
fi
rm -rf "$WORKER_BUILD_DIR"

# ─── 内容哈希：为 JS/CSS 文件生成 hash 文件名 ──────────────
echo "🔒 生成内容哈希文件名..."
node scripts/hash-assets.js "$DEPLOY_DIR" 2>&1 || echo "   ⚠️ 哈希生成失败，使用原始文件名"

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

# ─── 部署后缓存清理 ───────────────────────────────────────
echo ""
echo "🧹 清理 Cloudflare CDN 缓存..."
ZONE_ID="c404bfd5abf91163482f9a15dc1716f2"
purge_resp=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"purge_everything":true}')
if echo "$purge_resp" | grep -q '"success":true'; then
  echo "   ✅ CDN 缓存已清理"
else
  echo "   ⚠️ 缓存清理失败（可能缺少权限），用户需 Ctrl+Shift+R 强制刷新"
fi

# ─── 部署后健康检查 ───────────────────────────────────────

echo ""
echo "🔍 等待 CDN 更新 (5s)..."
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
