/**
 * 行程编辑器 — 对已保存的历史行程进行结构化调整
 *
 * 能力：
 * - 调整景点在当天内的顺序（↑/↓）
 * - 将景点移动到前一天 / 后一天
 * - 删除景点 / 删除整天
 * - 调整整天顺序
 * - 保存后重新渲染地图
 *
 * 入口：历史行程卡片上的「编辑」按钮
 */

import { loadTripById, saveTripPlan } from '../db.js';
import { currentLang, showToast } from '../infra/context.js';
import { I18N } from '../infra/i18n.js';
import { createLogger } from '../logger.js';

const logger = createLogger('trip-editor');

let editorOverlay = null;
let currentTrip = null;
let currentPlan = null;

// ─── 渲染 ────────────────────────────────────────────

function render() {
  if (!editorOverlay || !currentPlan) return;
  const dict = I18N[currentLang] || I18N.zh;
  const body = editorOverlay.querySelector('.trip-editor-body');
  const days = currentPlan.days || [];
  body.innerHTML = days.map((day, dayIndex) => {
    const attractions = day.attractions || [];
    const items = attractions.map((attr, attrIndex) => {
      const name = attr.nameZh || attr.name || dict.tripEditorUnnamedAttr;
      const coordOk = attr.lat != null && attr.lng != null;
      return `
        <div class="trip-editor-item" data-day="${dayIndex}" data-attr="${attrIndex}">
          <span class="trip-editor-item-name" title="${name}">${name} ${coordOk ? '' : dict.tripEditorMissingCoord}</span>
          <span class="trip-editor-item-actions">
            <button type="button" class="trip-editor-btn" data-act="up" data-day="${dayIndex}" data-attr="${attrIndex}" title="${dict.tripEditorMoveUp}">↑</button>
            <button type="button" class="trip-editor-btn" data-act="down" data-day="${dayIndex}" data-attr="${attrIndex}" title="${dict.tripEditorMoveDown}">↓</button>
            <button type="button" class="trip-editor-btn" data-act="prev-day" data-day="${dayIndex}" data-attr="${attrIndex}" title="${dict.tripEditorPrevDay}" ${dayIndex === 0 ? 'disabled' : ''}>←天</button>
            <button type="button" class="trip-editor-btn" data-act="next-day" data-day="${dayIndex}" data-attr="${attrIndex}" title="${dict.tripEditorNextDay}" ${dayIndex === days.length - 1 ? 'disabled' : ''}>天→</button>
            <button type="button" class="trip-editor-btn danger" data-act="del" data-day="${dayIndex}" data-attr="${attrIndex}" title="${dict.tripEditorDeleteAttr}">✕</button>
          </span>
        </div>
      `;
    }).join('');
    const dayTitle = dict.tripEditorDayTitle.replace('{day}', dayIndex + 1);
    return `
      <div class="trip-editor-day" data-day="${dayIndex}">
        <div class="trip-editor-day-header">
          <span class="trip-editor-day-title">${dayTitle} <span class="trip-editor-day-date">${day.date || ''}</span></span>
          <span class="trip-editor-day-actions">
            <button type="button" class="trip-editor-btn" data-act="day-up" data-day="${dayIndex}" title="${dict.tripEditorDayUp}" ${dayIndex === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="trip-editor-btn" data-act="day-down" data-day="${dayIndex}" title="${dict.tripEditorDayDown}" ${dayIndex === days.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="trip-editor-btn danger" data-act="day-del" data-day="${dayIndex}" title="${dict.tripEditorDeleteDay}">🗑</button>
          </span>
        </div>
        ${items || '<div class="trip-editor-empty">' + dict.tripEditorEmpty + '</div>'}
      </div>
    `;
  }).join('');
}

// ─── 变更操作 ────────────────────────────────────────

function moveAttr(fromDay, attrIndex, toDay, toIndex) {
  const days = currentPlan.days;
  const [attr] = days[fromDay].attractions.splice(attrIndex, 1);
  if (!attr) return;
  if (toDay === fromDay) {
    const clamped = Math.max(0, Math.min(toIndex, days[fromDay].attractions.length));
    days[fromDay].attractions.splice(clamped, 0, attr);
  } else {
    days[toDay].attractions.splice(toIndex, 0, attr);
  }
}

