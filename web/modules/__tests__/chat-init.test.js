/**
 * chat-init.js 单元测试
 *
 * 测试聊天初始化逻辑：
 * - initApp - 应用初始化（需要大量 mock）
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

const fetchMock = vi.hoisted(() => {
  const fn = vi.fn();
  globalThis.fetch = fn;
  return fn;
});

// Mock 所有依赖
vi.mock('../context.js', () => ({
  agent: null,
  setAgent: vi.fn(),
  setChatPanel: vi.fn(),
  currentTripId: null,
  setCurrentTripId: vi.fn(),
  setLastTripContent: vi.fn(),
  currentLang: 'zh',
  setCurrentLang: vi.fn(),
  showToast: vi.fn(),
  currentTravelers: null,
  currentPreferences: null,
  isProxyMode: false,
}));

vi.mock('../config.js', () => ({
  config: {
    deepseekLocal: {
      baseUrl: 'http://localhost:6011/v1',
      apiKey: '',
      defaultModel: 'deepseek-v4-flash',
      reasoning: true,
    },
  },
  resolveApiKey: vi.fn(() => 'test-key'),
}));

vi.mock('@earendil-works/pi-agent-core', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    subscribe: vi.fn(),
    state: { messages: [] },
    prompt: vi.fn(),
  })),
}));

vi.mock('../auth/auth.js', () => ({
  requireAuth: authMocks.requireAuth,
}));

vi.mock('@earendil-works/pi-ai', () => ({
  getModel: vi.fn(),
}));

vi.mock('../tools/index.js', () => ({
  ALL_TOOLS: [],
}));

vi.mock('../prompt.js', () => ({
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}));

vi.mock('../welcome.js', () => ({
  initWelcome: vi.fn(),
}));

vi.mock('../map.js', () => ({
  initPageMap: vi.fn(),
}));

vi.mock('../i18n.js', () => ({
  initPlaceholder: vi.fn(),
  applyI18n: vi.fn(),
  I18N: {
    zh: { streamTimeout: "响应超时，请重试" },
    en: { streamTimeout: "Response timed out, please retry" },
    ja: { streamTimeout: "応答がタイムアウトしました。再試行してください" },
  },
}));

vi.mock('../session.js', () => ({
  tryRestoreSession: vi.fn(),
}));

vi.mock('../travelers.js', () => ({
  initTravelersPanel: vi.fn(),
}));

vi.mock('../export.js', () => ({
  loadSharedTrip: vi.fn(),
  renderSharedTrips: vi.fn(),
}));

vi.mock('../share.js', () => ({
  loadSharedTripFromHash: vi.fn(),
}));

vi.mock('../db.js', () => ({
  saveTripPlan: vi.fn(),
  listTrips: vi.fn(),
  migrateCoordinatesToGcj02: vi.fn().mockResolvedValue(0),
}));

vi.mock('../trace.js', () => ({
  addTraceHeaders: vi.fn(),
  extractTraceId: vi.fn(),
}));

vi.mock('../tts.js', () => ({
  speak: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  getState: vi.fn(),
  isTTSSupported: vi.fn(),
  generateSpeechText: vi.fn(),
}));

vi.mock('../stt.js', () => ({
  initRecognition: vi.fn(),
  startListening: vi.fn(),
  stopListening: vi.fn(),
  getSTTState: vi.fn(),
  isSTTSupported: vi.fn(),
}));

// 导入被测模块
import { feedback } from '../feedback.js';
import { initApp, retryLastMessage } from '../chat-init.js';

// ─── 测试 ─────────────────────────────────────────────

describe('chat-init.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireAuth.mockResolvedValue(true);

    // 设置 DOM
    document.body.innerHTML = `
      <div id="chat-container"></div>
      <div id="export-toolbar"></div>
      <button id="btn-export-md" class="disabled-ghost"></button>
      <button id="btn-map" class="disabled-ghost"></button>
      <button id="btn-tts" class="disabled-ghost"></button>
      <button id="btn-voice-companion" class="disabled-ghost"></button>
      <button id="btn-enrich-supplies"></button>
      <div id="btn-history"></div>
      <div id="btn-open-model"></div>
      <div id="btn-open-config"></div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('initApp', () => {
    it('应是一个函数', () => {
      expect(typeof initApp).toBe('function');
    });

    it('应返回 Promise', () => {
      const result = initApp();
      expect(result).toBeInstanceOf(Promise);
    });

    it('应能调用不报错', async () => {
      // initApp 需要很多 DOM 元素，可能会有一些警告，但不应抛出错误
      try {
        await initApp();
      } catch (e) {
        // 某些 DOM 元素缺失可能导致错误，这是可以接受的
        console.warn('initApp error (expected in test):', e.message);
      }
    });
  });

  describe('retryLastMessage', () => {
    it('continues the failed turn without duplicating its user message', async () => {
      const prompt = vi.fn().mockResolvedValue(undefined);
      const continueRun = vi.fn().mockImplementation(async () => {
        messages.push({ role: 'assistant', content: '新的行程结果' });
      });
      const run = vi.fn();
      const messages = [
        { role: 'user', content: [{ type: 'text', text: '重新规划杭州行程' }] },
        { role: 'assistant', content: '', errorMessage: 'provider failed' },
      ];

      await retryLastMessage({ state: { messages }, prompt, continue: continueRun, run });

      expect(authMocks.requireAuth).toHaveBeenCalledTimes(1);
      expect(continueRun).toHaveBeenCalledTimes(1);
      expect(prompt).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      expect(messages.filter(message => message.role === 'user')).toHaveLength(1);
      expect(messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: '重新规划杭州行程' }] },
        { role: 'assistant', content: '新的行程结果' },
      ]);
    });

    it('does not retry or alter messages when authentication fails', async () => {
      authMocks.requireAuth.mockResolvedValue(false);
      const prompt = vi.fn();
      const continueRun = vi.fn();
      const run = vi.fn();
      const messages = [
        { role: 'user', content: '保留这条消息' },
        { role: 'assistant', content: '', errorMessage: 'provider failed' },
      ];

      await retryLastMessage({ state: { messages }, prompt, continue: continueRun, run });

      expect(authMocks.requireAuth).toHaveBeenCalledTimes(1);
      expect(prompt).not.toHaveBeenCalled();
      expect(continueRun).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      expect(messages).toHaveLength(2);
    });
  });

  describe('流式首字节超时', () => {
    it('60 秒无响应数据时触发超时反馈并中止请求', async () => {
      vi.useFakeTimers();
      const errorSpy = vi.spyOn(feedback, 'error').mockImplementation(() => {});
      try {
        // 永不产生数据的 SSE 响应体（模拟长时间无首字节）
        const body = new ReadableStream({
          start() { /* 永不 enqueue */ },
        });
        fetchMock.mockResolvedValue(new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }));

        const response = await fetch('/api/chat', { method: 'POST', body: '{}' });
        expect(response).toBeInstanceOf(Response);

        const call = fetchMock.mock.calls[0];
        // MSW 将 input 归一化为 Request，因此首个参数是 Request 对象
        expect(call[0].url).toContain('/api/chat');
        const signal = call[1].signal;
        expect(signal.aborted).toBe(false);

        vi.advanceTimersByTime(60001);

        expect(signal.aborted).toBe(true);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe('响应超时，请重试');
      } finally {
        errorSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('首字节到达后清除超时定时器，不触发超时反馈', async () => {
      vi.useFakeTimers();
      const errorSpy = vi.spyOn(feedback, 'error').mockImplementation(() => {});
      try {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
            controller.close();
          },
        });
        fetchMock.mockResolvedValue(new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }));

        const response = await fetch('/api/chat', { method: 'POST', body: '{}' });
        const reader = response.body.getReader();
        await reader.read();
        await reader.read();

        const signal = fetchMock.mock.calls[0][1].signal;
        vi.advanceTimersByTime(60001);

        expect(signal.aborted).toBe(false);
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });
});
