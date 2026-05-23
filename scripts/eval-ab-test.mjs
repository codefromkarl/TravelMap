#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const aPath = args.a ?? args._[0];
const bPath = args.b ?? args._[1];

if (!aPath || !bPath) {
  console.error('用法: node scripts/eval-ab-test.mjs --a <reportA.json> --b <reportB.json> [--output <out.json>]');
  process.exit(1);
}

const aReports = normalizeReports(readJson(aPath));
const bReports = normalizeReports(readJson(bPath));
const result = compare(aReports, bReports, aPath, bPath);
const output = args.output ?? path.join(process.cwd(), 'eval-results', 'reports', `ab-${timestamp()}.json`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, output }, null, 2));

function parseArgs(values) {
  const parsed = { _: [] };
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      parsed[key] = values[i + 1];
      i += 1;
    } else {
      parsed._.push(value);
    }
  }
  return parsed;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeReports(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.reports)) return data.reports;
  if (Array.isArray(data.scenarios)) return data.scenarios;
  if (data.dimensions) return [data];
  if ('overallScore' in data || 'passRate' in data) return [data];
  return [];
}

function compare(aReports, bReports, sourceA, sourceB) {
  const aSummary = summarize(aReports);
  const bSummary = summarize(bReports);
  const dimensionDelta = compareDimensions(aSummary.dimensions, bSummary.dimensions);
  const scoreDelta = bSummary.averageScore - aSummary.averageScore;
  const passRateDelta = bSummary.passRate - aSummary.passRate;

  return {
    generatedAt: new Date().toISOString(),
    sourceA,
    sourceB,
    summaryA: aSummary,
    summaryB: bSummary,
    delta: {
      averageScore: round(scoreDelta),
      passRate: round(passRateDelta),
      dimensions: dimensionDelta,
    },
    winner: pickWinner(scoreDelta, passRateDelta),
    recommendation: buildRecommendation(scoreDelta, passRateDelta, dimensionDelta),
  };
}

function summarize(reports) {
  const scores = reports.map(getScore).filter((v) => typeof v === 'number');
  const passRates = reports.map(getPassRate).filter((v) => typeof v === 'number');
  const dimensions = new Map();

  for (const report of reports) {
    for (const dim of report.dimensions ?? []) {
      const stat = dimensions.get(dim.dimensionId) ?? { total: 0, failed: 0, count: 0 };
      stat.total += Number(dim.score ?? 0);
      stat.failed += dim.passed ? 0 : 1;
      stat.count += 1;
      dimensions.set(dim.dimensionId, stat);
    }
  }

  return {
    count: reports.length,
    averageScore: round(average(scores)),
    passRate: round(average(passRates)),
    dimensions: Object.fromEntries(
      [...dimensions.entries()].map(([id, stat]) => [
        id,
        {
          averageScore: round(stat.total / stat.count),
          failedRate: round(stat.failed / stat.count),
          samples: stat.count,
        },
      ]),
    ),
  };
}

function compareDimensions(aDims, bDims) {
  const ids = new Set([...Object.keys(aDims), ...Object.keys(bDims)]);
  return [...ids].map((id) => ({
    dimensionId: id,
    averageScoreDelta: round((bDims[id]?.averageScore ?? 0) - (aDims[id]?.averageScore ?? 0)),
    failedRateDelta: round((bDims[id]?.failedRate ?? 0) - (aDims[id]?.failedRate ?? 0)),
  }));
}

function getScore(report) {
  if (typeof report.overallScore === 'number') return report.overallScore;
  if (typeof report.score === 'number') return report.score;
  return undefined;
}

function getPassRate(report) {
  if (typeof report.passRate === 'number') return report.passRate;
  if (typeof report.passed === 'boolean') return report.passed ? 1 : 0;
  return undefined;
}

function pickWinner(scoreDelta, passRateDelta) {
  if (scoreDelta > 0.02 && passRateDelta >= -0.01) return 'B';
  if (scoreDelta < -0.02 && passRateDelta <= 0.01) return 'A';
  if (passRateDelta > 0.05) return 'B';
  if (passRateDelta < -0.05) return 'A';
  return 'tie';
}

function buildRecommendation(scoreDelta, passRateDelta, dimensionDelta) {
  const worst = [...dimensionDelta].sort((a, b) => a.averageScoreDelta - b.averageScoreDelta)[0];
  if (scoreDelta > 0.02 && passRateDelta >= 0) return '采用 B：总体得分和通过率未退化。';
  if (scoreDelta < -0.02 || passRateDelta < -0.05) {
    return `保留 A：B 存在退化${worst ? `，重点关注 ${worst.dimensionId}` : ''}。`;
  }
  return '结果接近：建议扩大样本量后再决策。';
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
