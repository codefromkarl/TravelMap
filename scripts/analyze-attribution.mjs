#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const evalDir = path.join(projectRoot, 'eval-results');
const reportDir = path.join(evalDir, 'reports');
fs.mkdirSync(reportDir, { recursive: true });

const target = process.argv[2] ?? findLatestReport(evalDir);
if (!target) {
  console.error('未找到评估报告。用法: node scripts/analyze-attribution.mjs <report.json>');
  process.exit(1);
}

const report = readJson(target);
const reports = normalizeReports(report);
const result = analyzeReports(reports, target);
const outPath = path.join(reportDir, `attribution-${timestamp()}.json`);
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, output: outPath }, null, 2));

function findLatestReport(root) {
  if (!fs.existsSync(root)) return null;
  const files = walk(root)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => /eval-|run-|golden-|summary/.test(path.basename(file)))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.file ?? null;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeReports(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.reports)) return data.reports;
  if (Array.isArray(data.scenarios)) return data.scenarios;
  if (data.dimensions) return [data];
  return [data];
}

function analyzeReports(items, source) {
  const failed = [];
  const dimensions = new Map();
  const recommendations = new Map();

  for (const item of items) {
    const dims = item.dimensions ?? [];
    for (const dim of dims) {
      const current = dimensions.get(dim.dimensionId) ?? { count: 0, failed: 0, totalScore: 0 };
      current.count += 1;
      current.totalScore += Number(dim.score ?? 0);
      if (!dim.passed) current.failed += 1;
      dimensions.set(dim.dimensionId, current);

      for (const check of dim.checks ?? []) {
        if (check.passed) continue;
        failed.push({
          scenarioId: item.id ?? item.scenarioId ?? 'unknown',
          dimensionId: dim.dimensionId,
          check: check.name,
          detail: check.detail,
          evidence: check.evidence,
        });
      }
    }
    for (const suggestion of item.allSuggestions ?? []) {
      recommendations.set(suggestion, (recommendations.get(suggestion) ?? 0) + 1);
    }
  }

  const dimensionSummary = [...dimensions.entries()].map(([dimensionId, stat]) => ({
    dimensionId,
    averageScore: round(stat.totalScore / stat.count),
    failedRate: round(stat.failed / stat.count),
    samples: stat.count,
  }));

  return {
    source,
    generatedAt: new Date().toISOString(),
    scenarioCount: items.length,
    failedCheckCount: failed.length,
    dimensionSummary,
    topFailures: topBy(failed.map((f) => `${f.dimensionId}:${f.check}`)).slice(0, 10),
    failedChecks: failed.slice(0, 50),
    recommendations: [...recommendations.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([text, count]) => ({ text, count })),
  };
}

function topBy(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
