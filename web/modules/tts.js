/**
 * 语音播报模块 — Web Speech API TTS
 *
 * 使用浏览器原生 TTS 朗读行程摘要，零外部依赖。
 * - 支持中文语音
 * - 可调节语速/音调
 * - 播放/暂停/停止控制
 */

// ─── 状态 ──────────────────────────────────────────────

let currentUtterance = null;
let isPlaying = false;
let isPaused = false;

// ─── 核心 API ─────────────────────────────────────────

/**
 * 检查浏览器是否支持 Web Speech API
 */
export function isTTSSupported() {
  return 'speechSynthesis' in window;
}

/**
 * 获取最佳中文语音
 * 优先选择：中文 > Google/Microsoft > 默认
 */
function getBestChineseVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // 优先：Google 中文语音
  const googleCn = voices.find(v =>
    v.lang.startsWith('zh') && v.name.includes('Google')
  );
  if (googleCn) return googleCn;

  // 次选：Microsoft 中文语音
  const msCn = voices.find(v =>
    v.lang.startsWith('zh') && v.name.includes('Microsoft')
  );
  if (msCn) return msCn;

  // 兜底：任意中文语音
  const anyCn = voices.find(v => v.lang.startsWith('zh'));
  if (anyCn) return anyCn;

  // 最后：默认语音
  return voices[0] || null;
}

/**
 * 播放语音
 * @param {string} text - 要朗读的文本
 * @param {object} options - 选项
 * @param {number} options.rate - 语速 (0.5-2, 默认 1)
 * @param {number} options.pitch - 音调 (0-2, 默认 1)
 * @param {function} options.onStart - 开始播放回调
 * @param {function} options.onEnd - 播放结束回调
 * @param {function} options.onPause - 暂停回调
 * @param {function} options.onResume - 恢复回调
 * @returns {SpeechSynthesisUtterance}
 */
export function speak(text, options = {}) {
  if (!isTTSSupported()) {
    console.warn('[TTS] Web Speech API not supported');
    return null;
  }

  // 停止之前的播放
  stop();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate || 1;
  utterance.pitch = options.pitch || 1;
  utterance.volume = 1;
  utterance.lang = 'zh-CN';

  // 设置语音
  const voice = getBestChineseVoice();
  if (voice) {
    utterance.voice = voice;
  }

  // 事件回调
  utterance.onstart = () => {
    isPlaying = true;
    isPaused = false;
    updateUI();
    options.onStart?.();
  };

  utterance.onend = () => {
    isPlaying = false;
    isPaused = false;
    currentUtterance = null;
    updateUI();
    options.onEnd?.();
  };

  utterance.onpause = () => {
    isPlaying = false;
    isPaused = true;
    updateUI();
    options.onPause?.();
  };

  utterance.onresume = () => {
    isPlaying = true;
    isPaused = false;
    updateUI();
    options.onResume?.();
  };

  utterance.onerror = (e) => {
    if (e.error !== 'canceled') {
      console.warn('[TTS] Speech error:', e.error);
    }
    isPlaying = false;
    isPaused = false;
    currentUtterance = null;
    updateUI();
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);

  return utterance;
}

/**
 * 暂停播放
 */
export function pause() {
  if (isPlaying) {
    window.speechSynthesis.pause();
  }
}

/**
 * 恢复播放
 */
export function resume() {
  if (isPaused) {
    window.speechSynthesis.resume();
  }
}

/**
 * 停止播放
 */
export function stop() {
  window.speechSynthesis.cancel();
  isPlaying = false;
  isPaused = false;
  currentUtterance = null;
  updateUI();
}

/**
 * 获取播放状态
 */
export function getState() {
  return { isPlaying, isPaused };
}

// ─── UI 更新 ─────────────────────────────────────────

function updateUI() {
  const btn = document.getElementById('btn-tts');
  if (!btn) return;

  const icon = btn.querySelector('.tts-icon');
  const label = btn.querySelector('.tts-label');

  if (isPlaying) {
    btn.classList.add('playing');
    btn.classList.remove('paused');
    if (icon) icon.textContent = '⏸';
    if (label) label.textContent = '暂停';
  } else if (isPaused) {
    btn.classList.add('paused');
    btn.classList.remove('playing');
    if (icon) icon.textContent = '▶️';
    if (label) label.textContent = '继续';
  } else {
    btn.classList.remove('playing', 'paused');
    if (icon) icon.textContent = '🔊';
    if (label) label.textContent = '语音播报';
  }
}

// ─── 行程摘要生成（前端版，供直接调用） ──────────────────

/**
 * 从行程数据生成播报文本（前端直接调用，无需 tool）
 * @param {object} tripPlan - 行程数据
 * @returns {string}
 */
export function generateSpeechText(tripPlan) {
  if (!tripPlan || !tripPlan.days) return '';

  const parts = [];
  const cities = tripPlan.cities || [tripPlan.city];
  const cityNames = cities.length > 1 ? cities.join('、') : tripPlan.city;

  parts.push(`为您播报${cityNames}${tripPlan.days.length}天行程概览。`);

  for (let i = 0; i < tripPlan.days.length; i++) {
    const day = tripPlan.days[i];
    const dayNum = day.date || `第${i + 1}`;
    const cityLabel = cities.length > 1 ? `，${day.city}` : '';

    if (day.isTransferDay) {
      parts.push(`${dayNum}是交通转移日。`);
      continue;
    }

    const attrs = day.attractions || [];
    if (attrs.length === 0) {
      parts.push(`${dayNum}行程自由安排。`);
      continue;
    }

    const names = attrs.map(a => a.nameZh || a.name).join('、');
    parts.push(`${dayNum}${cityLabel}，游览${attrs.length}个景点：${names}。`);

    if (day.meals?.length > 0) {
      const mealDesc = day.meals
        .map(m => `${m.type === 'lunch' ? '午餐' : '晚餐'}推荐${m.name}`)
        .join('，');
      parts.push(mealDesc + '。');
    }
  }

  parts.push('祝您旅途愉快！');
  return parts.join('');
}

// ─── 全局暴露 ─────────────────────────────────────────

window._tts = { speak, pause, resume, stop, getState, isTTSSupported, generateSpeechText };
