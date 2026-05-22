/**
 * Trace Waterfall 瀑布图面板
 *
 * 点击 footer traceId 弹出，展示当前 trace 的调用链瀑布图：
 *   - 每个 span 显示操作名、耗时、状态
 *   - 横条表示时间线
 *   - 支持导出 trace 数据
 */

import { getWaterfallData, getTraceSummary, getRecentTraceIds } from './perf-trace.js?v=5';
import { getLogEntries } from './logger.js?v=5';
import { getCurrentTraceId } from './trace.js?v=5';
import { createLogger } from './logger.js?v=5';

const wfLogger = createLogger('waterfall');

// ─── 面板 DOM ────────────────────────────────────────────

let panelEl = null;
let isVisible = false;

function ensurePanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'trace-waterfall-panel';
  panelEl.innerHTML = `
    <style>
      #trace-waterfall-panel {
        position: fixed;
        bottom: 40px;
        right: 12px;
        width: 520px;
        max-height: 70vh;
        background: var(--color-bg-elevated, #1a1a2e);
        border: 1px solid var(--color-border, #333);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        color: var(--color-text, #e0e0e0);
        overflow: hidden;
        transform: translateY(10px);
        opacity: 0;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }
      #trace-waterfall-panel.visible {
        transform: translateY(0);
        opacity: 1;
      }
      .wf-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        border-bottom: 1px solid var(--color-border, #333);
        background: var(--color-bg, #16213e);
      }
      .wf-header h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text, #e0e0e0);
      }
      .wf-header-actions {
        display: flex;
        gap: 6px;
      }
      .wf-btn {
        padding: 3px 10px;
        border-radius: 6px;
        border: 1px solid var(--color-border, #333);
        background: transparent;
        color: var(--color-text-muted, #888);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .wf-btn:hover {
        background: var(--color-bg-hover, #2a2a4a);
        color: var(--color-text, #e0e0e0);
      }
      .wf-body {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
      }
      .wf-summary {
        padding: 8px 14px;
        border-bottom: 1px solid var(--color-border, #333);
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
      }
      .wf-stat {
        text-align: center;
      }
      .wf-stat-value {
        font-size: 16px;
        font-weight: 700;
        color: var(--color-primary, #4f8ef7);
      }
      .wf-stat-label {
        font-size: 10px;
        color: var(--color-text-muted, #888);
        text-transform: uppercase;
      }
      .wf-timeline {
        position: relative;
        padding: 2px 0;
      }
      .wf-span-row {
        display: grid;
        grid-template-columns: 140px 1fr 60px;
        align-items: center;
        padding: 4px 14px;
        gap: 8px;
        transition: background 0.1s;
      }
      .wf-span-row:hover {
        background: rgba(79, 142, 247, 0.08);
      }
      .wf-span-name {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
        color: var(--color-text, #e0e0e0);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .wf-span-bar-container {
        position: relative;
        height: 18px;
        background: rgba(255,255,255,0.04);
        border-radius: 3px;
        overflow: hidden;
      }
      .wf-span-bar {
        position: absolute;
        top: 2px;
        height: 14px;
        border-radius: 3px;
        min-width: 3px;
        transition: width 0.3s ease;
      }
      .wf-span-bar.completed { background: var(--color-primary, #4f8ef7); opacity: 0.7; }
      .wf-span-bar.running { background: #f5a623; opacity: 0.7; animation: wf-pulse 1.5s infinite; }
      .wf-span-bar.error { background: #e74c3c; opacity: 0.8; }
      @keyframes wf-pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.9; }
      }
      .wf-span-duration {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
        text-align: right;
        color: var(--color-text-muted, #888);
      }
      .wf-logs {
        border-top: 1px solid var(--color-border, #333);
        max-height: 150px;
        overflow-y: auto;
        padding: 6px 14px;
      }
      .wf-log-entry {
        display: flex;
        gap: 8px;
        padding: 2px 0;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 10px;
      }
      .wf-log-time { color: var(--color-text-muted, #888); min-width: 70px; }
      .wf-log-level { min-width: 40px; font-weight: 600; }
      .wf-log-level.info { color: #4f8ef7; }
      .wf-log-level.warn { color: #f5a623; }
      .wf-log-level.error { color: #e74c3c; }
      .wf-log-level.debug { color: #888; }
      .wf-log-msg { color: var(--color-text, #e0e0e0); }
      .wf-trace-selector {
        padding: 6px 14px;
        border-bottom: 1px solid var(--color-border, #333);
      }
      .wf-trace-selector select {
        width: 100%;
        padding: 4px 8px;
        border-radius: 6px;
        border: 1px solid var(--color-border, #333);
        background: var(--color-bg, #16213e);
        color: var(--color-text, #e0e0e0);
        font-size: 11px;
      }
    </style>

    <div class="wf-header">
      <h3>🔍 调用链追踪</h3>
      <div class="wf-header-actions">
        <button class="wf-btn" id="wf-export">导出 JSON</button>
        <button class="wf-btn" id="wf-close">✕ 关闭</button>
      </div>
    </div>

    <div class="wf-trace-selector">
      <select id="wf-trace-select"></select>
    </div>

    <div id="wf-summary" class="wf-summary"></div>
    <div class="wf-body">
      <div id="wf-timeline" class="wf-timeline"></div>
    </div>
    <div id="wf-logs" class="wf-logs"></div>
  `;

  document.body.appendChild(panelEl);

  // 事件绑定
  panelEl.querySelector('#wf-close').addEventListener('click', () => hidePanel());
  panelEl.querySelector('#wf-export').addEventListener('click', () => exportPanelData());
  panelEl.querySelector('#wf-trace-select').addEventListener('change', (e) => {
    renderPanel(e.target.value);
  });

  return panelEl;
}

