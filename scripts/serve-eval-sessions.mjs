/**
 * Agent E2E 评估结果本地看板服务
 *
 * 启动本地 HTTP 服务，浏览、过滤、对比所有历史 Agent E2E 结果
 *
 * 用法：npm run eval:sessions [-- --port 7321]
 */

import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";

// ─── 配置 ──────────────────────────────────────────────────

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--port") ?? "7321", 10);
const EVAL_RESULTS_DIR = resolve(process.cwd(), "eval-results");
const REPORTS_DIR = resolve(EVAL_RESULTS_DIR, "reports");

// ─── 数据加载 ──────────────────────────────────────────────

function loadAllReports() {
  if (!existsSync(EVAL_RESULTS_DIR)) {
    return { agent: [], golden: [], run: [] };
  }

  const files = readdirSync(EVAL_RESULTS_DIR);
  const result = { agent: [], golden: [], run: [] };

  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const data = JSON.parse(readFileSync(resolve(EVAL_RESULTS_DIR, f), "utf-8"));
      if (f.startsWith("agent-")) {
        result.agent.push({ file: f, ...data });
      } else if (f.startsWith("golden-")) {
        result.golden.push({ file: f, ...data });
      } else if (f.startsWith("run-")) {
        result.run.push({ file: f, ...data });
      }
    } catch {
      // skip invalid json
    }
  }

  // 按时间倒序
  result.agent.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  result.golden.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  result.run.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return result;
}

