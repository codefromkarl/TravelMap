#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const evalDir = path.join(projectRoot, 'eval-results');
const outPath = process.argv[2] ?? path.join(evalDir, 'dashboard.html');
const reports = loadReports(evalDir).slice(0, 200);
const summaries = reports.map(toSummary).filter(Boolean);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, renderDashboard(summaries));
console.log(`评估仪表盘已生成: ${outPath}`);

function loadReports(root) {
  if (!fs.existsSync(root)) return [];
  return walk(root)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ file }) => {
      try {
        return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function toSummary(item) {
  const { file, data } = item;
  if (data.dimensions) {
    return {
      type: 'single',
      file,
      id: data.id,
      timestamp: data.timestamp,
      score: data.overallScore,
      passRate: data.passed ? 1 : 0,
      passed: data.passed,
      dimensions: data.dimensions,
    };
  }
  if ('passRate' in data || 'overallScore' in data) {
    return {
      type: 'batch',
      file,
      id: data.runId ?? path.basename(path.dirname(file)),
      timestamp: data.timestamp,
      score: data.overallScore,
      passRate: data.passRate,
      passed: data.passed,
      dimensions: [],
    };
  }
  return null;
}

function renderDashboard(items) {
  const latest = items[0];
  const avgScore = average(items.map((i) => i.score).filter((v) => typeof v === 'number'));
  const avgPassRate = average(items.map((i) => i.passRate).filter((v) => typeof v === 'number'));
  const dimStats = collectDimensionStats(items);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TravelAgent AI 评估仪表盘</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px; }
    h1 { margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; box-shadow: 0 8px 24px rgba(15,23,42,.05); }
    .metric { font-size: 32px; font-weight: 700; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 16px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    th { background: #eff6ff; }
    .ok { color: #059669; font-weight: 700; }
    .fail { color: #dc2626; font-weight: 700; }
    code { font-size: 12px; }
  </style>
</head>
<body>
<main>
  <h1>TravelAgent AI 评估仪表盘</h1>
  <p>生成时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}</p>
  <section class="grid">
    <div class="card"><div>报告数量</div><div class="metric">${items.length}</div></div>
    <div class="card"><div>平均得分</div><div class="metric">${pct(avgScore)}</div></div>
    <div class="card"><div>平均通过率</div><div class="metric">${pct(avgPassRate)}</div></div>
    <div class="card"><div>最新状态</div><div class="metric ${latest?.passed ? 'ok' : 'fail'}">${latest?.passed ? '通过' : '失败'}</div></div>
  </section>

  <h2>维度趋势汇总</h2>
  <table>
    <thead><tr><th>维度</th><th>平均分</th><th>失败率</th><th>样本数</th></tr></thead>
    <tbody>${dimStats.map((d) => `<tr><td>${escapeHtml(d.dimensionId)}</td><td>${pct(d.averageScore)}</td><td>${pct(d.failedRate)}</td><td>${d.samples}</td></tr>`).join('')}</tbody>
  </table>

  <h2>最近报告</h2>
  <table>
    <thead><tr><th>时间</th><th>ID</th><th>类型</th><th>得分</th><th>通过率</th><th>状态</th><th>文件</th></tr></thead>
    <tbody>${items.slice(0, 50).map((i) => `<tr><td>${escapeHtml(i.timestamp ?? '')}</td><td>${escapeHtml(i.id ?? '')}</td><td>${i.type}</td><td>${pct(i.score)}</td><td>${pct(i.passRate)}</td><td class="${i.passed ? 'ok' : 'fail'}">${i.passed ? '通过' : '失败'}</td><td><code>${escapeHtml(path.relative(projectRoot, i.file))}</code></td></tr>`).join('')}</tbody>
  </table>
</main>
</body>
</html>`;
}

function collectDimensionStats(items) {
  const map = new Map();
  for (const item of items) {
    for (const dim of item.dimensions ?? []) {
      const stat = map.get(dim.dimensionId) ?? { total: 0, failed: 0, count: 0 };
      stat.total += Number(dim.score ?? 0);
      stat.failed += dim.passed ? 0 : 1;
      stat.count += 1;
      map.set(dim.dimensionId, stat);
    }
  }
  return [...map.entries()].map(([dimensionId, stat]) => ({
    dimensionId,
    averageScore: stat.total / stat.count,
    failedRate: stat.failed / stat.count,
    samples: stat.count,
  }));
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
