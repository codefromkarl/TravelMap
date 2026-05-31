/**
 * 高德 API 代理 — Cloudflare Pages Function
 *
 * POST /api/amap
 *
 * 功能：
 *   1. 服务端持有高德 API Key，前端不暴露
 *   2. 代理高德 Web 服务 API 请求
 *   3. 支持地理编码、POI 搜索等
 */

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...COMMON_HEADERS },
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: COMMON_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response(null, { status: 405, headers: COMMON_HEADERS });
  }

  const { request, env } = context;
  const apiKey = env.AMAP_WEB_KEY || env.AMAP_GEO_KEY || "";

  if (!apiKey) {
    return jsonResponse(503, {
      error: "高德 API Key 未配置",
      missing: ["AMAP_WEB_KEY"],
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const { endpoint, params } = body;
  if (!endpoint) {
    return jsonResponse(400, { error: "Missing endpoint parameter" });
  }

  // 构建高德 API URL
  const url = new URL(`https://restapi.amap.com/v3/${endpoint}`);
  url.searchParams.set("key", apiKey);

  // 添加查询参数
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  try {
    const resp = await fetch(url.toString());
    const data = await resp.json();
    return jsonResponse(200, data);
  } catch (err) {
    return jsonResponse(502, {
      error: "高德 API 请求失败",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
