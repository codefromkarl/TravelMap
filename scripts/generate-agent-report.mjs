/**
 * Agent E2E HTML 报告生成器
 *
 * 读取 eval-results/agent-*.json，生成交互式 HTML 报告
 *
 * 用法：node scripts/generate-agent-report.mjs [input.json] [output.html]
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ─── 配置 ──────────────────────────────────────────────────

const EVAL_RESULTS_DIR = resolve(process.cwd(), "eval-results");
const REPORTS_DIR = resolve(EVAL_RESULTS_DIR, "reports");

// ─── 数据加载 ──────────────────────────────────────────────

function loadLatestAgentReport() {
  const files = readdirSync(EVAL_RESULTS_DIR)
    .filter((f) => f.startsWith("agent-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error("❌ 未找到 agent-*.json 报告文件");
    process.exit(1);
  }

  const inputPath = process.argv[2] ?? resolve(EVAL_RESULTS_DIR, files[0]);
  console.log(`📄 读取报告: ${inputPath}`);
  return JSON.parse(readFileSync(inputPath, "utf-8"));
}

function loadAllAgentReports() {
  const files = readdirSync(EVAL_RESULTS_DIR)
    .filter((f) => f.startsWith("agent-") && f.endsWith(".json"))
    .sort()
    .reverse();

  return files.map((f) => {
    const data = JSON.parse(readFileSync(resolve(EVAL_RESULTS_DIR, f), "utf-8"));
    return { file: f, ...data };
  });
}

// ─── HTML 生成 ─────────────────────────────────────────────

function generateHtml(reports) {
  if (reports.length === 0) {
    return `<!DOCTYPE html>
<html><body><h1>暂无 Agent E2E 报告</h1><p>请先运行 npm run test:ai-e2e 生成报告</p></body></html>`;
  }

  const latest = reports[0];
  const scenarios = latest.scenarios ?? [];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent E2E 报告 - ${latest.timestamp}</title>
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
      --warning: #d29922;
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
    h3 { font-size: 1.1rem; margin: 1rem 0 0.5rem; }

    .meta {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .summary-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }

    .summary-card .value {
      font-size: 2rem;
      font-weight: bold;
      color: var(--accent);
    }

    .summary-card .label {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .scenario {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 1rem;
      overflow: hidden;
    }

    .scenario-header {
      padding: 1rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .scenario-header:hover { background: rgba(88, 166, 255, 0.1); }

    .scenario-header .status {
      font-size: 1.2rem;
      margin-right: 0.5rem;
    }

    .scenario-header .name { flex: 1; }

    .scenario-header .meta-info {
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .scenario-body {
      display: none;
      padding: 1rem;
      border-top: 1px solid var(--border);
    }

    .scenario.open .scenario-body { display: block; }

    .tool-calls {
      margin: 1rem 0;
    }

    .tool-call {
      display: flex;
      align-items: center;
      padding: 0.5rem;
      margin: 0.25rem 0;
      background: rgba(88, 166, 255, 0.05);
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.9rem;
    }

    .tool-call .name {
      color: var(--accent);
      min-width: 200px;
    }

    .tool-call .duration {
      color: var(--text-muted);
      margin-left: auto;
    }

    .checks {
      margin: 1rem 0;
    }

    .check {
      display: flex;
      align-items: center;
      padding: 0.25rem 0;
    }

    .check .icon { margin-right: 0.5rem; }
    .check.passed .icon { color: var(--success); }
    .check.failed .icon { color: var(--error); }

    .review {
      background: rgba(210, 153, 34, 0.1);
      border: 1px solid var(--warning);
      border-radius: 4px;
      padding: 1rem;
      margin: 1rem 0;
    }

    .review.error {
      background: rgba(248, 81, 73, 0.1);
      border-color: var(--error);
    }

    .token-bar {
      height: 8px;
      background: var(--border);
      border-radius: 4px;
      overflow: hidden;
      margin: 0.5rem 0;
    }

    .token-bar .fill {
      height: 100%;
      background: var(--accent);
      border-radius: 4px;
    }

    .history-table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }

    .history-table th, .history-table td {
      padding: 0.5rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    .history-table th {
      color: var(--text-muted);
      font-weight: normal;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Agent E2E 执行追踪报告</h1>
    <div class="meta">
      生成时间: ${latest.timestamp} |
      Provider: ${latest.provider} |
      Model: ${latest.model}
    </div>

    <div class="summary">
      <div class="summary-card">
        <div class="value">${latest.totalScenarios}</div>
        <div class="label">总场景数</div>
      </div>
      <div class="summary-card">
        <div class="value" style="color: var(--success)">${latest.passed}</div>
        <div class="label">通过</div>
      </div>
      <div class="summary-card">
        <div class="value" style="color: var(--error)">${latest.failed}</div>
        <div class="label">失败</div>
      </div>
      <div class="summary-card">
        <div class="value">${scenarios.reduce((sum, s) => sum + (s.toolCalls?.length ?? 0), 0)}</div>
        <div class="label">工具调用总数</div>
      </div>
      <div class="summary-card">
        <div class="value">${(scenarios.reduce((sum, s) => sum + (s.tokenUsage?.total ?? 0), 0) / 1000).toFixed(1)}k</div>
        <div class="label">Token 总量</div>
      </div>
    </div>

    <h2>📊 场景详情</h2>
    ${scenarios.map((s) => generateScenarioHtml(s)).join("\n")}

    <h2>📈 历史趋势</h2>
    ${generateHistoryHtml(reports)}
  </div>

  <script>
    document.querySelectorAll('.scenario-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('open');
      });
    });
  </script>
</body>
</html>`;
}

function generateScenarioHtml(scenario) {
  const statusIcon = scenario.passed ? "✅" : "❌";
  const toolCount = scenario.toolCalls?.length ?? 0;
  const tokenTotal = scenario.tokenUsage?.total ?? 0;
  const duration = scenario.durationMs ?? 0;

  return `
    <div class="scenario">
      <div class="scenario-header">
        <span class="status">${statusIcon}</span>
        <span class="name">${scenario.id}</span>
        <span class="meta-info">
          ${toolCount} 工具调用 | ${(tokenTotal / 1000).toFixed(1)}k tokens | ${(duration / 1000).toFixed(1)}s
        </span>
      </div>
      <div class="scenario-body">
        ${generateToolCallsHtml(scenario.toolCalls ?? [])}
        ${generateChecksHtml(scenario.structureChecks ?? [])}
        ${generateReviewHtml(scenario)}
        ${generateTokenHtml(scenario.tokenUsage)}
      </div>
    </div>`;
}

function generateToolCallsHtml(toolCalls) {
  if (toolCalls.length === 0) return "";

  return `
    <h3>🔧 工具调用</h3>
    <div class="tool-calls">
      ${toolCalls
        .map(
          (tc) => `
        <div class="tool-call">
          <span class="name">${tc.name}</span>
          <span class="duration">${tc.durationMs}ms</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

function generateChecksHtml(checks) {
  if (checks.length === 0) return "";

  return `
    <h3>✅ 结构检查</h3>
    <div class="checks">
      ${checks
        .map(
          (c) => `
        <div class="check ${c.passed ? "passed" : "failed"}">
          <span class="icon">${c.passed ? "✓" : "✗"}</span>
          <span>${c.name}</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

function generateReviewHtml(scenario) {
  if (!scenario.reviewScore) return "";

  const isError = scenario.reviewScore < 6;
  return `
    <div class="review ${isError ? "error" : ""}">
      <h3>📝 审查结果</h3>
      <p>评分: ${scenario.reviewScore}/10</p>
      ${scenario.reviewIssues?.length ? `<p>问题: ${scenario.reviewIssues.join(", ")}</p>` : ""}
    </div>`;
}

function generateTokenHtml(tokenUsage) {
  if (!tokenUsage) return "";

  const inputPct = tokenUsage.total > 0 ? (tokenUsage.input / tokenUsage.total) * 100 : 0;

  return `
    <h3>💰 Token 消耗</h3>
    <div>
      <span>Input: ${(tokenUsage.input / 1000).toFixed(1)}k</span> |
      <span>Output: ${(tokenUsage.output / 1000).toFixed(1)}k</span> |
      <span>Total: ${(tokenUsage.total / 1000).toFixed(1)}k</span>
    </div>
    <div class="token-bar">
      <div class="fill" style="width: ${inputPct}%"></div>
    </div>`;
}

function generateHistoryHtml(reports) {
  if (reports.length <= 1) return "<p>暂无历史数据</p>";

  return `
    <table class="history-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>Provider</th>
          <th>通过率</th>
          <th>工具调用</th>
          <th>Token</th>
        </tr>
      </thead>
      <tbody>
        ${reports
          .slice(0, 10)
          .map(
            (r) => `
          <tr>
            <td>${r.timestamp}</td>
            <td>${r.provider}</td>
            <td>${r.passed}/${r.totalScenarios}</td>
            <td>${r.scenarios?.reduce((sum, s) => sum + (s.toolCalls?.length ?? 0), 0) ?? 0}</td>
            <td>${((r.scenarios?.reduce((sum, s) => sum + (s.tokenUsage?.total ?? 0), 0) ?? 0) / 1000).toFixed(1)}k</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

// ─── 主程序 ────────────────────────────────────────────────

const reports = loadAllAgentReports();
const html = generateHtml(reports);

mkdirSync(REPORTS_DIR, { recursive: true });
const outputPath = process.argv[3] ?? resolve(REPORTS_DIR, `agent-report-${new Date().toISOString().replace(/[:.]/g, "-")}.html`);
writeFileSync(outputPath, html);
console.log(`✅ 报告已生成: ${outputPath}`);
