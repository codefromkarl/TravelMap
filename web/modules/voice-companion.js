/**
 * 语音伴游问答模块 — 全语音对话的伴游体验
 *
 * 流程：
 * 1. 用户语音提问（STT）
 * 2. 文本送入 companionQATool 获取答案
 * 3. TTS 朗读答案
 *
 * 支持：
 * - 连续对话模式
 * - 多语言语音问答
 * - 打断/继续控制
 */

import { initRecognition, startListening, stopListening, getSTTState, isSTTSupported } from './stt.js?v=4';
import { speak, stop as stopTTS, getState as getTTSState, isTTSSupported } from './tts.js?v=4';

// ─── 状态 ──────────────────────────────────────────────

let isActive = false;
let currentTripPlan = null;
let conversationHistory = [];
let onStateChangeCallback = null;

// ─── 核心 API ─────────────────────────────────────────

/**
 * 检查是否支持语音伴游
 */
export function isVoiceCompanionSupported() {
  return isSTTSupported() && isTTSSupported();
}

/**
 * 设置行程数据
 */
export function setTripPlanForCompanion(tripPlan) {
  currentTripPlan = tripPlan;
  conversationHistory = [];
}

/**
 * 开始语音伴游会话
 * @param {object} options
 * @param {function} options.onQuestion - 收到问题回调 (text: string)
 * @param {function} options.onAnswer - 收到答案回调 (text: string)
 * @param {function} options.onError - 错误回调 (error: string)
 * @param {function} options.onStateChange - 状态变化回调 (state: object)
 */
export function startVoiceCompanion(options = {}) {
  if (!isVoiceCompanionSupported()) {
    options.onError?.('浏览器不支持语音功能');
    return false;
  }

  if (isActive) return true;

  onStateChangeCallback = options.onStateChange;

  // 初始化语音识别
  initRecognition({
    lang: 'zh-CN',
    onStart: () => {
      updateState('listening');
    },
    onResult: async (text, isFinal) => {
      if (isFinal && text.trim()) {
        options.onQuestion?.(text);
        updateState('processing');

        // 停止识别，等待处理完成
        stopListening();

        // 这里需要通过 Agent 调用 companionQATool
        // 由于工具调用需要通过 Agent 框架，这里返回问题文本
        // 由调用方（chat-init.js）处理工具调用和 TTS 播放
        window._voiceCompanionQuestion?.(text);
      }
    },
    onEnd: () => {
      if (isActive) {
        // 如果还在伴游模式，重新开始监听
        setTimeout(() => {
          if (isActive) {
            startListening();
          }
        }, 500);
      }
    },
    onError: (errMsg) => {
      options.onError?.(errMsg);
      if (isActive) {
        // 错误后继续监听
        setTimeout(() => {
          if (isActive) startListening();
        }, 1000);
      }
    },
  });

  isActive = true;
  startListening();
  updateState('active');

  return true;
}

/**
 * 停止语音伴游会话
 */
export function stopVoiceCompanion() {
  isActive = false;
  stopListening();
  stopTTS();
  updateState('idle');
}

/**
 * 播放答案（TTS）
 * @param {string} answerText - 答案文本
 * @param {object} options
 * @param {function} options.onEnd - 播放完成回调
 */
export function speakAnswer(answerText, options = {}) {
  if (!isTTSSupported()) {
    options.onEnd?.();
    return;
  }

  updateState('speaking');

  speak(answerText, {
    rate: 0.95, // 伴游语速稍慢
    onEnd: () => {
      updateState('listening');
      options.onEnd?.();

      // 播放完成后继续监听
      if (isActive) {
        setTimeout(() => {
          if (isActive) startListening();
        }, 300);
      }
    },
  });
}

/**
 * 获取当前状态
 */
export function getCompanionState() {
  return {
    isActive,
    isSupported: isVoiceCompanionSupported(),
    ...getTTSState(),
    ...getSTTState(),
  };
}

// ─── UI 更新 ─────────────────────────────────────────

function updateState(state) {
  const btn = document.getElementById('btn-voice-companion');
  if (btn) {
    btn.classList.toggle('active', isActive);
    btn.setAttribute('data-state', state);

    const stateLabels = {
      'idle': '语音伴游',
      'active': '正在聆听...',
      'listening': '正在聆听...',
      'processing': '思考中...',
      'speaking': '播报中...',
    };

    const label = btn.querySelector('.companion-label');
    if (label) {
      label.textContent = stateLabels[state] || '语音伴游';
    }
  }

  onStateChangeCallback?.({ isActive, state });
}

// ─── 全局暴露 ─────────────────────────────────────────

window._voiceCompanion = {
  isVoiceCompanionSupported,
  setTripPlanForCompanion,
  startVoiceCompanion,
  stopVoiceCompanion,
  speakAnswer,
  getCompanionState,
};
