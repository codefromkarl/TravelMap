#!/usr/bin/env bash
set -euo pipefail

# TravelAgent — Deploy to Cloudflare Pages
# Usage:
#   bash scripts/deploy.sh          → 部署到 production
#   bash scripts/deploy.sh preview  → 部署到 preview
#   bash scripts/deploy.sh --artifact <dir> --branch <main|preview|pr-N>

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)"
CALLER_DIRECTORY="$PWD"

usage() {
  echo "Usage:" >&2
  echo "  bash scripts/deploy.sh" >&2
  echo "  bash scripts/deploy.sh preview" >&2
  echo "  bash scripts/deploy.sh --artifact <dir> --branch <main|preview|pr-N>" >&2
}

is_valid_branch() {
  [[ "$1" == "main" || "$1" == "preview" || "$1" =~ ^pr-[1-9][0-9]*$ ]]
}

parse_pages_deployment_url() {
  local deploy_output="$1"
  local pages_url_pattern='^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*[.]pages[.]dev$'
  local token
  local candidate
  local -a candidates=()

  while IFS= read -r token; do
    token="${token//$'\r'/}"
    [[ "$token" == *".pages.dev"* ]] || continue
    if [[ ! "$token" =~ $pages_url_pattern ]]; then
      echo "❌ Wrangler 返回了非法 pages.dev URL" >&2
      return 1
    fi
    for candidate in "${candidates[@]-}"; do
      [[ "$candidate" == "$token" ]] && continue 2
    done
    candidates+=("$token")
  done < <(printf '%s\n' "$deploy_output" | grep -Eo "https://[^[:space:]\"'<>]+" || true)

  if [[ "${#candidates[@]}" -ne 1 ]]; then
    echo "❌ 无法从 Wrangler 输出中唯一确定 pages.dev deployment URL" >&2
    return 1
  fi
  printf '%s\n' "${candidates[0]}"
}

MODE="build"
BRANCH="main"
ARTIFACT_DIR=""

case "$#" in
  0)
    ;;
  1)
    if [[ "$1" != "preview" ]]; then
      usage
      exit 2
    fi
    BRANCH="preview"
    ;;
  4)
    if [[ "$1" != "--artifact" || "$3" != "--branch" ]]; then
      usage
      exit 2
    fi
    MODE="artifact"
    ARTIFACT_DIR="$2"
    BRANCH="$4"
    ;;
  *)
    usage
    exit 2
    ;;
esac

if ! is_valid_branch "$BRANCH"; then
  echo "❌ 非法部署分支: $BRANCH" >&2
  exit 2
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
TEMP_ARTIFACT_DIR=""
cleanup() {
  if [[ -n "$TEMP_ARTIFACT_DIR" ]]; then
    rm -rf -- "$TEMP_ARTIFACT_DIR"
  fi
}
trap cleanup EXIT

if [[ "$MODE" == "build" ]]; then
  TEMP_ARTIFACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/travelmap-deploy-artifact.XXXXXX")"
  ARTIFACT_DIR="$TEMP_ARTIFACT_DIR"
  echo "📊 生成公开评测报告页 (web/eval.html)..."
  node "$SCRIPT_DIRECTORY/build-eval-page.mjs"
  echo "📦 构建并验证部署 artifact..."
  node "$SCRIPT_DIRECTORY/build-deploy-artifact.mjs" "$ARTIFACT_DIR"
else
  if [[ "$ARTIFACT_DIR" != /* ]]; then
    ARTIFACT_DIR="$CALLER_DIRECTORY/$ARTIFACT_DIR"
  fi
  echo "🔒 重验下载的部署 artifact..."
  node "$SCRIPT_DIRECTORY/validate-deploy-artifact.mjs" "$ARTIFACT_DIR"
fi

WRANGLER_BIN="$REPO_ROOT/node_modules/.bin/wrangler"
if [[ -n "${TRAVEL_TEST_WRANGLER_BIN:-}" ]]; then
  if [[ "${TRAVEL_DEPLOY_TEST_MODE:-}" != "1" ]]; then
    echo "❌ 测试 Wrangler 注入只能在显式 test mode 使用" >&2
    exit 1
  fi
  WRANGLER_BIN="$TRAVEL_TEST_WRANGLER_BIN"
fi
if [[ "$WRANGLER_BIN" != /* ]]; then
  echo "❌ Wrangler 必须是显式绝对路径" >&2
  exit 1
fi
if [[ ! -x "$WRANGLER_BIN" ]]; then
  echo "❌ 未找到本地锁定的 Wrangler: $WRANGLER_BIN" >&2
  exit 1
fi

echo "🚀 Deploying to Cloudflare Pages..."
echo "   Project: $PROJECT"
echo "   Branch:  $BRANCH"
echo "   Source:  $ARTIFACT_DIR/site"
echo "   Wrangler: $WRANGLER_BIN"
echo ""

DEPLOY_ARGUMENTS=(
  pages deploy "$ARTIFACT_DIR/site"
  "--project-name=$PROJECT"
  "--branch=$BRANCH"
)
SOURCE_SHA="${DEPLOY_SOURCE_SHA:-}"
if [[ -z "$SOURCE_SHA" && "$MODE" == "build" ]]; then
  SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
fi
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40,64}$ ]]; then
  echo "❌ 部署必须提供合法的 source SHA（DEPLOY_SOURCE_SHA）" >&2
  exit 1
fi
DEPLOY_ARGUMENTS+=("--commit-hash=$SOURCE_SHA")

set +e
DEPLOY_OUTPUT="$(
  NO_COLOR=1 "$WRANGLER_BIN" "${DEPLOY_ARGUMENTS[@]}" 2>&1
)"
DEPLOY_STATUS=$?
set -e
printf '%s\n' "$DEPLOY_OUTPUT"
if [[ "$DEPLOY_STATUS" -ne 0 ]]; then
  echo "❌ Wrangler 部署失败" >&2
  exit "$DEPLOY_STATUS"
fi

DEPLOYMENT_URL="$(parse_pages_deployment_url "$DEPLOY_OUTPUT")"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'deployment_url=%s\n' "$DEPLOYMENT_URL" >> "$GITHUB_OUTPUT"
fi

echo ""
echo "✅ 部署完成: $DEPLOYMENT_URL"
