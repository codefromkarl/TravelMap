/**
 * CORS Proxy Worker — 代理 SenseNova API 请求
 *
 * 前端请求: /api/llm/chat/completions → Worker → token.sensenova.cn/v1/chat/completions
 * 解决 SenseNova 不支持浏览器 CORS 的问题
 */

const UPSTREAM = "https://token.sensenova.cn/v1";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 处理 CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // 提取 /api/llm/ 之后的路径
    const path = url.pathname.replace(/^\/api\/llm/, "");
    const target = `${UPSTREAM}${path}${url.search}`;

    // 转发请求，过滤掉导致 CORS 问题的 headers
    const headers = new Headers();
    for (const [key, value] of request.headers) {
      const k = key.toLowerCase();
      // 保留必要 headers，过滤 stainless/浏览器自动 headers
      if (k === "content-type" || k === "authorization" || k === "accept" || k === "cache-control") {
        headers.set(key, value);
      }
    }

    // 读取并修复 body：developer → system（SenseNova 不支持 developer role）
    let bodyText = await request.text();
    if (bodyText.includes('"developer"')) {
      bodyText = bodyText.replace(/"role"\s*:\s*"developer"/g, '"role": "system"');
    }

    const resp = await fetch(target, {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? bodyText : undefined,
    });

    // 返回响应，加 CORS headers
    const respHeaders = new Headers(resp.headers);
    for (const [k, v] of Object.entries(corsHeaders())) {
      respHeaders.set(k, v);
    }

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Cache-Control",
    "Access-Control-Max-Age": "86400",
  };
}
