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
  --retry 3
  --retry-delay 1
  --retry-connrefused
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
if INDEX_STATUS="$(request_status GET "$BASE_URL/index.html" "$INDEX_BODY")"; then
  if [[ "$INDEX_STATUS" == "200" ]] && grep -Eqi '<!doctype html|<html([[:space:]>])' "$INDEX_BODY"; then
    echo "✅ HTTP $INDEX_STATUS"
  else
    record_failure "HTTP $INDEX_STATUS or missing HTML marker"
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
    if ASSET_STATUS="$(request_status GET "$BASE_URL/${asset_path#./}" "$ASSET_BODY")"; then
      if [[ "$ASSET_STATUS" != "200" ]]; then
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
  request_status OPTIONS "$BASE_URL/api/chat" "$CHAT_BODY" \
    --header "Origin: $BASE_URL" \
    --header "Access-Control-Request-Method: POST"
)"; then
  if [[ "$CHAT_STATUS" == "200" || "$CHAT_STATUS" == "204" ]]; then
    echo "✅ HTTP $CHAT_STATUS"
  else
    record_failure "HTTP $CHAT_STATUS"
  fi
else
  record_failure "transport failure"
fi

echo -n "4. Auth Function preflight... "
AUTH_BODY="$TEMP_DIRECTORY/auth-options"
if AUTH_STATUS="$(
  request_status OPTIONS "$BASE_URL/api/auth/status" "$AUTH_BODY" \
    --header "Origin: $BASE_URL" \
    --header "Access-Control-Request-Method: GET"
)"; then
  if [[ "$AUTH_STATUS" == "200" || "$AUTH_STATUS" == "204" ]]; then
    echo "✅ HTTP $AUTH_STATUS"
  else
    record_failure "HTTP $AUTH_STATUS"
  fi
else
  record_failure "transport failure"
fi

echo -n "5. Index response time... "
set +e
TOTAL_TIME="$(
  "$CURL_BIN" "${CURL_COMMON[@]}" \
    --output /dev/null \
    --write-out '%{time_total}' \
    "$BASE_URL/index.html"
)"
TIME_STATUS=$?
set -e
if [[ "$TIME_STATUS" -eq 0 ]] && awk -v seconds="$TOTAL_TIME" 'BEGIN { exit !(seconds >= 0 && seconds < 3) }'; then
  TIME_MS="$(awk -v seconds="$TOTAL_TIME" 'BEGIN { printf "%d", seconds * 1000 }')"
  echo "✅ ${TIME_MS}ms"
else
  record_failure "transport failure or response time >= 3000ms"
fi

echo ""
if [[ "$ERRORS" -eq 0 ]]; then
  echo "✅ All blocking smoke checks passed"
  exit 0
fi

echo "❌ $ERRORS blocking smoke check(s) failed"
exit 1
