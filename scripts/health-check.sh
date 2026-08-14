#!/usr/bin/env bash
# TravelAgent — blocking post-deploy verification
#
# Usage:
#   bash scripts/health-check.sh
#   bash scripts/health-check.sh preview
#   bash scripts/health-check.sh <absolute-http(s)-URL>

set -euo pipefail

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
  http://*|https://*)
    BASE_URL="$1"
    ENV_NAME="Exact deployment"
    ;;
  *)
    echo "Usage: $0 [production|preview|<absolute-http(s)-URL>]" >&2
    exit 2
    ;;
esac

BASE_URL="${BASE_URL%/}"
HEALTH_CHECK_MAX_ATTEMPTS="${HEALTH_CHECK_MAX_ATTEMPTS:-7}"
HEALTH_CHECK_RETRY_DELAY_SECONDS="${HEALTH_CHECK_RETRY_DELAY_SECONDS:-5}"
if [[ ! "$HEALTH_CHECK_MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "HEALTH_CHECK_MAX_ATTEMPTS must be a positive integer" >&2
  exit 2
fi
if [[ ! "$HEALTH_CHECK_RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "HEALTH_CHECK_RETRY_DELAY_SECONDS must be a non-negative integer" >&2
  exit 2
fi

CURL_BIN="$(command -v curl)"
NODE_BIN="$(command -v node)"
TEMP_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/travelmap-health-check.XXXXXX")"
cleanup() {
  rm -rf -- "$TEMP_DIRECTORY"
}
trap cleanup EXIT

CURL_COMMON=(
  --silent
  --show-error
  --max-time 10
  --connect-timeout 5
)
ERRORS=0

request_status() {
  local method="$1"
  local url="$2"
  local output_file="$3"
  shift 3

  local status
  local curl_status
  set +e
  status="$(
    "$CURL_BIN" "${CURL_COMMON[@]}" \
      --request "$method" \
      --output "$output_file" \
      --write-out '%{http_code}' \
      "$@" \
      "$url"
  )"
  curl_status=$?
  set -e
  if [[ "$curl_status" -ne 0 || ! "$status" =~ ^[0-9]{3}$ ]]; then
    return 1
  fi
  printf '%s\n' "$status"
}

request_status_with_retry() {
  local label="$1"
  local method="$2"
  local url="$3"
  local output_file="$4"
  shift 4

  local attempt=1
  local status
  while [[ "$attempt" -le "$HEALTH_CHECK_MAX_ATTEMPTS" ]]; do
    if status="$(request_status "$method" "$url" "$output_file" "$@")"; then
      if [[ "$status" == "404" || "$status" =~ ^5[0-9]{2}$ ]] \
        && [[ "$attempt" -lt "$HEALTH_CHECK_MAX_ATTEMPTS" ]]; then
        echo "⏳ $label HTTP $status (attempt $attempt/$HEALTH_CHECK_MAX_ATTEMPTS); retrying in ${HEALTH_CHECK_RETRY_DELAY_SECONDS}s" >&2
        if [[ "$HEALTH_CHECK_RETRY_DELAY_SECONDS" -gt 0 ]]; then
          sleep "$HEALTH_CHECK_RETRY_DELAY_SECONDS"
        fi
        attempt=$((attempt + 1))
        continue
      fi
      printf '%s %s\n' "$status" "$attempt"
      return 0
    fi

    echo "$label transport failure (attempt $attempt/$HEALTH_CHECK_MAX_ATTEMPTS)" >&2
    return 1
  done
}

record_failure() {
  echo "❌ $1"
  ERRORS=$((ERRORS + 1))
}

echo "=== Blocking deployment smoke ==="
echo "Environment: $ENV_NAME"
echo "URL: $BASE_URL"
echo ""

INDEX_BODY="$TEMP_DIRECTORY/index.html"
echo -n "1. Index HTML... "
if INDEX_RESULT="$(request_status_with_retry "Index HTML" GET "$BASE_URL/" "$INDEX_BODY")"; then
  read -r INDEX_STATUS INDEX_ATTEMPTS <<<"$INDEX_RESULT"
  if [[ "$INDEX_STATUS" == "200" ]] && grep -Eqi '<!doctype html|<html([[:space:]>])' "$INDEX_BODY"; then
    echo "✅ HTTP $INDEX_STATUS"
  else
    record_failure "HTTP $INDEX_STATUS after $INDEX_ATTEMPTS attempt(s) or missing HTML marker"
  fi
else
  record_failure "transport failure"
fi

ASSET_LIST="$TEMP_DIRECTORY/assets.txt"
echo -n "2. Referenced hashed assets... "
if "$NODE_BIN" --input-type=module - "$INDEX_BODY" >"$ASSET_LIST" <<'NODE'
import { readFileSync } from "node:fs";

const html = readFileSync(process.argv[2], "utf8");
const references = new Set();
const patterns = [
  /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
  /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s*)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

for (const pattern of patterns) {
  for (const match of html.matchAll(pattern)) {
    const candidate = match[1].split(/[?#]/, 1)[0];
    if (!candidate.startsWith("./") || !/\.(?:js|css)$/.test(candidate)) continue;
    if (!/^\.\/[A-Za-z0-9._/-]+\.(?:js|css)$/.test(candidate) || candidate.includes("..")) {
      throw new Error("unsafe local asset reference");
    }
    references.add(candidate);
  }
}

const hashed = [...references].filter((reference) =>
  /^\.\/(?:modules|styles)\/[A-Za-z0-9._/-]+\.[0-9a-f]{8}\.(?:js|css)$/.test(reference),
);
if (references.size === 0 || hashed.length === 0) {
  throw new Error("index does not reference content-addressed assets");
}
process.stdout.write(`${[...references].sort().join("\n")}\n`);
NODE
then
  ASSET_FAILURES=0
  ASSET_COUNT=0
  while IFS= read -r asset_path; do
    [[ -n "$asset_path" ]] || continue
    ASSET_COUNT=$((ASSET_COUNT + 1))
    ASSET_BODY="$TEMP_DIRECTORY/asset-$ASSET_COUNT"
    if ASSET_RESULT="$(
      request_status_with_retry "Asset $asset_path" GET "$BASE_URL/${asset_path#./}" "$ASSET_BODY"
    )"; then
      read -r ASSET_STATUS ASSET_ATTEMPTS <<<"$ASSET_RESULT"
      if [[ "$ASSET_STATUS" != "200" ]]; then
        echo "Asset $asset_path returned HTTP $ASSET_STATUS after $ASSET_ATTEMPTS attempt(s)" >&2
        ASSET_FAILURES=$((ASSET_FAILURES + 1))
      fi
    else
      ASSET_FAILURES=$((ASSET_FAILURES + 1))
    fi
  done <"$ASSET_LIST"
  if [[ "$ASSET_COUNT" -gt 0 && "$ASSET_FAILURES" -eq 0 ]]; then
    echo "✅ $ASSET_COUNT referenced assets"
  else
    record_failure "$ASSET_FAILURES of $ASSET_COUNT referenced assets failed"
  fi
else
  record_failure "could not prove index asset closure"
fi

echo -n "3. Chat Function preflight... "
CHAT_BODY="$TEMP_DIRECTORY/chat-options"
if CHAT_STATUS="$(
  request_status_with_retry "Chat Function preflight" OPTIONS "$BASE_URL/api/chat" "$CHAT_BODY" \
    --header "Origin: $BASE_URL" \
    --header "Access-Control-Request-Method: POST"
)"; then
  read -r CHAT_STATUS CHAT_ATTEMPTS <<<"$CHAT_STATUS"
  if [[ "$CHAT_STATUS" == "200" || "$CHAT_STATUS" == "204" ]]; then
    echo "✅ HTTP $CHAT_STATUS"
  else
    record_failure "HTTP $CHAT_STATUS after $CHAT_ATTEMPTS attempt(s)"
  fi
else
  record_failure "transport failure"
fi

echo -n "4. Auth Function preflight... "
AUTH_BODY="$TEMP_DIRECTORY/auth-options"
if AUTH_STATUS="$(
  request_status_with_retry "Auth Function preflight" OPTIONS "$BASE_URL/api/auth/status" "$AUTH_BODY" \
    --header "Origin: $BASE_URL" \
    --header "Access-Control-Request-Method: GET"
)"; then
  read -r AUTH_STATUS AUTH_ATTEMPTS <<<"$AUTH_STATUS"
  if [[ "$AUTH_STATUS" == "200" || "$AUTH_STATUS" == "204" ]]; then
    echo "✅ HTTP $AUTH_STATUS"
  else
    record_failure "HTTP $AUTH_STATUS after $AUTH_ATTEMPTS attempt(s)"
  fi
else
  record_failure "transport failure"
fi

echo -n "5. Index response time... "
# 与第 1 步一致：容忍 Pages 部署传播期的瞬时 404/5xx（无重试时每次部署都可能误报）
set +e
TIME_HTTP=""
TOTAL_TIME=""
TIME_ATTEMPT=1
while [[ "$TIME_ATTEMPT" -le "$HEALTH_CHECK_MAX_ATTEMPTS" ]]; do
  TIME_RESULT="$(
    "$CURL_BIN" "${CURL_COMMON[@]}" \
      --output /dev/null \
      --write-out '%{http_code} %{time_total}' \
      "$BASE_URL/"
  )"
  TIME_STATUS=$?
  read -r TIME_HTTP TOTAL_TIME <<<"$TIME_RESULT"
  if [[ "$TIME_STATUS" -eq 0 && "$TIME_HTTP" == "200" ]]; then
    break
  fi
  if [[ "$TIME_ATTEMPT" -lt "$HEALTH_CHECK_MAX_ATTEMPTS" ]]; then
    echo "⏳ Index response time HTTP ${TIME_HTTP:-transport} (attempt $TIME_ATTEMPT/$HEALTH_CHECK_MAX_ATTEMPTS); retrying in ${HEALTH_CHECK_RETRY_DELAY_SECONDS}s" >&2
    if [[ "$HEALTH_CHECK_RETRY_DELAY_SECONDS" -gt 0 ]]; then
      sleep "$HEALTH_CHECK_RETRY_DELAY_SECONDS"
    fi
  fi
  TIME_ATTEMPT=$((TIME_ATTEMPT + 1))
done
set -e
if [[ "$TIME_STATUS" -eq 0 && "$TIME_HTTP" == "200" ]] \
  && awk -v seconds="$TOTAL_TIME" 'BEGIN { exit !(seconds >= 0 && seconds < 10) }'; then
  TIME_MS="$(awk -v seconds="$TOTAL_TIME" 'BEGIN { printf "%d", seconds * 1000 }')"
  echo "✅ ${TIME_MS}ms"
else
  record_failure "HTTP ${TIME_HTTP:-unknown}, transport failure, or response time >= 3000ms"
fi
echo ""
if [[ "$ERRORS" -eq 0 ]]; then
  echo "✅ All blocking smoke checks passed"
  exit 0
fi

echo "❌ $ERRORS blocking smoke check(s) failed"
exit 1
