// ─── 修复 text/event-stream 缺少 charset=utf-8 导致中文乱码 ──
// cli-proxyapi 返回 Content-Type: text/event-stream（无 charset），
// 浏览器按 HTTP 规范默认 ISO-8859-1 解码流，UTF-8 中文变成乱码。
// 拦截 fetch，对 SSE 响应强制修正 Content-Type，并注入 trace headers。
const _origFetch = globalThis.fetch;
globalThis.fetch = function fixedCharsetFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
  
  // ─── 注入 trace headers（仅 LLM API 请求） ─────────
  const isLlmRequest = url.includes('/v1/chat/completions') || url.includes('/v1/messages') || url.includes('/api/chat');
  if (isLlmRequest && init && typeof window !== 'undefined' && window.__traceAddHeaders) {
    try {
      const traceHeaders = window.__traceAddHeaders(init.headers || {});
      init.headers = traceHeaders;
    } catch (e) {
      // trace 模块未加载时忽略
    }
  }
  
  return _origFetch.call(this, input, init).then(resp => {
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('text/event-stream') && !ct.includes('charset')) {
      const headers = new Headers(resp.headers);
      headers.set('content-type', 'text/event-stream; charset=utf-8');
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    }
    return resp;
  });
};

// ─── ChatPanel 初始化 + Agent 事件监听 ────────────────

import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { config, resolveApiKey } from './config.js';
import {
  isProxyMode, setAgent, setChatPanel, currentTripId, setCurrentTripId, setLastTripContent,
  currentLang, setCurrentLang, showToast, currentTravelers, currentPreferences,
} from './context.js';
import { speak, pause, resume, stop, getState, isTTSSupported, generateSpeechText } from './tts.js';
import { initRecognition, startListening, stopListening, getSTTState, isSTTSupported } from './stt.js';
import { ALL_TOOLS } from './tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { initWelcome } from './welcome.js';
import { initPageMap } from './map.js';
import { initPlaceholder, applyI18n } from './i18n.js';
import { tryRestoreSession } from './session.js';
import { initTravelersPanel } from './travelers.js';
import { loadSharedTrip, renderSharedTrips } from './export.js';
import { loadSharedTripFromHash } from './share.js';
import { saveTripPlan, listTrips } from './db.js';
import { addTraceHeaders, extractTraceId } from './trace.js';

