#!/usr/bin/env node
/**
 * 生成公开评测报告页 web/eval.html
 *
 * 从 eval-results/ 汇总 AI 行程质量评测数据，渲染为自包含静态页面
 * （无外部依赖，内嵌数据 + 内嵌样式/脚本），可直接部署展示。
 *
 * 用法: node scripts/build-eval-page.mjs [outPath]
 */
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const evalDir = path.join(projectRoot, 'eval-results');
const outPath = process.argv[2] ?? path.join(projectRoot, 'web', 'eval.html');

// ─── 数据收集 ─────────────────────────────────────────────

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function loadReports(root) {
  if (!fs.existsSync(root)) return [];
  return walk(root)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** 归一化为统一记录 */
function toRecord(data) {
  if (data.dimensions) {
    return {
      id: data.id,
      timestamp: data.timestamp,
      label: data.input ?? data.id,
      score: data.overallScore,
      passed: !!data.passed,
      type: '单次评测',
      dimensions: data.dimensions,
    };
  }
  if ('passRate' in data || 'overallScore' in data) {
    return {
      id: data.runId ?? data.id,
      timestamp: data.timestamp,
      label: data.scenarioCount ? `${data.scenarioCount} 个场景` : data.id,
      score: data.overallScore,
      passed: !!data.passed,
      type: '批次评测',
      dimensions: [],
    };
  }
  return null;
}

// ─── 统计 ─────────────────────────────────────────────────

function average(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function collectDimensionStats(records) {
  const map = new Map();
  for (const record of records) {
    for (const dim of record.dimensions ?? []) {
      const stat = map.get(dim.dimensionId) ?? { total: 0, failed: 0, count: 0 };
      stat.total += Number(dim.score ?? 0);
      stat.failed += dim.passed ? 0 : 1;
      stat.count += 1;
      map.set(dim.dimensionId, stat);
    }
  }
  const names = {
    structure: '行程结构完整性',
    semantic: '语义相关性',
    practical: '实用性',
    safety: '安全评估',
    experience: '体验友好度',
  };
  return [...map.entries()]
    .map(([dimensionId, stat]) => ({
      dimensionId,
      name: names[dimensionId] ?? dimensionId,
      averageScore: stat.total / stat.count,
      failedRate: stat.failed / stat.count,
      samples: stat.count,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

// ─── 渲染 ─────────────────────────────────────────────────

const INDIGO = '#6366f1';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pct(value, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/** 手绘 SVG 折线趋势图 */
function renderTrendSvg(records) {
  const ordered = [...records]
    .filter((r) => typeof r.score === 'number')
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  if (ordered.length < 2) return '<p class="muted">样本不足，暂无法绘制趋势图</p>';

  const W = 720;
  const H = 220;
  const PAD = { l: 46, r: 16, t: 18, b: 30 };
  const min = Math.min(...ordered.map((r) => r.score));
  const max = Math.max(...ordered.map((r) => r.score));
  const lo = Math.max(0, Math.floor((min - 0.05) * 10) / 10);
  const hi = Math.min(1, Math.ceil((max + 0.05) * 10) / 10);
  const span = hi - lo || 0.1;
  const x = (i) => PAD.l + (i / (ordered.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);

  const grid = [0.25, 0.5, 0.75]
    .map((g) => {
      const gy = y(g);
      return `<line x1="${PAD.l}" y1="${gy}" x2="${W - PAD.r}" y2="${gy}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 4"/><text x="${PAD.l - 8}" y="${gy + 4}" text-anchor="end" font-size="11" fill="#94a3b8">${pct(g, 0)}</text>`;
    })
    .join('');

  const points = ordered.map((r, i) => `${x(i).toFixed(1)},${y(r.score).toFixed(1)}`).join(' ');
  const area = `${PAD.l},${H - PAD.b} ${points} ${W - PAD.r},${H - PAD.b}`;
  const dots = ordered
    .map(
      (r, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(r.score).toFixed(1)}" r="4" fill="${INDIGO}" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(r.label)} · ${pct(r.score)}</title></circle>`,
    )
    .join('');
  const labels = ordered.map((r, i) => {
    const d = new Date(r.timestamp);
    const text = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const visible = i % Math.max(1, Math.ceil(ordered.length / 6)) === 0;
    return visible
      ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#94a3b8">${text}</text>`
      : '';
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="综合得分趋势" class="trend-svg">
    ${grid}
    <polygon points="${area}" fill="${INDIGO}" opacity="0.08"/>
    <polyline points="${points}" fill="none" stroke="${INDIGO}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

function renderPage(records, generatedAt) {
  const latest = records[0] ?? null;
  const avgScore = average(records.map((r) => r.score));
  const avgPass = average(records.map((r) => r.passed ? 1 : 0));
  const dimStats = collectDimensionStats(records);
  const recentRows = records.slice(0, 30)
    .map(
      (r) => `<tr>
        <td class="mono">${escapeHtml(String(r.timestamp ?? '').replace('T', ' ').slice(0, 19))}</td>
        <td class="mono">${escapeHtml(r.id ?? '')}</td>
        <td>${escapeHtml(r.label)}</td>
        <td class="mono">${pct(r.score)}</td>
        <td><span class="pill ${r.passed ? 'ok' : 'fail'}">${r.passed ? '通过' : '未通过'}</span></td>
      </tr>`,
    )
    .join('');
  const dimRows = dimStats
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.name)} <code class="muted">${escapeHtml(d.dimensionId)}</code></td>
        <td class="mono">${pct(d.averageScore)}</td>
        <td class="mono">${pct(d.failedRate)}</td>
        <td class="mono">${d.samples}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>旅图 TravelMap · AI 质量评估报告</title>
<meta name="description" content="TravelMap AI 行程生成质量评估：多维自动评测（结构/语义/实用/安全/体验）、历史趋势与迭代记录。" />
<meta name="robots" content="index, follow" />
<style>
  :root {
    --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --muted: #64748b;
    --border: #e2e8f0; --accent: #6366f1; --accent-soft: #eef2ff;
    --ok: #059669; --fail: #dc2626;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1220; --card: #111a2e; --text: #e2e8f0; --muted: #94a3b8;
      --border: #1e293b; --accent-soft: #1e1b4b;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  main { max-width: 1080px; margin: 0 auto; padding: 40px 20px 64px; }
  header.brand { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; }
  .logo { width: 46px; height: 46px; border-radius: 14px; background: linear-gradient(135deg, #818cf8, #6366f1); display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 8px 20px rgba(99,102,241,.35); }
  h1 { font-size: 24px; margin: 0; }
  .sub { color: var(--muted); font-size: 13.5px; margin: 0 0 20px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
  .badge.ok { background: rgba(5,150,105,.12); color: var(--ok); }
  .badge.fail { background: rgba(220,38,38,.12); color: var(--fail); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin: 22px 0; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; box-shadow: 0 4px 16px rgba(15,23,42,.05); }
  .card .label { font-size: 12.5px; color: var(--muted); }
  .card .metric { font-size: 30px; font-weight: 800; margin-top: 6px; letter-spacing: -.02em; }
  .card .metric.ok { color: var(--ok); } .card .metric.fail { color: var(--fail); }
  h2 { font-size: 16px; margin: 30px 0 12px; display: flex; align-items: center; gap: 8px; }
  h2::before { content: ''; width: 4px; height: 16px; border-radius: 2px; background: var(--accent); }
  .trend-svg { width: 100%; height: auto; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; font-size: 13.5px; }
  th, td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; }
  th { background: var(--accent-soft); font-size: 12.5px; color: var(--muted); font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
  .pill { padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pill.ok { background: rgba(5,150,105,.12); color: var(--ok); }
  .pill.fail { background: rgba(220,38,38,.12); color: var(--fail); }
  .muted { color: var(--muted); }
  code { font-size: 12px; }
  footer { margin-top: 40px; color: var(--muted); font-size: 12.5px; text-align: center; }
  footer a { color: var(--accent); text-decoration: none; }
</style>
</head>
<body>
<main>
  <header class="brand">
    <div class="logo">✈️</div>
    <div>
      <h1>旅图 TravelMap · AI 质量评估报告</h1>
      <p class="sub">多维度自动评测 · 评估驱动开发 · 生成于 ${escapeHtml(generatedAt)} · 数据源 eval-results/</p>
    </div>
    <span class="badge ${latest?.passed ? 'ok' : 'fail'}">最新状态：${latest?.passed ? '通过' : '未通过'}</span>
  </header>

  <section class="grid">
    <div class="card"><div class="label">评测报告总数</div><div class="metric">${records.length}</div></div>
    <div class="card"><div class="label">平均综合得分</div><div class="metric">${avgScore == null ? '—' : pct(avgScore)}</div></div>
    <div class="card"><div class="label">平均通过率</div><div class="metric">${avgPass == null ? '—' : pct(avgPass)}</div></div>
    <div class="card"><div class="label">最新一轮得分</div><div class="metric ${latest?.passed ? 'ok' : 'fail'}">${latest ? pct(latest.score) : '—'}</div></div>
  </section>

  <h2>综合得分趋势</h2>
  <div class="card">${renderTrendSvg(records)}</div>

  <h2>评测维度</h2>
  <table>
    <thead><tr><th>维度</th><th>平均分</th><th>失败率</th><th>样本数</th></tr></thead>
    <tbody>${dimRows || '<tr><td colspan="4" class="muted">暂无维度数据</td></tr>'}</tbody>
  </table>

  <h2>最近报告</h2>
  <table>
    <thead><tr><th>时间</th><th>ID</th><th>输入 / 场景</th><th>得分</th><th>状态</th></tr></thead>
    <tbody>${recentRows}</tbody>
  </table>

  <footer>旅图 TravelMap · <a href="https://github.com/codefromkarl/TravelMap" rel="noopener">GitHub</a> · 每次 Prompt / 工具 / 数据迭代后由 eval loop 自动更新本报告</footer>
</main>
</body>
</html>`;
}

// ─── 入口 ─────────────────────────────────────────────────

const records = loadReports(evalDir)
  .map(toRecord)
  .filter(Boolean)
  .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, renderPage(records, new Date().toLocaleString('zh-CN')));
console.log(`评估报告页已生成: ${outPath}（${records.length} 条记录）`);