// ─── 渲染 ────────────────────────────────────────────────

function renderPanel(traceId) {
  const tid = traceId || getCurrentTraceId();
  if (!tid) return;

  const summary = getTraceSummary(tid);
  const waterfall = getWaterfallData(tid);
  const logs = getLogEntries({ traceId: tid, limit: 20 });

  // 渲染 summary
  const summaryEl = panelEl.querySelector('#wf-summary');
  summaryEl.innerHTML = `
    <div class="wf-stat">
      <div class="wf-stat-value">${summary.completedSpans}</div>
      <div class="wf-stat-label">Spans</div>
    </div>
    <div class="wf-stat">
      <div class="wf-stat-value">${formatDuration(summary.totalDuration)}</div>
      <div class="wf-stat-label">总耗时</div>
    </div>
    <div class="wf-stat">
      <div class="wf-stat-value">${logs.length}</div>
      <div class="wf-stat-label">日志</div>
    </div>
    <div class="wf-stat">
      <div class="wf-stat-value">${summary.completedSpans > 0 ? '✅' : '⏳'}</div>
      <div class="wf-stat-label">状态</div>
    </div>
  `;

  // 渲染瀑布图
  const timelineEl = panelEl.querySelector('#wf-timeline');
  const totalDuration = summary.totalDuration || 1;

  function renderNodes(nodes, parentHtml = '') {
    let html = parentHtml;
    for (const node of nodes) {
      const offsetPct = (node.offset / totalDuration * 100).toFixed(1);
      const widthPct = (node.span.duration / totalDuration * 100).toFixed(1);
      const indent = node.depth > 0 ? `padding-left: ${node.depth * 12}px;` : '';
      const statusClass = node.span.status || 'completed';

      html += `
        <div class="wf-span-row" title="${node.span.operation}&#10;spanId: ${node.span.spanId}&#10;耗时: ${node.span.duration}ms">
          <div class="wf-span-name" style="${indent}">${node.span.operation}</div>
          <div class="wf-span-bar-container">
            <div class="wf-span-bar ${statusClass}" style="left:${offsetPct}%;width:${widthPct}%"></div>
          </div>
          <div class="wf-span-duration">${formatDuration(node.span.duration)}</div>
        </div>
      `;
      if (node.children.length > 0) {
        html = renderNodes(node.children, html);
      }
    }
    return html;
  }

  timelineEl.innerHTML = waterfall.length > 0
    ? renderNodes(waterfall)
    : '<div style="padding:20px;text-align:center;color:var(--color-text-muted,#888)">暂无 span 数据</div>';

  // 渲染日志
  const logsEl = panelEl.querySelector('#wf-logs');
  if (logs.length > 0) {
    logsEl.innerHTML = '<div style="font-size:10px;color:var(--color-text-muted,#888);margin-bottom:4px;font-weight:600">相关日志</div>' +
      logs.map(l => `
        <div class="wf-log-entry">
          <span class="wf-log-time">${l.time?.split('T')[1]?.split('.')[0] || ''}</span>
          <span class="wf-log-level ${l.level}">${(l.level || '').toUpperCase()}</span>
          <span class="wf-log-msg">${escapeHtml(l.msg || '')}</span>
        </div>
      `).join('');
  } else {
    logsEl.innerHTML = '';
  }

  // 更新 trace 选择器
  updateTraceSelector(tid);
}

function updateTraceSelector(currentTraceId) {
  const select = panelEl.querySelector('#wf-trace-select');
  const recentIds = getRecentTraceIds();

  select.innerHTML = recentIds.map(tid => {
    const summary = getTraceSummary(tid);
    const isCurrent = tid === currentTraceId;
    return `<option value="${tid}" ${isCurrent ? 'selected' : ''}>
      ${tid.slice(-12)} (${summary.completedSpans} spans, ${formatDuration(summary.totalDuration)})
    </option>`;
  }).join('');
}

// ─── 显示/隐藏 ──────────────────────────────────────────

export function showPanel(traceId) {
  const panel = ensurePanel();
  isVisible = true;
  panel.classList.add('visible');
  renderPanel(traceId);
  wfLogger.debug('瀑布图面板打开');
}

export function hidePanel() {
  if (panelEl) {
    panelEl.classList.remove('visible');
    isVisible = false;
  }
}

export function togglePanel() {
  if (isVisible) {
    hidePanel();
  } else {
    showPanel();
  }
}

// ─── 导出 ────────────────────────────────────────────────

function exportPanelData() {
  const traceId = panelEl?.querySelector('#wf-trace-select')?.value || getCurrentTraceId();
  if (!traceId) return;

  // 动态导入避免循环依赖
  import('./perf-trace.js?v=5').then(({ exportTraceData }) => {
    const data = exportTraceData(traceId);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace_${traceId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    wfLogger.info('trace 数据已导出', { traceId });
  });
}

// ─── 工具函数 ────────────────────────────────────────────

function formatDuration(ms) {
  if (ms === undefined || ms === null) return '--';
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
