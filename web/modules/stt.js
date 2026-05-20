/**
 * 语音输入模块 — Web Speech Recognition API
 *
 * 使用浏览器原生语音识别，将用户语音转为文字输入。
 * - 支持中文语音识别
 * - 实时显示识别结果
 * - 自动提交到聊天输入框
 */

// ─── 状态 ──────────────────────────────────────────────

let recognition = null;
let isListening = false;
let isSupported = false;

// ─── 初始化 ────────────────────────────────────────────

/**
 * 检查浏览器是否支持 Web Speech Recognition API
 */
export function isSTTSupported() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return !!SpeechRecognition;
}

/**
 * 初始化语音识别
 * @param {object} options
 * @param {string} options.lang - 语言代码 (默认 'zh-CN')
 * @param {function} options.onResult - 识别结果回调 (text: string, isFinal: boolean)
 * @param {function} options.onStart - 开始识别回调
 * @param {function} options.onEnd - 结束识别回调
 * @param {function} options.onError - 错误回调 (error: string)
 * @returns {SpeechRecognition|null}
 */
export function initRecognition(options = {}) {
  if (!isSTTSupported()) {
    console.warn('[STT] Web Speech Recognition API not supported');
    isSupported = false;
    return null;
  }

  isSupported = true;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  recognition = new SpeechRecognition();
  recognition.lang = options.lang || 'zh-CN';
  recognition.continuous = false; // 单次识别
  recognition.interimResults = true; // 显示中间结果
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    updateMicUI();
    options.onStart?.();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    // 回调：优先返回 final，否则返回 interim
    if (finalTranscript) {
      options.onResult?.(finalTranscript, true);
    } else if (interimTranscript) {
      options.onResult?.(interimTranscript, false);
    }
  };

  recognition.onerror = (event) => {
    console.warn('[STT] Recognition error:', event.error);
    isListening = false;
    updateMicUI();

    // 常见错误处理
    const errorMap = {
      'no-speech': '未检测到语音，请重试',
      'audio-capture': '无法访问麦克风，请检查权限',
      'not-allowed': '麦克风权限被拒绝',
      'network': '网络错误，语音识别需要网络连接',
      'aborted': '识别已取消',
    };

    options.onError?.(errorMap[event.error] || `识别错误: ${event.error}`);
  };

  recognition.onend = () => {
    isListening = false;
    updateMicUI();
    options.onEnd?.();
  };

  return recognition;
}

// ─── 控制 API ─────────────────────────────────────────

/**
 * 开始语音识别
 */
export function startListening() {
  if (!recognition) {
    console.warn('[STT] Recognition not initialized');
    return false;
  }

  if (isListening) {
    stopListening();
    return false;
  }

  try {
    recognition.start();
    return true;
  } catch (err) {
    console.warn('[STT] Start failed:', err);
    return false;
  }
}

/**
 * 停止语音识别
 */
export function stopListening() {
  if (recognition && isListening) {
    recognition.stop();
  }
}

/**
 * 获取当前状态
 */
export function getSTTState() {
  return { isListening, isSupported };
}

// ─── UI 更新 ─────────────────────────────────────────

function updateMicUI() {
  const btn = document.getElementById('btn-voice-input');
  if (!btn) return;

  if (isListening) {
    btn.classList.add('listening');
    btn.setAttribute('title', '点击停止');
  } else {
    btn.classList.remove('listening');
    btn.setAttribute('title', '语音输入');
  }
}

// ─── 聊天输入框集成 ─────────────────────────────────────

/**
 * 将识别文本填入聊天输入框
 * @param {string} text - 识别的文本
 * @param {boolean} isFinal - 是否为最终结果
 */
function fillChatInput(text, isFinal) {
  // 尝试找到 pi-chat-panel 的 textarea
  const textarea = document.querySelector('message-editor textarea')
    || document.querySelector('#chat textarea')
    || document.querySelector('textarea');

  if (!textarea) {
    console.warn('[STT] Chat textarea not found');
    return;
  }

  if (isFinal) {
    // 最终结果：追加到输入框
    const currentValue = textarea.value || '';
    const separator = currentValue && !currentValue.endsWith(' ') ? ' ' : '';
    textarea.value = currentValue + separator + text;

    // 触发 input 事件
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // 聚焦输入框
    textarea.focus();
  } else {
    // 中间结果：显示为 placeholder 或临时文本
    textarea.setAttribute('data-interim', text);
    // 也可以在输入框下方显示临时文本
    showInterimText(text);
  }
}

// ─── 临时识别文本显示 ─────────────────────────────────

let interimEl = null;

function showInterimText(text) {
  if (!interimEl) {
    interimEl = document.createElement('div');
    interimEl.id = 'stt-interim-text';
    interimEl.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      padding: 8px 12px;
      background: var(--color-bg-elevated, #1e1e2e);
      color: var(--color-text-muted, #888);
      font-size: 13px;
      font-style: italic;
      border-top: 1px solid var(--color-border-subtle);
      display: none;
      z-index: 10;
    `;

    // 插入到聊天输入区域
    const chatBody = document.getElementById('map-chat-body');
    if (chatBody) {
      chatBody.appendChild(interimEl);
    }
  }

  if (text) {
    interimEl.textContent = `🎤 ${text}`;
    interimEl.style.display = 'block';
  } else {
    interimEl.style.display = 'none';
  }
}

// ─── 全局暴露 ─────────────────────────────────────────

window._stt = {
  initRecognition,
  startListening,
  stopListening,
  getSTTState,
  isSTTSupported,
};
