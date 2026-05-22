/**
 * 折叠式模型选择器
 * 从右下角弹出，类似 OpenAI 的样式
 */

import { getTestedProviders } from './context.js';

// 可用的 provider 列表
function getAvailableProviders() {
  const freeProviders = ['deepseek-local'];
  const testedProviders = getTestedProviders();
  return [...new Set([...freeProviders, ...testedProviders])];
}

// 创建下拉面板
export function createModelDropdown(currentModel, onSelect) {
  const dropdown = document.createElement('div');
  dropdown.id = 'model-dropdown-panel';
  dropdown.className = 'model-dropdown';
  
  // 获取可用模型
  const availableProviders = getAvailableProviders();
  
  // 模型数据（从 pi-bundle 中获取）
  const allModels = [];
  try {
    // 获取所有注册的模型
    const modelRegistry = window.__pi_modelRegistry || new Map();
    for (const [provider, models] of modelRegistry) {
      // deepseek-local 对应 deepseek provider
      const mappedProvider = provider === 'deepseek' ? 'deepseek-local' : provider;
      if (availableProviders.includes(mappedProvider)) {
        for (const [id, model] of models) {
          allModels.push({ provider: mappedProvider, id, model: { ...model, provider: mappedProvider } });
        }
      }
    }
    
    // 如果 deepseek-local 可用但没有模型，手动添加默认模型
    if (availableProviders.includes('deepseek-local') && !allModels.some(m => m.provider === 'deepseek-local')) {
      allModels.push({
        provider: 'deepseek-local',
        id: 'deepseek-v4-flash',
        model: {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          api: 'openai-completions',
          provider: 'deepseek-local',
          baseUrl: 'http://localhost:6011/v1',
          reasoning: true,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 8192
        }
      });
    }
  } catch (e) {
    console.warn('Failed to get models:', e);
  }
  
  // 渲染内容
  dropdown.innerHTML = `
    <div class="model-dropdown-header">
      <span class="model-dropdown-title">选择模型</span>
      <button class="model-dropdown-close" id="btn-close-dropdown">✕</button>
    </div>
    <div class="model-dropdown-search">
      <input type="text" id="model-search-input" placeholder="搜索模型..." autocomplete="off">
    </div>
    <div class="model-dropdown-list" id="model-list">
      ${allModels.map(({ provider, id, model }) => `
        <div class="model-item ${model.id === currentModel?.id ? 'active' : ''}" 
             data-model-id="${model.id}" 
             data-provider="${provider}">
          <div class="model-item-info">
            <span class="model-item-name">${model.name || id}</span>
            <span class="model-item-provider">${provider}</span>
          </div>
          <div class="model-item-meta">
            <span class="model-item-context">${Math.round((model.contextWindow || 0) / 1000)}K</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  // 绑定事件
  setTimeout(() => {
    const searchInput = dropdown.querySelector('#model-search-input');
    const modelList = dropdown.querySelector('#model-list');
    const closeBtn = dropdown.querySelector('#btn-close-dropdown');
    
    // 搜索过滤
    searchInput?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const items = modelList.querySelectorAll('.model-item');
      items.forEach(item => {
        const name = item.querySelector('.model-item-name')?.textContent?.toLowerCase() || '';
        const provider = item.querySelector('.model-item-provider')?.textContent?.toLowerCase() || '';
        const match = name.includes(query) || provider.includes(query);
        item.style.display = match ? '' : 'none';
      });
    });
    
    // 选择模型
    modelList?.addEventListener('click', (e) => {
      const item = e.target.closest('.model-item');
      if (item) {
        const modelId = item.dataset.modelId;
        const provider = item.dataset.provider;
        const model = allModels.find(m => m.model.id === modelId && m.provider === provider);
        if (model && onSelect) {
          onSelect(model.model);
        }
        dropdown.remove();
      }
    });
    
    // 关闭
    closeBtn?.addEventListener('click', () => dropdown.remove());
    
    // 点击外部关闭
    const closeOnOutsideClick = (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.remove();
        document.removeEventListener('click', closeOnOutsideClick);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 100);
    
    // 聚焦搜索框
    searchInput?.focus();
  }, 50);
  
  return dropdown;
}

// 显示下拉面板
export function showModelDropdown(anchorEl, currentModel, onSelect) {
  // 移除已有的下拉面板
  const existing = document.getElementById('model-dropdown-panel');
  if (existing) {
    existing.remove();
    return;
  }
  
  const dropdown = createModelDropdown(currentModel, onSelect);
  
  // 定位到锚点元素
  const rect = anchorEl.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  dropdown.style.right = `${window.innerWidth - rect.right}px`;
  
  document.body.appendChild(dropdown);
}
