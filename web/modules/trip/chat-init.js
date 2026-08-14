// ─── 修复 text/event-stream 缺少 charset=utf-8 导致中文乱码 ──
// cli-proxyapi 返回 Content-Type: text/event-stream（无 charset），
// 浏览器按 HTTP 规范默认 ISO-8859-1 解码流，UTF-8 中文变成乱码。
// 拦截 fetch，对 SSE 响应强制修正 Content-Type，并注入 trace headers。
// 同时为 LLM 流式请求增加首字节超时检测：60 秒无任何响应数据则中止并提示重试。
const _origFetch = globalThis.fetch;

// ─── 流式首字节超时（毫秒） ─────────────────────────
const STREAM_FIRST_BYTE_TIMEOUT_MS = 60000;

// Agent 引用 + 超时触发标记（供 initApp 注入，避免与 agent 错误处理重复弹错）
let _agentRef = null;
let _streamTimeoutFired = false;

function _isLlmUrl(url) {
  return url.includes('/v1/chat/completions') || url.includes('/v1/messages') || url.includes('/api/chat');
}

// ─── 首字节守卫：包装响应 body，首个 chunk / 结束 / 出错时触发回调 ──
function _wrapBodyFirstByte(body, onFirstByte) {
  let notified = false;
  const notify = () => {
    if (notified) return;
    notified = true;
    onFirstByte();
  };
  return new ReadableStream({
    start(controller) {
      const reader = body.getReader();
      (async function pump() {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            notify();
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
          }
        } catch (err) {
          notify();
          controller.error(err);
        }
      })();
    },
    cancel(reason) {
      return body.cancel(reason);
    },
  });
}

function _streamTimeoutMessage() {
  let lang = "zh";
  if (typeof localStorage !== "undefined") {
    lang = localStorage.getItem("travel-agent-lang") || "zh";
  }
  const dict = I18N[lang] || I18N.zh;
  return dict.streamTimeout || I18N.zh.streamTimeout;
}

function _handleStreamTimeout() {
  if (_streamTimeoutFired) return;
  _streamTimeoutFired = true;
  feedback.error(_streamTimeoutMessage(), _agentRef ? () => retryLastMessage(_agentRef) : null);
}

globalThis.fetch = function fixedCharsetFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

  // ─── 注入 trace headers（仅 LLM API 请求） ─────────
  const isLlmRequest = _isLlmUrl(url);
  if (isLlmRequest && init && typeof window !== 'undefined' && window.__traceAddHeaders) {
    try {
      const traceHeaders = window.__traceAddHeaders(init.headers || {});
      init.headers = traceHeaders;
    } catch (e) {
      // trace 模块未加载时忽略
    }
  }

  // ─── 流式首字节超时检测（仅 LLM 请求） ─────────────
  let abortController = null;
  let firstByteTimer = null;
  if (isLlmRequest) {
    abortController = new AbortController();
    const callerSignal = init?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        abortController.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener("abort", () => {
          if (firstByteTimer) clearTimeout(firstByteTimer);
          abortController.abort(callerSignal.reason);
        }, { once: true });
      }
    }
    init = { ...(init || {}), signal: abortController.signal };
    firstByteTimer = setTimeout(() => {
      _handleStreamTimeout();
      abortController.abort();
    }, STREAM_FIRST_BYTE_TIMEOUT_MS);
  }

  return _origFetch.call(this, input, init).then(resp => {
    const ct = resp.headers.get("content-type") || "";
    const isSse = ct.includes("text/event-stream");
    if (isSse && !ct.includes("charset")) {
      const headers = new Headers(resp.headers);
      headers.set("content-type", "text/event-stream; charset=utf-8");
      let body = resp.body;
      if (body && firstByteTimer) {
        body = _wrapBodyFirstByte(body, () => clearTimeout(firstByteTimer));
      } else if (firstByteTimer) {
        clearTimeout(firstByteTimer);
      }
      return new Response(body, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    }
    // 非 SSE 响应：响应头到达即视为已有响应数据，清除首字节定时器
    if (firstByteTimer) clearTimeout(firstByteTimer);
    return resp;
  }).catch(err => {
    // fetch 自身失败（连接错误/中止）时清理定时器
    if (firstByteTimer) clearTimeout(firstByteTimer);
    throw err;
  });
};

// ─── ChatPanel 初始化 + Agent 事件监听 ────────────────

