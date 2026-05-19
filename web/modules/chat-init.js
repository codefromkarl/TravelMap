// ─── ChatPanel 初始化 + Agent 事件监听 ────────────────

import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { config, resolveApiKey } from './config.js';
import {
  isProxyMode, setAgent, setChatPanel, currentTripId, setCurrentTripId, setLastTripContent,
  currentLang, setCurrentLang, showToast,
} from './context.js';
import { ALL_TOOLS } from './tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { initWelcome } from './welcome.js';
import { initPageMap } from './map.js';
import { initPlaceholder, applyI18n } from './i18n.js';
import { tryRestoreSession } from './session.js';
import { initTravelersPanel } from './travelers.js';
import { loadSharedTrip, renderSharedTrips } from './export.js';
import { saveTrip, listTrips } from './db.js';

export async function initApp() {
  // ─── 读取 provider/model 配置 ─────────────────────────
  // 默认使用本地 ds2api 的 DeepSeek（免费，无需用户配置 API Key）
  const ds = config.deepseekLocal;
  const provider = localStorage.getItem("travel-agent-provider") || "deepseek-local";
  const modelId = localStorage.getItem("travel-agent-model") || ds.defaultModel;

  let model;
  if (provider === "deepseek-local" || (!localStorage.getItem("travel-agent-provider") && !localStorage.getItem("travel-agent-model"))) {
    // 默认：本地 ds2api DeepSeek
    model = {
      id: ds.defaultModel, name: "DeepSeek V4 Flash", api: "openai-completions",
      provider: "deepseek",
      baseUrl: ds.baseUrl,
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
    ["btn-export-md", "btn-export-pdf", "btn-share-link", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map"].forEach(id => {
      document.getElementById(id)?.classList.remove("disabled-ghost");
    });
  }
  _agent.subscribe((event) => {
    if (event.type === "agent_end") {
      if (planTimeout) { clearTimeout(planTimeout); planTimeout = null; }
      window._hidePlanningIndicator?.();
      const msgs = _agent.state.messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant" && typeof msgs[i].content === "string" && msgs[i].content.length > 100) {
          if (msgs[i].content !== lastTripContentInner) {
            lastTripContentInner = msgs[i].content;
            setLastTripContent(msgs[i].content);
            document.getElementById("export-toolbar")?.classList.add("visible");
            ["btn-export-md", "btn-export-pdf", "btn-share-link", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map"].forEach(id => {
              document.getElementById(id)?.classList.remove("disabled-ghost");
            });
          }
          break;
        }
      }
      autoSaveTrip();
    }
    if (event.type === "turn_start") {
      window._showPlanningIndicator?.('正在规划行程...');
      document.getElementById("export-toolbar")?.classList.remove("visible");
      ["btn-export-md", "btn-export-pdf", "btn-share-link", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map"].forEach(id => {
        document.getElementById(id)?.classList.add("disabled-ghost");
      });
      setCurrentTripId(null);
      if (planTimeout) clearTimeout(planTimeout);
      planTimeout = setTimeout(() => {
        resetToolbarAfterError();
        showToast("请求超时，请重试", 4000, 'warning');
      }, 60000);
    }
    if (event.type === "error" || event.type === "agent_error") {
      if (planTimeout) { clearTimeout(planTimeout); planTimeout = null; }
      resetToolbarAfterError();
      console.error("[ChatInit] Agent error:", event);
    }
  });

  // ─── 自动保存 ─────────────────────────────────────────
  let saveTimeout = null;
  function autoSaveTrip() {
    const msgs = _agent.state.messages;
    let content = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant" && typeof msgs[i].content === "string" && msgs[i].content.length > 100) {
        content = msgs[i].content;
        break;
      }
    }
    if (!content || content.length < 200) return;
    if (!currentTripId) setCurrentTripId(crypto.randomUUID());

    let title = "未命名行程";
    const cityMatch = content.match(/(?:目的地|城市)[：:]\s*\*{0,2}([^*\n,，]+)/);
    if (cityMatch) title = cityMatch[1].trim();
    else {
      const hMatch = content.match(/^#+\s*(.+?)(行程|旅行|计划)/m);
      if (hMatch) title = hMatch[1].trim() + hMatch[2];
    }
    const summary = content.replace(/[#*\n]/g, " ").substring(0, 100).trim();

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTrip(currentTripId, title, summary, content, _agent.state.messages)
        .catch(err => console.error("Auto-save failed:", err));
    }, 1000);
  }

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

  // 禁用附件
  if (panelInstance?.agentInterface) {
    panelInstance.agentInterface.enableAttachments = false;
    panelInstance.agentInterface.enableThinkingSelector = false;
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
}