export async function initApp() {
  // ─── 读取 provider/model 配置 ─────────────────────────
  // 默认使用本地 ds2api 的 DeepSeek（免费，无需用户配置 API Key）
  const ds = config.deepseekLocal;
  const provider = localStorage.getItem("travel-agent-provider") || "deepseek-local";
  const modelId = localStorage.getItem("travel-agent-model") || ds.defaultModel;

  let model;
  if (provider === "deepseek-local" || (!localStorage.getItem("travel-agent-provider") && !localStorage.getItem("travel-agent-model"))) {
    // 默认：本地 ds2api DeepSeek
    const useReasoning = ds.reasoning !== false;
    model = {
      id: ds.defaultModel, name: "DeepSeek V4 Flash", api: "openai-completions",
      provider: "deepseek",
      baseUrl: ds.baseUrl,
      reasoning: useReasoning, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000, maxTokens: 8192,
    };
  } else if (provider === "custom") {
    const customUrl = localStorage.getItem("custom-llm-url");
    model = {
      id: modelId, name: modelId, api: "openai-completions",
      provider: "openai",
      baseUrl: (customUrl || "https://api.openai.com/v1").replace(/\/$/, ""),
      reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000, maxTokens: 4096,
    };
  } else {
    model = getModel(provider, modelId);
  }

  // ─── 创建 Agent ───────────────────────────────────────
  const _agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(currentLang),
      model,
      thinkingLevel: localStorage.getItem("travel-agent-thinking") || "medium",
      tools: [...ALL_TOOLS],
      messages: [],
    },
    getApiKey: (prov) => resolveApiKey(prov),
  });
  setAgent(_agent);

  // 暴露 panels 供其他模块通过 window 调用
  const panelModule = await import('./panels.js');
  window._panels = { openPanel: panelModule.openPanel, closePanel: panelModule.closePanel, closeAllPanels: panelModule.closeAllPanels };

  // ─── Agent 事件监听 ──────────────────────────────────
  let lastTripContentInner = "";
  let planTimeout = null;
  function resetToolbarAfterError() {
    window._hidePlanningIndicator?.();
    document.getElementById("export-toolbar")?.classList.add("visible");
    ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map", "btn-tts", "btn-poster", "btn-voice-companion"].forEach(id => {
      document.getElementById(id)?.classList.remove("disabled-ghost");
    });
  }

  /**
   * 根据错误消息分类显示用户友好的 Toast 提示（带重试按钮）
   */
  function showErrorToast(errMsg) {
    const isRetryable = (msg) => {
      const m = msg.toLowerCase();
      return m.includes('fetch') || m.includes('network') || m.includes('failed to fetch')
        || m.includes('networkerror') || m.includes('err_connection') || m.includes('timeout')
        || m.includes('timed out') || m.includes('500') || m.includes('502')
        || m.includes('503') || m.includes('server error');
    };
    const retryAction = isRetryable(errMsg) ? {
      label: currentLang === 'zh' ? '重试' : currentLang === 'ja' ? '再試行' : 'Retry',
      onClick: () => {
        // 重新发送最后一条用户消息
        const msgs = _agent.state.messages;
        const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
          const content = typeof lastUserMsg.content === 'string' ? lastUserMsg.content
            : Array.isArray(lastUserMsg.content) ? lastUserMsg.content.filter(c => c.type === 'text').map(c => c.text).join('') : '';
          if (content) {
            // 移除最后的错误消息
            const lastAssistant = msgs.filter(m => m.role === 'assistant').slice(-1)[0];
            if (lastAssistant?.errorMessage) msgs.pop();
            _agent.run(content);
          }
        }
      }
    } : null;

    const msg = errMsg.toLowerCase();
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('err_connection')) {
      showToast(currentLang === 'zh' ? '🌐 网络连接失败，请检查网络后重试' : currentLang === 'ja' ? '🌐 ネットワーク接続に失敗しました' : '🌐 Network error, please check your connection', 6000, 'error', retryAction);
    } else if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('incorrect api key') || msg.includes('invalid_api_key')) {
      showToast(currentLang === 'zh' ? '🔑 API Key 无效，请在设置中检查' : currentLang === 'ja' ? '🔑 API Key が無効です' : '🔑 Invalid API Key, please check settings', 5000, 'error');
    } else if (msg.includes('429') || msg.includes('rate') || msg.includes('rate limit') || msg.includes('too many requests')) {
      showToast(currentLang === 'zh' ? '⏳ 请求过于频繁，请稍后重试' : currentLang === 'ja' ? '⏳ リクエストが多すぎます' : '⏳ Rate limited, please try again later', 5000, 'warning');
    } else if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort')) {
      if (!msg.includes('user abort')) {
        showToast(currentLang === 'zh' ? '⏱️ 请求超时，请稍后重试' : currentLang === 'ja' ? '⏱️ リクエストがタイムアウトしました' : '⏱️ Request timed out, please try again', 6000, 'warning', retryAction);
      }
    } else if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('server error')) {
      showToast(currentLang === 'zh' ? '🔧 服务器错误，请稍后重试' : currentLang === 'ja' ? '🔧 サーバーエラーです' : '🔧 Server error, please try again later', 6000, 'error', retryAction);
    } else {
      showToast(currentLang === 'zh' ? `❌ 规划失败：${errMsg.slice(0, 60)}` : `❌ Error: ${errMsg.slice(0, 60)}`, 5000, 'error', retryAction);
    }
  }
  _agent.subscribe((event) => {
    if (event.type === "agent_end") {
      if (planTimeout) { clearTimeout(planTimeout); planTimeout = null; }
      window._hidePlanningIndicator?.();

      const msgs = _agent.state.messages;

      // ─── 检查是否有 errorMessage（Agent 内部异常，走 handleRunFailure）
      const lastAssistant = msgs.filter(m => m.role === 'assistant').slice(-1)[0];
      if (lastAssistant?.errorMessage) {
        resetToolbarAfterError();
        const errMsg = lastAssistant.errorMessage;
        console.error("[ChatInit] Agent run failure:", errMsg);
        showErrorToast(errMsg);
        return;
      }

      // ─── 正常完成：提取行程内容
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role === "assistant") {
          const content = typeof m.content === "string" ? m.content :
            Array.isArray(m.content) ? m.content.filter(c => c.type === 'text').map(c => c.text).join('') : '';
          if (content.length > 100) {
            if (content !== lastTripContentInner) {
              lastTripContentInner = content;
              setLastTripContent(content);
              document.getElementById("export-toolbar")?.classList.add("visible");
              ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map", "btn-tts", "btn-poster", "btn-voice-companion"].forEach(id => {
                document.getElementById(id)?.classList.remove("disabled-ghost");
              });
            }
            break;
          }
        }
      }

      // ─── 从 tool results 中提取 tripPlan 并刷新地图 ──
      for (const msg of msgs) {
        if (msg.role === "toolResult" && msg.details) {
          const details = msg.details;
          if (details && details.tripPlan) {
            window._lastTripPlan = details.tripPlan;
            // 校验坐标完整性
            try {
              const { validateAndWarn } = await import('./tools/validate-trip.js');
              validateAndWarn(details.tripPlan);
            } catch (_) { /* 校验模块加载失败不阻塞 */ }
            document.getElementById("btn-map")?.classList.remove("disabled-ghost");
            if (window.currentPage === "page-map") {
              if (typeof window._initPageMap === "function") window._initPageMap();
              // 使用动画渲染（如果可用），否则 fallback 到普通渲染
              if (typeof window._renderTripAnimated === "function") {
                window._renderTripAnimated(details.tripPlan);
              }
            }
            const hasSupplies = details.tripPlan.days?.some(d =>
              d.attractions?.some(a =>
                a.routes?.some(r => r.waypoints?.some(wp => wp.supplyPoints?.length > 0))
              )
            );
            if (hasSupplies) {
              document.getElementById("btn-enrich-supplies")?.style.setProperty("display", "inline-block");
            }
            break;
          }
        }
      }
      autoSaveTrip();
    }
    if (event.type === "turn_start") {
      window._showPlanningIndicator?.('正在规划行程...');
      document.getElementById("export-toolbar")?.classList.remove("visible");
      ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map", "btn-tts", "btn-poster", "btn-voice-companion"].forEach(id => {
        document.getElementById(id)?.classList.add("disabled-ghost");
      });
      setCurrentTripId(null);
      if (planTimeout) clearTimeout(planTimeout);
      planTimeout = setTimeout(() => {
        resetToolbarAfterError();
        showToast("请求超时，请重试", 4000, 'warning');
      }, 60000);
    }
    // ─── Tool 级增量渲染（A2）────────────────────────
    if (event.type === "tool_execution_end" && window.currentPage === "page-map") {
      const { toolName, result } = event;
      if (!result || result.isError) return;

      // 景点工具返回后，在地图上添加半透明预览 marker
      if (toolName === "search_attractions" || toolName === "searchAttractions") {
        const details = result.result?.details || result.result;
        if (details?.attractions && window._addAttractionPreview) {
          window._addAttractionPreview(details.attractions, details.city);
        }
      }
      // 天气工具返回后显示天气图标
      if (toolName === "get_weather" || toolName === "getWeather") {
        const details = result.result?.details || result.result;
        if (details?.weatherInfo && window._addWeatherOverlay) {
          window._addWeatherOverlay(details.weatherInfo);
        }
      }
    }

    // ─── 流式文本实时渲染（A4）─────────────────────────
    if (event.type === "message_update" && window.currentPage === "page-map") {
      const text = event.message?.content;
      if (typeof text === 'string' && window._streamingMapParser) {
        window._streamingMapParser(text);
      }
    }
    if (event.type === "turn_end") {
      // turn 结束时清除幽灵 marker
      window._clearGhostMarkers?.();
      window._confirmPreviewMarkers?.();
    }

    if (event.type === "error" || event.type === "agent_error") {
      if (planTimeout) { clearTimeout(planTimeout); planTimeout = null; }
      resetToolbarAfterError();
      console.error("[ChatInit] Agent error:", event);
      const raw = event.error?.message || event.payload?.error?.message || "";
      const errMsg = String(raw);
      if (errMsg.includes("QUOTA") || errMsg.includes("quota") || errMsg.includes("次数已用完") || errMsg.includes("免费体验")) {
        showToast("免费体验次数已用完，请登录后继续使用", 6000, "warning", {
          label: '去登录',
          onClick: () => { document.getElementById('auth-overlay')?.style.setProperty('display', 'flex'); }
        });
      } else if (errMsg) {
        showToast(`计划生成失败：${errMsg.slice(0, 80)}`, 5000, "error");
      } else {
        showToast("计划生成失败，请重试", 4000, "error");
      }
    }
  });

  // ─── 自动保存 ─────────────────────────────────────────
  let saveTimeout = null;
  function autoSaveTrip() {
    const tripPlan = window._lastTripPlan;
    const msgs = _agent.state.messages;

    // 找 assistant 的 markdown 文本
    let markdown = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant" && typeof msgs[i].content === "string" && msgs[i].content.length > 50) {
        markdown = msgs[i].content;
        break;
      }
    }

    // 没有 tripPlan 也没有 markdown，不保存
    if (!tripPlan && !markdown) return;
    if (!currentTripId) setCurrentTripId(crypto.randomUUID());

    // 从 tripPlan 提取元数据（比正则可靠）
    const city = tripPlan?.city || "";
    const cities = tripPlan?.cities || (city ? [city] : []);
    const startDate = tripPlan?.startDate || "";
    const endDate = tripPlan?.endDate || "";
    const days = tripPlan?.days?.length || 0;

    // 生成标题
    let title = "未命名行程";
    if (city && days > 0) {
      title = `${city}${days}日游`;
    } else if (city) {
      title = `${city}旅行`;
    } else if (markdown) {
      const hMatch = markdown.match(/^#+\s*(.+?)(行程|旅行|计划)/m);
      if (hMatch) title = hMatch[1].trim() + hMatch[2];
    }

    // 摘要
    let summary = "";
    if (tripPlan?.overallSuggestions) {
      summary = tripPlan.overallSuggestions.replace(/[#*\n]/g, " ").substring(0, 100).trim();
    } else if (markdown) {
      summary = markdown.replace(/[#*\n]/g, " ").substring(0, 100).trim();
    }

    // 封面图（第一个景点的第一张图片）
    let coverImage = "";
    if (tripPlan?.days?.length > 0) {
      for (const day of tripPlan.days) {
        if (day.attractions?.length > 0) {
          for (const attr of day.attractions) {
            if (attr.images?.length > 0) {
              coverImage = attr.images[0].url;
              break;
            }
          }
          if (coverImage) break;
        }
      }
    }

    // 构建保存对象
    const trip = {
      id: currentTripId,
      title,
      city,
      cities,
      startDate,
      endDate,
      days,
      summary,
      coverImage,
      // 结构化行程数据（核心）
      tripPlan: tripPlan || null,
      markdown: markdown || "",
      // 用户上下文（用于微调）
      travelerProfile: currentTravelers ? { ...currentTravelers } : null,
      userPreferences: currentPreferences ? { ...currentPreferences } : null,
      // 对话历史（用于继续对话）
      messages: msgs.map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content
          : Array.isArray(m.content) ? m.content.filter(c => c.type === "text").map(c => c.text).join("") : "",
        timestamp: m.timestamp,
      })),
      status: "active",
    };

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTripPlan(trip)
        .then(() => console.log("[AutoSave] 行程已保存:", title))
        .catch(err => console.error("[AutoSave] 保存失败:", err));
    }, 1000);
  }
  // 暴露给 map.js 供 geocoding 完成后回写
  window._autoSaveTrip = autoSaveTrip;

  // ─── 初始化 ChatPanel ─────────────────────────────────
  document.getElementById("loading")?.remove();
  const chatPanelEl = document.getElementById("chat");
  let panelInstance = null;
  if (chatPanelEl) {
    try {
      panelInstance = await chatPanelEl.setAgent(_agent, {
        onApiKeyRequired: async (prov) => {
          return true;
        },
        toolsFactory: () => [...ALL_TOOLS],
      });
      // setAgent() 不 return this，用 DOM 元素作为 fallback
      if (!panelInstance) panelInstance = chatPanelEl;
    } catch (err) {
      console.error('[ChatInit] setAgent 失败:', err);
    }
  }
  setChatPanel(panelInstance);

  // ─── 设置全局引用（供工具模块等使用） ────────────────
  window.currentPage = 'page-map';
  window._lastTripPlan = window._lastTripPlan || null;
  window._chatPanel = panelInstance;  // 测试钩子：暴露给 E2E 测试

  // 禁用附件
  if (panelInstance?.agentInterface) {
    panelInstance.agentInterface.enableAttachments = false;
    panelInstance.agentInterface.enableThinkingSelector = false;

    // ─── 调试：拦截 sendMessage ────────────────────────────
    const origSendMessage = panelInstance.agentInterface.sendMessage.bind(panelInstance.agentInterface);
    panelInstance.agentInterface.sendMessage = async function(input, attachments) {
      console.log('[DEBUG] sendMessage called:', { input: input?.slice(0, 50), isStreaming: _agent.state.isStreaming, hasModel: !!_agent.state.model });
      try {
        await origSendMessage(input, attachments);
        console.log('[DEBUG] sendMessage completed');
      } catch (err) {
        console.error('[DEBUG] sendMessage error:', err);
        showToast(`发送失败: ${err.message}`, 5000, 'error');
      }
    };

    // ─── 调试：监听 isStreaming 状态变化 ──────────────────
    let lastStreaming = _agent.state.isStreaming;
    setInterval(() => {
      const current = _agent.state.isStreaming;
      if (current !== lastStreaming) {
        console.log('[DEBUG] isStreaming changed:', lastStreaming, '->', current);
        lastStreaming = current;
      }

      // 检查 MessageEditor 状态
      const me = document.querySelector('message-editor');
      if (me && me.value) {
        // 只在有输入时检查
        const btn = me.querySelector('button:not([disabled])');
        if (!btn && me.value.trim()) {
          console.log('[DEBUG] MessageEditor state:', {
            value: me.value?.slice(0, 30),
            isStreaming: me.isStreaming,
            processingFiles: me.processingFiles,
            hasOnSend: typeof me.onSend === 'function',
          });
        }
      }
    }, 2000);
  }

  // ─── MutationObserver 检测首条消息 → 隐藏欢迎 ────────
  const welcomeHint = document.getElementById('map-chat-welcome');
  if (panelInstance && welcomeHint) {
    const chatBody = document.getElementById('map-chat-body');
    const wo = new MutationObserver(() => {
      const msgs = panelInstance.shadowRoot?.querySelectorAll('chat-message')
                || chatBody?.querySelectorAll('chat-message');
      if (msgs && msgs.length > 0) {
        welcomeHint.style.display = 'none';
        wo.disconnect();
      }
    });
    wo.observe(chatBody || document.body, { childList: true, subtree: true });
  }

  // ─── i18n 语言切换 ──────────────────────────────────
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang;
      setCurrentLang(lang);
      localStorage.setItem("travel-agent-lang", lang);
      applyI18n(lang);
      _agent.state.systemPrompt = buildSystemPrompt(lang);
      const dict = { zh: "语言已切换为中文", en: "Language switched to English", ja: "言語を日本語に切り替えました" };
      showToast(dict[lang] || "语言已切换");
    });
  });

  // 初始化时应用已保存的语言
  if (currentLang !== "zh") {
    applyI18n(currentLang);
    _agent.state.systemPrompt = buildSystemPrompt(currentLang);
  }

  // ─── 出行人群 ─────────────────────────────────────────
  initTravelersPanel();

  // ─── 分享加载 + 过期清理 ───────────────────────────────
  loadSharedTrip();
  renderSharedTrips();
  // 新版 hash 分享链接加载
  const hashTrip = loadSharedTripFromHash();
  if (hashTrip && agent) {
    const msg = {
      role: "assistant",
      content: `# 📋 分享的旅行计划\n\n来自分享链接的行程数据`,
      timestamp: Date.now(),
    };
    agent.state.messages = [...agent.state.messages, msg];
    showToast("已加载分享的行程", 3000, 'success');
  }

  // ─── 欢迎状态 ─────────────────────────────────────────
  initWelcome();

  // ─── 全屏地图 ─────────────────────────────────────────
  // 由 index.html 在 DOM 就绪后调用

  // ─── MutationObserver 初始化 placeholder ──────────────
  const chatContainer = document.getElementById("map-chat-body");
  if (chatContainer) {
    const observer = new MutationObserver(() => {
      const ta = document.querySelector("message-editor textarea");
      if (ta) {
        initPlaceholder();
        observer.disconnect();
      }
    });
    observer.observe(chatContainer, { childList: true, subtree: true });
  }

  // ─── 会话恢复 ─────────────────────────────────────────
  tryRestoreSession();

  // ─── 语音播报按钮 ───────────────────────────────────────
  const btnTts = document.getElementById('btn-tts');
  if (btnTts && isTTSSupported()) {
    btnTts.addEventListener('click', () => {
      const { isPlaying, isPaused } = getState();

      if (isPlaying) {
        pause();
        return;
      }
      if (isPaused) {
        resume();
        return;
      }

      // 获取行程数据并生成播报文本
      const tripPlan = window._lastTripPlan;
      if (!tripPlan) {
        showToast('请先生成行程', 3000, 'warning');
        return;
      }

      const speechText = generateSpeechText(tripPlan);
      if (!speechText) {
        showToast('无法生成播报内容', 3000, 'warning');
        return;
      }

      speak(speechText, {
        onStart: () => showToast('开始播报行程', 2000),
        onEnd: () => showToast('播报结束', 2000),
      });
    });
  } else if (btnTts) {
    // 不支持 TTS 时隐藏按钮
    btnTts.style.display = 'none';
  }

  // ─── 语音输入按钮 ───────────────────────────────────────
  const btnVoice = document.getElementById('btn-voice-input');
  if (btnVoice && isSTTSupported()) {
    // 显示语音输入按钮
    btnVoice.style.display = 'flex';

    // 初始化语音识别
    initRecognition({
      onStart: () => {
        showToast('🎤 正在聆听...', 2000);
      },
      onResult: (text, isFinal) => {
        if (isFinal) {
          // 最终结果：填入输入框
          const textarea = document.querySelector('message-editor textarea')
            || document.querySelector('#chat textarea')
            || document.querySelector('textarea');
          if (textarea) {
            const currentValue = textarea.value || '';
            const separator = currentValue && !currentValue.endsWith(' ') ? ' ' : '';
            textarea.value = currentValue + separator + text;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus();
          }
        } else {
          // 中间结果：显示提示
          const interimEl = document.getElementById('stt-interim-text');
          if (interimEl) {
            interimEl.textContent = `🎤 ${text}`;
            interimEl.style.display = 'block';
          }
        }
      },
      onEnd: () => {
        const interimEl = document.getElementById('stt-interim-text');
        if (interimEl) interimEl.style.display = 'none';
      },
      onError: (errMsg) => {
        showToast(errMsg, 3000, 'warning');
      },
    });

    // 按钮点击事件
    btnVoice.addEventListener('click', () => {
      const { isListening } = getSTTState();
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    });
  } else if (btnVoice) {
    // 不支持 STT 时隐藏按钮
    btnVoice.style.display = 'none';
  }

  // 创建临时识别文本元素
  const interimDiv = document.createElement('div');
  interimDiv.id = 'stt-interim-text';
  interimDiv.style.cssText = `
    display: none;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--color-text-muted, #888);
    font-style: italic;
    background: var(--color-bg-elevated);
    border-top: 1px solid var(--color-border-subtle);
  `;
  const chatBody = document.getElementById('map-chat-body');
  if (chatBody) chatBody.appendChild(interimDiv);

  // ─── 移除骨架屏 ──────────────────────────────────────
  const skeleton = document.getElementById('map-skeleton');
  if (skeleton) {
    skeleton.classList.add('fade-out');
    setTimeout(() => skeleton.remove(), 500);
  }

  // ─── 攻略长图按钮 ───────────────────────────────────────
  const btnPoster = document.getElementById('btn-poster');
  if (btnPoster) {
    btnPoster.addEventListener('click', async () => {
      const tripPlan = window._lastTripPlan;
      if (!tripPlan) {
        showToast('请先生成行程', 3000, 'warning');
        return;
      }

      showToast('正在生成攻略长图...', 3000);

      try {
        // 动态导入 share 模块
        const { generateTripPoster, downloadImage } = await import('./share.js');
        const dataUrl = await generateTripPoster(tripPlan);
        if (dataUrl) {
          downloadImage(dataUrl, `旅图_${tripPlan.city || '攻略'}_${tripPlan.days?.length || 0}日游.png`);
          showToast('攻略长图已生成', 3000, 'success');
        } else {
          showToast('生成失败，请重试', 3000, 'error');
        }
      } catch (err) {
        console.error('[Poster] Generate failed:', err);
        showToast('生成失败: ' + (err.message || '未知错误'), 3000, 'error');
      }
    });
  }

  // ─── 语音伴游按钮 ───────────────────────────────────────
  const btnCompanion = document.getElementById('btn-voice-companion');
  if (btnCompanion) {
    // 动态导入语音伴游模块
    import('./voice-companion.js').then(({ startVoiceCompanion, stopVoiceCompanion, getCompanionState, setTripPlanForCompanion }) => {
      btnCompanion.style.display = 'flex';

      btnCompanion.addEventListener('click', () => {
        const { isActive } = getCompanionState();

        if (isActive) {
          stopVoiceCompanion();
          showToast('语音伴游已结束', 2000);
        } else {
          const tripPlan = window._lastTripPlan;
          if (!tripPlan) {
            showToast('请先生成行程', 3000, 'warning');
            return;
          }

          setTripPlanForCompanion(tripPlan);

          startVoiceCompanion({
            onQuestion: (text) => {
              showToast(`🎤 ${text}`, 2000);
            },
            onError: (errMsg) => {
              showToast(errMsg, 3000, 'warning');
            },
            onStateChange: ({ isActive, state }) => {
              // 更新按钮状态
            },
          });

          showToast('语音伴游已启动，请开始提问', 3000, 'success');
        }
      });
    }).catch(() => {
      // 语音伴游模块加载失败，隐藏按钮
      btnCompanion.style.display = 'none';
    });
  }
}
// ─── 全局调试：监听 textarea 和按钮状态 ─────────────────
document.addEventListener('click', (e) => {
  const target = e.target;
  // 检查是否点击了发送按钮
  if (target.closest('button') && target.closest('message-editor')) {
    const btn = target.closest('button');
    console.log('[DEBUG] Button clicked in message-editor:', {
      disabled: btn.disabled,
      text: btn.textContent?.trim(),
      classes: btn.className,
    });
  }
}, true);

// ─── 全局调试：监听所有按钮点击 ─────────────────────────
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) {
    const me = btn.closest('message-editor') || btn.closest('agent-interface');
    if (me) {
      console.log('[DEBUG] Button click detected:', {
        tag: btn.tagName,
        disabled: btn.disabled,
        text: btn.textContent?.trim().slice(0, 20),
        parent: me.tagName,
        value: document.querySelector('message-editor')?.value?.slice(0, 30),
      });
    }
  }
}, true);