function loadReport(filename) {
  const path = resolve(EVAL_RESULTS_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ─── HTML 生成 ─────────────────────────────────────────────

function generateIndexHtml() {
  const reports = loadAllReports();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent E2E 评估看板</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --success: #3fb950;
      --error: #f85149;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }

    .container { max-width: 1400px; margin: 0 auto; }

    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; margin: 2rem 0 1rem; color: var(--accent); }

    .meta {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .tabs {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
    }

    .tab {
      padding: 0.5rem 1rem;
      cursor: pointer;
      border-radius: 4px;
      background: transparent;
      color: var(--text-muted);
      border: none;
      font-size: 1rem;
    }

    .tab.active {
      background: var(--accent);
      color: var(--bg);
    }

    .tab:hover:not(.active) {
      background: rgba(88, 166, 255, 0.1);
    }

    .table-container {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      color: var(--text-muted);
      font-weight: normal;
      font-size: 0.85rem;
    }

    tr:hover { background: rgba(88, 166, 255, 0.05); }

    .status-pass { color: var(--success); }
    .status-fail { color: var(--error); }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover { text-decoration: underline; }

    .badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }

    .badge-agent { background: rgba(88, 166, 255, 0.2); color: var(--accent); }
    .badge-golden { background: rgba(63, 185, 80, 0.2); color: var(--success); }
    .badge-run { background: rgba(210, 153, 34, 0.2); color: #d29922; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Agent E2E 评估看板</h1>
    <div class="meta">
      总计: ${reports.agent.length} Agent 报告 | ${reports.golden.length} Golden 报告 | ${reports.run.length} Run 报告
    </div>

    <div class="tabs">
      <button class="tab active" onclick="showTab('agent')">Agent E2E</button>
      <button class="tab" onclick="showTab('golden')">Golden Dataset</button>
      <button class="tab" onclick="showTab('run')">Token Usage</button>
    </div>

    <div id="tab-agent" class="table-container">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>Provider</th>
            <th>Model</th>
            <th>通过率</th>
            <th>工具调用</th>
            <th>Token</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${reports.agent
            .map(
              (r) => `
            <tr>
              <td>${r.timestamp}</td>
              <td>${r.provider}</td>
              <td>${r.model}</td>
              <td class="${r.passed === r.totalScenarios ? "status-pass" : "status-fail"}">
                ${r.passed}/${r.totalScenarios}
              </td>
              <td>${r.scenarios?.reduce((sum, s) => sum + (s.toolCalls?.length ?? 0), 0) ?? 0}</td>
              <td>${((r.scenarios?.reduce((sum, s) => sum + (s.tokenUsage?.total ?? 0), 0) ?? 0) / 1000).toFixed(1)}k</td>
              <td><a href="/report/${r.file}">查看详情</a></td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div id="tab-golden" class="table-container" style="display: none;">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>Provider</th>
            <th>Model</th>
            <th>通过率</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${reports.golden
            .map(
              (r) => `
            <tr>
              <td>${r.timestamp}</td>
              <td>${r.provider}</td>
              <td>${r.model}</td>
              <td class="${r.passed === r.totalScenarios ? "status-pass" : "status-fail"}">
                ${r.passed}/${r.totalScenarios}
              </td>
              <td><a href="/report/${r.file}">查看详情</a></td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div id="tab-run" class="table-container" style="display: none;">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>场景数</th>
            <th>总 Token</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${reports.run
            .map(
              (r) => `
            <tr>
              <td>${r.timestamp}</td>
              <td>${r.scenarios?.length ?? 0}</td>
              <td>${((r.totalTokens ?? 0) / 1000).toFixed(1)}k</td>
              <td><a href="/report/${r.file}">查看详情</a></td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    function showTab(name) {
      document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + name).style.display = 'block';
      event.target.classList.add('active');
    }
  </script>
</body>
</html>`;
}

function generateReportHtml(filename) {
  const data = loadReport(filename);
  if (!data) return "<h1>报告未找到</h1>";

  // 复用 generate-agent-report.mjs 的逻辑
  const scenarios = data.scenarios ?? [];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>报告详情 - ${filename}</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --success: #3fb950;
      --error: #f85149;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }

    .container { max-width: 1200px; margin: 0 auto; }

    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; margin: 2rem 0 1rem; color: var(--accent); }

    .meta {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .scenario {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 1rem;
      padding: 1rem;
    }

    .scenario-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .status-pass { color: var(--success); }
    .status-fail { color: var(--error); }

    .tool-calls {
      margin: 0.5rem 0;
      padding: 0.5rem;
      background: rgba(88, 166, 255, 0.05);
      border-radius: 4px;
    }

    .tool-call {
      display: flex;
      justify-content: space-between;
      padding: 0.25rem 0;
      font-family: monospace;
      font-size: 0.9rem;
    }

    .checks {
      margin: 0.5rem 0;
    }

    .check {
      display: flex;
      align-items: center;
      padding: 0.25rem 0;
    }

    .check .icon { margin-right: 0.5rem; }
    .check.passed .icon { color: var(--success); }
    .check.failed .icon { color: var(--error); }
  </style>
</head>
<body>
  <div class="container">
    <p><a href="/">← 返回看板</a></p>
    <h1>📋 报告详情</h1>
    <div class="meta">
      文件: ${filename} |
      时间: ${data.timestamp ?? "N/A"} |
      Provider: ${data.provider ?? "N/A"} |
      Model: ${data.model ?? "N/A"}
    </div>

    <h2>场景 (${scenarios.length})</h2>
    ${scenarios
      .map(
        (s) => `
      <div class="scenario">
        <div class="scenario-header">
          <span class="${s.passed ? "status-pass" : "status-fail"}">
            ${s.passed ? "✅" : "❌"} ${s.id}
          </span>
          <span style="color: var(--text-muted)">
            ${s.toolCalls?.length ?? 0} 工具 | ${((s.tokenUsage?.total ?? 0) / 1000).toFixed(1)}k tokens | ${((s.durationMs ?? 0) / 1000).toFixed(1)}s
          </span>
        </div>
        ${
          s.toolCalls?.length
            ? `
          <div class="tool-calls">
            ${s.toolCalls.map((tc) => `<div class="tool-call"><span>${tc.name}</span><span>${tc.durationMs}ms</span></div>`).join("")}
          </div>`
            : ""
        }
        ${
          s.structureChecks?.length
            ? `
          <div class="checks">
            ${s.structureChecks.map((c) => `<div class="check ${c.passed ? "passed" : "failed"}"><span class="icon">${c.passed ? "✓" : "✗"}</span><span>${c.name}</span></div>`).join("")}
          </div>`
            : ""
        }
        ${
          s.error
            ? `<div style="color: var(--error); margin-top: 0.5rem;">Error: ${s.error}</div>`
            : ""
        }
      </div>`,
      )
      .join("")}
  </div>
</body>
</html>`;
}

// ─── HTTP 服务器 ────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(generateIndexHtml());
  } else if (url.pathname.startsWith("/report/")) {
    const filename = url.pathname.slice(8);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(generateReportHtml(filename));
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Agent E2E 评估看板已启动`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n   按 Ctrl+C 停止\n`);
});