import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { config, resolveApiKey } from '../config.js';
import {
  isProxyMode, setAgent, setChatPanel, currentTripId, setCurrentTripId, setLastTripContent,
  currentLang, setCurrentLang, showToast, currentTravelers, currentPreferences, PROVIDER_MODELS,
  PROVIDER_REGISTRY, getPiProvider, getDefaultModel, getProviderBaseUrl,
} from '../infra/context.js';
import { feedback } from '../feedback.js';
import { appState } from '../app-state.js';
import { speak, pause, resume, stop, getState, isTTSSupported, generateSpeechText } from '../tts.js';
import { initRecognition, startListening, stopListening, getSTTState, isSTTSupported } from '../stt.js';
import { ALL_TOOLS } from '../tools/index.js';
import { buildSystemPrompt } from '../prompt.js';
import { initWelcome } from '../welcome.js';
import { showOnboarding } from '../ui/onboarding.js';
import { initPlaceholder, applyI18n, I18N } from '../i18n.js';
import { session, tryRestoreSession } from '../session.js';
import { initTravelersPanel } from '../travelers.js';
import { loadSharedTrip, renderSharedTrips } from '../export.js';
import { loadSharedTripFromHash } from '../share.js';
import { saveTripPlan, listTrips, migrateCoordinatesToGcj02 } from '../db.js';
import { addTraceHeaders, extractTraceId } from '../trace.js';
import { requireAuth } from '../auth/auth.js';
import { initGuestDemo } from '../guest-demo.js';

/** Resume a failed turn without duplicating its existing user message. */
export async function retryLastMessage(agent) {
  if (!await requireAuth()) return;
  const msgs = agent.state.messages;
  const failedAssistant = msgs.at(-1);
  if (failedAssistant?.role !== 'assistant' || !failedAssistant.errorMessage) return;

  msgs.pop();
  const continuationMessage = msgs.at(-1);
  if (continuationMessage?.role !== 'user' && continuationMessage?.role !== 'toolResult') {
    msgs.push(failedAssistant);
    return;
  }

  await agent.continue();
}