function handleAction(button) {
  if (!currentPlan) return;
  const act = button.dataset.act;
  const day = Number(button.dataset.day);
  const attr = button.dataset.attr != null ? Number(button.dataset.attr) : null;
  const days = currentPlan.days;

  if (act === 'up' && attr > 0) {
    moveAttr(day, attr, day, attr - 1);
  } else if (act === 'down' && attr < days[day].attractions.length - 1) {
    moveAttr(day, attr, day, attr + 2);
  } else if (act === 'prev-day' && day > 0) {
    moveAttr(day, attr, day - 1, days[day - 1].attractions.length);
  } else if (act === 'next-day' && day < days.length - 1) {
    moveAttr(day, attr, day + 1, 0);
  } else if (act === 'del' && attr != null) {
    days[day].attractions.splice(attr, 1);
  } else if (act === 'day-up' && day > 0) {
    const [moved] = days.splice(day, 1);
    days.splice(day - 1, 0, moved);
  } else if (act === 'day-down' && day < days.length - 1) {
    const [moved] = days.splice(day, 1);
    days.splice(day + 1, 0, moved);
  } else if (act === 'day-del') {
    if (days.length <= 1) {
      const dict = I18N[currentLang] || I18N.zh;
      showToast(dict.tripEditorMinDayWarning, 2500, 'warning');
      return;
    }
    days.splice(day, 1);
  } else {
    return;
  }
  render();
  markDirty();
}

let dirty = false;
function markDirty() { dirty = true; }

// ─── 保存 ────────────────────────────────────────────

async function save() {
  if (!currentTrip || !currentPlan) return;
  const dict = I18N[currentLang] || I18N.zh;
  const updated = { ...currentTrip, tripPlan: currentPlan };
  try {
    await saveTripPlan(updated);
    // 同步全局状态与地图
    window._lastTripPlan = currentPlan;
    if (typeof window._renderTripAnimated === 'function') {
      window._renderTripAnimated(currentPlan);
    }
    dirty = false;
    showToast(dict.tripEditorSaved, 2500, 'success');
    logger.info('行程编辑已保存', { id: currentTrip.id, days: currentPlan.days.length });
  } catch (error) {
    logger.error('行程保存失败', error);
    showToast(dict.tripEditorSaveFailed + '：' + (error?.message || dict.tripEditorUnknownError), 3500, 'error');
  }
}

// ─── 打开 / 关闭 ─────────────────────────────────────

export async function openTripEditor(tripId) {
  const dict = I18N[currentLang] || I18N.zh;
  let trip;
  try {
    trip = await loadTripById(tripId);
  } catch (error) {
    logger.error('加载行程失败', error);
    showToast(dict.tripEditorLoadFailed, 2500, 'error');
    return;
  }
  if (!trip?.tripPlan || !Array.isArray(trip.tripPlan.days)) {
    showToast(dict.tripEditorNoStructuredData, 3000, 'warning');
    return;
  }
  currentTrip = trip;
  currentPlan = JSON.parse(JSON.stringify(trip.tripPlan)); // 深拷贝，取消不落库
  dirty = false;

  if (!editorOverlay) buildOverlay();
  render();
  editorOverlay.classList.add('open');
  editorOverlay.removeAttribute('hidden');
}

export function closeTripEditor() {
  if (!editorOverlay) return;
  editorOverlay.classList.remove('open');
  editorOverlay.setAttribute('hidden', '');
  currentTrip = null;
  currentPlan = null;
}

function buildOverlay() {
  const dict = I18N[currentLang] || I18N.zh;
  editorOverlay = document.createElement('div');
  editorOverlay.id = 'trip-editor-overlay';
  editorOverlay.className = 'trip-editor-overlay';
  editorOverlay.setAttribute('hidden', '');
  editorOverlay.innerHTML = `
    <div class="trip-editor">
      <div class="trip-editor-header">
        <h3>${dict.tripEditorTitle}</h3>
        <button type="button" class="close-btn" id="btn-close-trip-editor" aria-label="${dict.closeAria}">✕</button>
      </div>
      <div class="trip-editor-body"></div>
      <div class="trip-editor-footer">
        <span class="trip-editor-hint">${dict.tripEditorHint}</span>
        <button type="button" class="trip-editor-save" id="btn-save-trip-editor">${dict.tripEditorSave}</button>
      </div>
    </div>
  `;
  document.body.appendChild(editorOverlay);

  editorOverlay.querySelector('#btn-close-trip-editor').addEventListener('click', () => {
    if (dirty && !window.confirm(dict.tripEditorCloseConfirm)) return;
    closeTripEditor();
  });
  editorOverlay.querySelector('#btn-save-trip-editor').addEventListener('click', save);
  editorOverlay.querySelector('.trip-editor-body').addEventListener('click', (event) => {
    const button = event.target.closest('.trip-editor-btn');
    if (button) handleAction(button);
  });
  editorOverlay.addEventListener('click', (event) => {
    if (event.target === editorOverlay) {
      if (dirty && !window.confirm(dict.tripEditorCloseConfirm)) return;
      closeTripEditor();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && editorOverlay?.classList.contains('open')) {
      if (dirty && !window.confirm(dict.tripEditorCloseConfirm)) return;
      closeTripEditor();
    }
  });
}

// 供 history.js 调用
window._openTripEditor = openTripEditor;
