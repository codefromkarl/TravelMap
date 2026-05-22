import { agent, currentLang, showToast, PROVIDER_MODELS, getAmapKey } from './context.js?v=6';
import { I18N } from './i18n.js?v=6';
import { buildSystemPrompt } from './prompt.js?v=6';
import { getModel } from "@earendil-works/pi-ai";
import { getAppStorage } from "@earendil-works/pi-web-ui";
import { config } from './config.js?v=6';

// ─── 模型配置弹窗 ──────────────────────────────────
document.getElementById('btn-open-model')?.addEventListener('click', () => {
  const overlay = document.getElementById('model-modal-overlay');
  if (overlay) {
    overlay.classList.add('open');
    loadModelConfig();
  }
});

document.getElementById('btn-close-model-modal')?.addEventListener('click', () => {
  document.getElementById('model-modal-overlay')?.classList.remove('open');
});

document.getElementById('model-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'model-modal-overlay') e.target.classList.remove('open');
});

export function loadModelConfig() {
  const provider = localStorage.getItem('travel-agent-provider') || 'openai';
  const modelId = localStorage.getItem('travel-agent-model') || 'gpt-4o';
  const apiKey = localStorage.getItem(`api-key-${provider}`) || '';

  const provSelect = document.getElementById('cfg-provider');
  if (provSelect) provSelect.value = provider;
  updateModelOptions(provider);

  if (provider === 'custom') {
    setInputValue('cfg-custom-url', localStorage.getItem('custom-llm-url'));
    setInputValue('cfg-custom-model', modelId);
  } else {
    const modelSelect = document.getElementById('cfg-model');
    if (modelSelect) modelSelect.value = modelId;
  }

  const keyInput = document.getElementById('cfg-apikey');
  const keyRow = keyInput?.closest('.setting-row');
  if (provider === 'deepseek-local') {
    if (keyInput) keyInput.value = config.deepseekLocal.apiKey;
    if (keyRow) keyRow.style.display = 'none';
  } else {
    if (keyRow) keyRow.style.display = '';
    if (keyInput) keyInput.value = localStorage.getItem(`api-key-${provider}`) || '';
  }

  setInputValue('cfg-google-maps', localStorage.getItem('api-key-google-maps'));
  setInputValue('cfg-amap-web', localStorage.getItem('api-key-amap-web'));
  setInputValue('cfg-openweather', localStorage.getItem('api-key-openweather'));
  setInputValue('cfg-xhs-strategy', localStorage.getItem('xhs-strategy') || 'priority');
  setInputValue('cfg-xhs-rnote', localStorage.getItem('api-key-xhs-rnote'));
  setInputValue('cfg-xhs-justone', localStorage.getItem('api-key-xhs-justone'));
  setInputValue('cfg-xhs-tikhub', localStorage.getItem('api-key-xhs-tikhub'));
  setInputValue('cfg-xhs-crawler-base', localStorage.getItem('xhs-crawler-base') || 'http://localhost:8080');
  setInputValue('cfg-xhs-crawler-token', localStorage.getItem('api-key-xhs-crawler-token'));

  const thinkingSelect = document.getElementById('cfg-thinking-level');
  if (thinkingSelect) thinkingSelect.value = localStorage.getItem('travel-agent-thinking') || 'medium';
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el && value) el.value = value;
}