export async function initApp() {
  // ─── 坐标迁移：修复历史记录中的坐标系问题 ───────────
  try {
    const migrated = await migrateCoordinatesToGcj02();
    if (migrated > 0) {
      console.log(`[App] 已迁移 ${migrated} 条历史记录的坐标`);
    }
  } catch (err) {
    console.warn('[App] 坐标迁移失败:', err);
  }

  // ─── 读取 provider/model 配置 ─────────────────────────
  // 默认使用本地 ds2api 的 DeepSeek（免费，无需用户配置 API Key）
  const provider = localStorage.getItem("travel-agent-provider") || "deepseek-local";
  const registry = PROVIDER_REGISTRY[provider];
  const modelId = localStorage.getItem("travel-agent-model") || registry?.defaultModel || 'gpt-4o';

  let model;
  if (isProxyMode) {
    // The SDK only needs a transport-shaped model in production. The Function
    // overwrites model/provider and the fetch proxy prevents this URL from being
    // contacted directly.
    model = {
      id: 'server-managed', name: 'Server managed model', api: 'openai-completions',
      provider: 'openai', baseUrl: 'https://api.openai.com/v1',
      reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000, maxTokens: 8192,
    };
  } else if (provider === "deepseek-local") {
    // 默认：本地 ds2api DeepSeek
    model = {
      id: registry.defaultModel, name: "DeepSeek V4 Flash", api: "openai-completions",
      provider: registry.piProvider,
      baseUrl: registry.baseUrl,
      reasoning: true, input: ["text"],
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
  } else if (provider === "sensenova") {
    model = {
      id: modelId || "deepseek-v4-flash", name: "商汤 DeepSeek V4 Flash", api: "openai-completions",
      provider: "sensenova",
      baseUrl: "https://token.sensenova.cn/v1",
      reasoning: true, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000, maxTokens: 8192,
    };
  } else {
    const piProvider = getPiProvider(provider);
    model = getModel(piProvider, modelId);
    // getModel 返回 undefined 时（模型ID不在注册表中），fallback 到第一个可用模型
    if (!model) {
      const fallbackModels = PROVIDER_MODELS[provider];
      if (fallbackModels && fallbackModels.length > 0) {
        model = getModel(provider, fallbackModels[0]);
      }
      // 仍然没有则使用 deepseek-local 作为最终 fallback
      if (!model) {
        console.warn(`[ChatInit] Model not found: ${provider}/${modelId}, falling back to deepseek-local`);
        const ds = config.deepseekLocal;
        model = {
          id: ds.defaultModel, name: 'DeepSeek V4 Flash', api: 'openai-completions',
          provider: 'deepseek', baseUrl: ds.baseUrl,
          reasoning: true, input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000, maxTokens: 8192,
        };
      }
    }
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
    getApiKey: (prov) => resolveApiKey(prov, model),
  });
  setAgent(_agent);
  _agentRef = _agent;

  // 暴露 panels 供其他模块通过 window 调用
  const panelModule = await import('../panels.js');
  window._panels = { openPanel: panelModule.openPanel, closePanel: panelModule.closePanel, closeAllPanels: panelModule.closeAllPanels };

  // ─── Agent 事件监听 ──────────────────────────────────
  let lastTripContentInner = "";
  function resetToolbarAfterError() {
    feedback.done();
    document.getElementById("export-toolbar")?.classList.add("visible");
    ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map", "btn-tts", "btn-poster", "btn-voice-companion"].forEach(id => {
      document.getElementById(id)?.classList.remove("disabled-ghost");
    });
  }

  _agent.subscribe(async (event) => {
    if (event.type === "agent_end") {
      feedback.done();
      appState.transition('result');

      // ─── 强制同步 message-editor 的 isStreaming 状态 ──
      // agent_end 在 finishRun() 之前触发，此时 session.state.isStreaming 仍为 true。
      // finishRun() 设为 false 后无 re-render，导致 editor.isStreaming 卡住。
      // 用 setTimeout 延迟确保 finishRun() 已执行。
      setTimeout(() => {
        const editor = document.querySelector('message-editor');
        if (editor?.isStreaming) {
          editor.isStreaming = false;
        }
        const ai = document.querySelector('agent-interface');
        if (ai) ai.requestUpdate();
      }, 100);

      const msgs = _agent.state.messages;

      // ─── 检查是否有 errorMessage（Agent 内部异常，走 handleRunFailure）
      const lastAssistant = msgs.filter(m => m.role === 'assistant').slice(-1)[0];
      if (lastAssistant?.errorMessage) {
        resetToolbarAfterError();
        const errMsg = lastAssistant.errorMessage;
        console.error("[ChatInit] Agent run failure:", errMsg);
        // 流式首字节超时已通过 feedback.error 提示（含重试按钮），避免重复弹错
        if (_streamTimeoutFired) {
          _streamTimeoutFired = false;
          return;
        }
        feedback.handleAgentError(errMsg, { onRetry: () => retryLastMessage(_agent) });
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
              const { validateAndWarn } = await import('../tools/validate-trip.js');
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
      _streamTimeoutFired = false;
      appState.transition('planning');
      feedback.loading('正在规划行程...');
      document.getElementById("export-toolbar")?.classList.remove("visible");
      ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map", "btn-tts", "btn-poster", "btn-voice-companion"].forEach(id => {
        document.getElementById(id)?.classList.add("disabled-ghost");
      });
      setCurrentTripId(null);
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
      // 天气工具返回后显示结构化天气预览；最终逐日 UI 由 TripPlan.weatherInfo 驱动
      if (toolName === "search_weather") {
        const details = result.result?.details || result.result;
        if (Array.isArray(details?.weatherInfo) && window._addWeatherOverlay) {
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
      feedback.done();
      appState.transition('result');
      resetToolbarAfterError();
      // ─── 强制重置 isStreaming（错误时也要确保可发送） ──
      setTimeout(() => {
        const editor = document.querySelector('message-editor');
        if (editor?.isStreaming) editor.isStreaming = false;
        const ai = document.querySelector('agent-interface');
        if (ai) ai.requestUpdate();
      }, 100);
      console.error("[ChatInit] Agent error:", event);
      const raw = event.error?.message || event.payload?.error?.message || "";
      const errMsg = String(raw);
      if (errMsg) {
        feedback.handleAgentError(errMsg, { onRetry: () => retryLastMessage(_agent) });
      } else {
        feedback.error('计划生成失败，请重试');
      }
    }
  });

  // ─── 自动保存 ─────────────────────────────────────────
  let saveTimeout = null;
  function autoSaveTrip() {
    const tripPlan = window._lastTripPlan;
    const msgs = _agent.state.messages;

    // 找 assistant 的 markdown 文本（兼容 string 和 array 两种格式）
    let markdown = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant") {
        const text = typeof msgs[i].content === "string" ? msgs[i].content
          : Array.isArray(msgs[i].content) ? msgs[i].content.filter(c => c.type === "text").map(c => c.text).join("") : "";
        if (text.length > 50) {
          markdown = text;
          break;
        }
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
      tripPlan: tripPlan ? { ...tripPlan, coordVersion: 2 } : null,
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

    // ─── sendMessage 错误处理 ────────────────────────────
    const origSendMessage = panelInstance.agentInterface.sendMessage.bind(panelInstance.agentInterface);
    panelInstance.agentInterface.sendMessage = async function(input, attachments) {
      if (!await requireAuth()) return false;
      try {
        await origSendMessage(input, attachments);
        return true;
      } catch (err) {
        feedback.sendFailed(err.message);
        return false;
      }
    };

    // ─── IME（输入法）兼容性修复 ─────────────────────
    // pi-bundle 的 message-editor 在 handleTextareaInput 中每次 input 事件
    // 都触发 Lit requestUpdate → 重新渲染 → 重设 textarea.value，
    // 这会打断中文输入法的组合过程（composition），导致文字丢失/发送按钮禁用。
    // 修复：覆写 handleTextareaInput，在 composition 期间跳过 Lit 更新，
    // composition 结束后再同步 value。
    // 使用 updateComplete + setTimeout 确保 Lit 完成所有渲染后再覆写。
    (async () => {
      const messageEditor = document.querySelector('message-editor');
      if (!messageEditor) return;
      // 等待 Lit 完成渲染
      if (messageEditor.updateComplete) await messageEditor.updateComplete;
      // 再等一帧确保 DOM 稳定
      await new Promise(r => setTimeout(r, 50));

      let _isComposing = false;
      const ta = messageEditor.querySelector('textarea');
      if (!ta) return;

      ta.addEventListener('compositionstart', () => { _isComposing = true; });
      ta.addEventListener('compositionend', () => {
        _isComposing = false;
        messageEditor.value = ta.value;
        messageEditor.onInput?.(ta.value);
      });

      const origInput = messageEditor.handleTextareaInput;
      messageEditor.handleTextareaInput = (e) => {
        if (_isComposing || e.isComposing) return;
        origInput.call(messageEditor, e);
      };
      // 触发 re-render 让 Lit 绑定新的 handleTextareaInput
      messageEditor.requestUpdate();
      if (messageEditor.updateComplete) await messageEditor.updateComplete;
    })();

    // （调试代码已清理）
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
  initGuestDemo();

  // ─── 新手引导（首次访问时显示） ─────────────────────────
  setTimeout(() => showOnboarding(), 800);

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
  // 页面加载后尝试恢复上次行程（带确认提示）
  setTimeout(() => tryRestoreSession(), 500);

  // ─── 开启新行程按钮 ─────────────────────────────────────
  const btnNewTrip = document.getElementById('btn-new-trip');
  if (btnNewTrip) {
    btnNewTrip.addEventListener('click', () => {
      session.startFresh();
      showToast('已开启新行程规划', 2000, 'success');
    });
  }

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
    // 将语音按钮移到输入框内部（message-editor 容器中）
    requestAnimationFrame(() => {
      const messageEditor = document.querySelector('#chat message-editor')
        || document.querySelector('message-editor');
      if (messageEditor) {
        // 找到 message-editor 的内部容器（包含 textarea 的 div）
        const editorContainer = messageEditor.shadowRoot?.querySelector('.relative')
          || messageEditor.shadowRoot?.querySelector('div')
          || messageEditor;
        // 尝试找到 textarea 的父容器
        const textarea = messageEditor.querySelector('textarea')
          || messageEditor.shadowRoot?.querySelector('textarea');
        const inputArea = textarea?.parentElement || editorContainer;
        if (inputArea) {
          inputArea.style.position = 'relative';
          inputArea.appendChild(btnVoice);
          btnVoice.classList.add('in-input-area');
          // 给 pi-chat-panel 添加标记，用于调整 textarea 左侧间距
          const chatPanel = document.getElementById('chat');
          if (chatPanel) chatPanel.classList.add('has-voice-btn');
        }
      }
    });

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
        const { generateTripPoster, downloadImage } = await import('../share.js');
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
    import('../voice-companion.js').then(({ startVoiceCompanion, stopVoiceCompanion, getCompanionState, setTripPlanForCompanion }) => {
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
