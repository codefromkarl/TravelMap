/**
 * 本地开发服务器
 *
 * 功能：
 *   - 托管 web/ 目录的静态文件
 *   - 拦截 esm.sh 上 typebox schema.mjs 请求，注入缺失的 IsDefault 导出
 *     (workaround: esm.sh 上 typebox 的 value.mjs 从 schema.mjs 导入 IsDefault，
 *      但 IsDefault 实际定义在 build/schema/types/index.mjs 中)
 *   - 拦截 cdn.sheetjs.com .tgz 请求，重定向到正确的 JS 文件
 *     (workaround: pi-web-ui 硬编码了 .tgz URL，浏览器拒绝作为 JS module 加载)
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..", "web");
const PORT = Number(process.env.PORT || 3456);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// IsDefault 补丁代码 — 在 schema.mjs 末尾追加 re-export
const TYPEBOX_ISDEFAULT_PATCH = `
// [typebox-patch] re-export IsDefault from build/schema/types/index.mjs
// esm.sh build bug: value.mjs imports IsDefault from schema.mjs, but it's defined elsewhere
export { IsDefault } from "./build/schema/types/index.mjs";
`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // ─── 代理 esm.sh 请求 ──────────────────────────────
  // /esm/* → 代理到 esm.sh
  // /@* → 也代理到 esm.sh（esm.sh 内部的绝对路径引用）
  const isEsmProxy = url.pathname.startsWith("/esm/") || url.pathname.startsWith("/@");

  // ─── 本地包代理 ──────────────────────────────────
  // 拦截 @earendil-works/* 请求，从本地 node_modules 提供
  if (url.pathname.startsWith("/@earendil-works/pi-ai@")) {
    const parts = url.pathname.split("/");
    // /@earendil-works/pi-ai@0.75.3/es2022/dist/providers/transform-messages.mjs
    const subPath = parts.slice(3).join("/"); // es2022/dist/providers/transform-messages.mjs
    
    // 将 esm.sh 路径转换为本地 dist 路径
    // es2022/dist/providers/transform-messages.mjs → providers/transform-messages.js
    const localSubPath = subPath
      .replace(/^es2022\/dist\//, "")  // 移除 es2022/dist/ 前缀
      .replace(/\.mjs$/, ".js"); // 将 .mjs 替换为 .js
    
    const localPath = path.join(WEB_DIR, "..", "node_modules", "@earendil-works", "pi-ai", "dist", localSubPath);
    console.log(`[LocalProxy] Trying: ${localPath}`);
    try {
      const data = await fs.promises.readFile(localPath);
      console.log(`[LocalProxy] Serving: ${localPath}`);
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
      return;
    } catch (err) {
      console.log(`[LocalProxy] Not found: ${localPath}, falling back to esm.sh`);
    }
  }

  if (isEsmProxy) {
    const remotePath = url.pathname.startsWith("/esm/")
      ? url.pathname.slice(5) + url.search
      : url.pathname + url.search;
    const remoteUrl = "https://esm.sh/" + remotePath;
    try {
      const resp = await fetch(remoteUrl, {
        headers: { "User-Agent": "TravelAgent-DevServer/1.0" },
      });
      const contentType = resp.headers.get("content-type") || "application/javascript";
      let body = await resp.text();

      // typebox schema.mjs 补丁
      if (url.pathname.includes("/typebox@") && url.pathname.endsWith("/schema.mjs")) {
        body += TYPEBOX_ISDEFAULT_PATCH;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(body);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Proxy error: ${err}`);
    }
    return;
  }

  // ─── 静态文件服务 ──────────────────────────────────
  let filePath = path.join(WEB_DIR, url.pathname === "/" ? "index.html" : url.pathname);

  // 安全检查
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`🚀 TravelAgent dev server: http://localhost:${PORT}`);
  console.log(`   Static files: ${WEB_DIR}`);
  console.log(`   Typebox patch: enabled (IsDefault re-export)`);
});