function updateModelOptions(provider) {
  const modelSelect = document.getElementById('cfg-model');
  const customConfig = document.getElementById('custom-llm-config');

  if (provider === 'custom') {
    if (modelSelect) modelSelect.parentElement.style.display = 'none';
    if (customConfig) customConfig.style.display = 'block';
  } else {
    if (modelSelect) modelSelect.parentElement.style.display = '';
    if (customConfig) customConfig.style.display = 'none';
    const models = PROVIDER_MODELS[provider] || [];
    if (modelSelect) modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

function saveInput(inputId, storageKey) {
  const val = document.getElementById(inputId)?.value;
  if (val !== undefined && val !== null) localStorage.setItem(storageKey, val);
}

document.getElementById('cfg-provider')?.addEventListener('change', (e) => {
  const provider = e.target.value;
  updateModelOptions(provider);
  const keyInput = document.getElementById('cfg-apikey');
  const keyRow = keyInput?.closest('.setting-row');
  if (provider === 'deepseek-local') {
    if (keyInput) keyInput.value = config.deepseekLocal.apiKey;
    if (keyRow) keyRow.style.display = 'none';
  } else {
    if (keyRow) keyRow.style.display = '';
    if (keyInput) keyInput.value = localStorage.getItem(`api-key-${provider}`) || '';
  }
  if (provider === 'custom') {
    setInputValue('cfg-custom-url', localStorage.getItem('custom-llm-url'));
    setInputValue('cfg-custom-model', localStorage.getItem('travel-agent-model') || '');
  }
});

document.getElementById('btn-save-model')?.addEventListener('click', () => {
  const provider = document.getElementById('cfg-provider')?.value;
  const apiKey = document.getElementById('cfg-apikey')?.value;

  if (provider) localStorage.setItem('travel-agent-provider', provider);
  if (provider && apiKey) localStorage.setItem(`api-key-${provider}`, apiKey);

  let modelId;
  if (provider === 'custom') {
    const customUrl = document.getElementById('cfg-custom-url')?.value;
    const customModel = document.getElementById('cfg-custom-model')?.value;
    if (customUrl) localStorage.setItem('custom-llm-url', customUrl);
    if (customModel) {
      localStorage.setItem('travel-agent-model', customModel);
      modelId = customModel;
    }
  } else {
    modelId = document.getElementById('cfg-model')?.value;
    if (modelId) localStorage.setItem('travel-agent-model', modelId);
  }

  saveInput('cfg-google-maps', 'api-key-google-maps');
  saveInput('cfg-amap-web', 'api-key-amap-web');
  saveInput('cfg-openweather', 'api-key-openweather');
  saveInput('cfg-xhs-strategy', 'xhs-strategy');
  saveInput('cfg-xhs-rnote', 'api-key-xhs-rnote');
  saveInput('cfg-xhs-justone', 'api-key-xhs-justone');
  saveInput('cfg-xhs-tikhub', 'api-key-xhs-tikhub');
  saveInput('cfg-xhs-crawler-base', 'xhs-crawler-base');
  saveInput('cfg-xhs-crawler-token', 'api-key-xhs-crawler-token');

  const thinkingLevel = document.getElementById('cfg-thinking-level')?.value || 'medium';
  localStorage.setItem('travel-agent-thinking', thinkingLevel);

  try {
    if (provider === 'deepseek-local') {
      const useReasoning = config.deepseekLocal.reasoning !== false;
      agent.state.model = {
        id: modelId || config.deepseekLocal.defaultModel, name: 'DeepSeek V4 Flash', api: 'openai-completions',
        provider: 'deepseek',
        baseUrl: config.deepseekLocal.baseUrl,
        reasoning: useReasoning, input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 8192,
      };
    } else if (provider === 'custom') {
      const customUrl = localStorage.getItem('custom-llm-url');
      if (customUrl && modelId) {
        agent.state.model = {
          id: modelId, name: modelId, api: 'openai-completions', provider: 'openai',
          baseUrl: customUrl.replace(/\/$/, ''), reasoning: false, input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000, maxTokens: 4096,
        };
      }
    } else {
      const newModel = getModel(provider, modelId);
      agent.state.model = newModel;
    }
    agent.state.systemPrompt = buildSystemPrompt(currentLang);
    agent.state.thinkingLevel = thinkingLevel;
  } catch (err) {
    console.warn('Failed to update model:', err);
  }

  const dict = I18N[currentLang] || I18N.zh;
  showToast(dict.settingsSaved || '配置已保存', 2500, 'success');
});

// ─── 获取自定义模型列表 ────────────────────────────────
document.getElementById('btn-fetch-models')?.addEventListener('click', async () => {
  const url = document.getElementById('cfg-custom-url')?.value?.trim();
  const apiKey = document.getElementById('cfg-apikey')?.value?.trim();

  if (!url) {
    showToast('请先填写 API Base URL', 2500, 'warning');
    return;
  }

  const btn = document.getElementById('btn-fetch-models');
  const originalText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 获取中...'; }

  try {
    const baseUrl = url.replace(/\/$/, '');
    const modelsUrl = baseUrl.endsWith('/models') ? baseUrl : `${baseUrl}/models`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const resp = await fetch(modelsUrl, { method: 'GET', headers, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    const data = await resp.json();

    let models = [];
    if (Array.isArray(data)) {
      models = data.map(m => typeof m === 'string' ? m : m.id).filter(Boolean);
    } else if (data.data && Array.isArray(data.data)) {
      models = data.data.map(m => m.id).filter(Boolean);
    } else if (data.models && Array.isArray(data.models)) {
      models = data.models.map(m => typeof m === 'string' ? m : m.id).filter(Boolean);
    }

    if (models.length === 0) {
      showToast('未获取到模型列表，请检查 URL 和 API Key', 3000, 'warning');
      return;
    }

    models = [...new Set(models)].sort();
    const select = document.getElementById('cfg-custom-model-select');
    const input = document.getElementById('cfg-custom-model');

    if (select) {
      select.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
      select.style.display = 'block';
      select.onchange = () => { if (input) input.value = select.value; };
    }
    if (input) {
      input.style.display = 'none';
      if (!input.value && models.length > 0) input.value = models[0];
    }

    showToast(`获取到 ${models.length} 个模型`, 2500, 'success');
  } catch (err) {
    console.error('Fetch models failed:', err);
    showToast(`获取失败: ${err.message}`, 3000, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
});