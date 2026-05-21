import { agent, currentLang, showToast, EXPORT_STORAGE_KEY, lastTripContent } from './context.js?v=2';
import { I18N } from './i18n.js';
import {
  generateShareImage, generateShareLink,
  downloadImage, loadSharedTripFromHash
} from './share.js';

// QR 码生成器懒加载
let _generateQRCode = null;
async function getQRCodeGenerator() {
  if (!_generateQRCode) {
    const mod = await import('./share.js');
    _generateQRCode = mod.generateQRCode;
  }
  return _generateQRCode;
}

// ─── 导出服务 ─────────────────────────────────────────
export function getLastAssistantContent() {
  if (!agent) return null;
  const msgs = agent.state.messages;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant" && typeof msgs[i].content === "string" && msgs[i].content.length > 100) {
      return msgs[i].content;
    }
  }
  return null;
}

export function generateMarkdown(content) {
  if (!content.trim().startsWith("#")) {
    const date = new Date().toLocaleDateString("zh-CN");
    return `# 🗺️ 旅行计划
> 由「TravelMap」AI 旅行规划助手生成 · ${date}

---

${content}

---
*本计划由 AI 自动生成，仅供参考。*`;
  }
  return content;
}

export function downloadMarkdown(content) {
  const md = generateMarkdown(content);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `旅行计划-${dateStr}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Markdown 已下载", 2500, 'success');
}

export function exportPDF(content) {
  const md = generateMarkdown(content);
  const printEl = document.getElementById("print-content");
  const html = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\d+\.\s+(.+)$/gm, (m, p1) => `<li>${p1}</li>`)
    .replace(/^-\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^---$/gm, "<hr>")
    .replace(/\n\n/g, "</p><p>")
    .split("\n").map(line => line.startsWith("<") ? line : (line.trim() ? `<p>${line}</p>` : "")).join("\n");
  printEl.innerHTML = `<h1 style="text-align:center;margin-bottom:4px;">🗺️ 旅行计划</h1>
<p style="text-align:center;color:#666;font-size:11pt;margin-bottom:20px;">由「TravelMap」AI 生成 · ${new Date().toLocaleDateString("zh-CN")}</p>
${html}`;
  window.print();
  showToast("请选择「另存为 PDF」", 2500, 'warning');
}

// ─── 分享链接加载 ─────────────────────────────────────
export function loadSharedTrip() {
  const params = new URLSearchParams(window.location.search);
  const tripId = params.get("trip");
  if (!tripId) return;
  const stored = JSON.parse(localStorage.getItem(EXPORT_STORAGE_KEY) || "{}");
  const trip = stored[tripId];
  if (!trip) {
    showToast("未找到该分享的行程", 4000, 'warning');
    return;
  }
  const msg = {
    role: "assistant",
    content: `# 📋 分享的旅行计划\n\n${trip.content}`,
    timestamp: Date.now(),
  };
  if (agent) {
    agent.state.messages = [...agent.state.messages, msg];
    showToast("已加载分享的行程", 3000, 'success');
  }
}

export function renderSharedTrips() {
  const stored = JSON.parse(localStorage.getItem(EXPORT_STORAGE_KEY) || "{}");
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  let changed = false;
  for (const [id, trip] of Object.entries(stored)) {
    if (now - new Date(trip.createdAt).getTime() > maxAge) {
      delete stored[id];
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(stored));
  }
}

// ─── 导出按钮绑定 ─────────────────────────────────────
document.getElementById("btn-export-md")?.addEventListener("click", () => {
  const content = getLastAssistantContent();
  if (!content) { showToast("没有可导出的行程内容", 2500, 'warning'); return; }
  downloadMarkdown(content);
});

document.getElementById("btn-export-pdf")?.addEventListener("click", () => {
  const content = getLastAssistantContent();
  if (!content) { showToast("没有可导出的行程内容", 2500, 'warning'); return; }
  exportPDF(content);
});

// ─── 分享按钮绑定 ─────────────────────────────────────

function getShareTripPlan() {
  // 优先使用全局解析好的 TripPlan
  if (window._lastTripPlan) return window._lastTripPlan;
  return null;
}

let isShareModalGenerating = false;

async function openShareModal(type) {
  if (isShareModalGenerating) return;
  isShareModalGenerating = true;
  const overlay = document.getElementById('share-modal-overlay');
  const header = document.getElementById('share-modal-header').querySelector('h2');
  const imgContainer = document.getElementById('share-preview-image');
  const qrContainer = document.getElementById('share-qr-container');
  const imgEl = document.getElementById('share-preview-img');
  const qrEl = document.getElementById('share-qr-img');
  const downloadBtn = document.getElementById('btn-download-share-image');

  if (!overlay) return;

  // Reset
  imgContainer.style.display = 'none';
  qrContainer.style.display = 'none';

  const tripPlan = getShareTripPlan();
  if (!tripPlan) {
    const dict = I18N[currentLang] || I18N.zh;
    showToast(dict.shareLoadError || '⚠️ 没有可分享的行程内容', 2500, 'warning');
    return;
  }

  const dict = I18N[currentLang] || I18N.zh;

  try {
  const generateQRCode = await getQRCodeGenerator();
  if (type === 'image') {
    header.textContent = dict.shareModalTitle || '📸 分享预览';
    // 尝试先生成二维码放在卡片上
    let qrDataUrl = null;
    try {
      const linkUrl = generateShareLink(tripPlan);
      if (linkUrl) {
        qrDataUrl = generateQRCode(linkUrl);
      }
    } catch (e) { /* ignore */ }

    const dataUrl = await generateShareImage(tripPlan, qrDataUrl);
    if (dataUrl) {
      imgEl.src = dataUrl;
      imgContainer.style.display = 'block';
      downloadBtn.style.display = 'inline-block';
      downloadBtn.onclick = () => {
        downloadImage(dataUrl, `旅行计划-${tripPlan.city || 'travel'}.png`);
        showToast(dict.shareImageDownloaded || '✅ 图片已下载', 2500, 'success');
      };
      overlay.classList.add('open');
      showToast(dict.shareImageGenerated || '✅ 分享图片已生成', 2500, 'success');
    }
  } else if (type === 'qr') {
    let qrDataUrl = null;
    let linkUrl = '';
    try {
      linkUrl = generateShareLink(tripPlan);
      if (linkUrl) {
        qrDataUrl = generateQRCode(linkUrl);
      }
    } catch (e) { /* ignore */ }

    if (!qrDataUrl && linkUrl) {
      // QR 容量不足，回退到短链接模式
      const tripId = crypto.randomUUID();
      const stored = JSON.parse(localStorage.getItem(EXPORT_STORAGE_KEY) || '{}');
      stored[tripId] = {
        content: linkUrl,
        title: `旅行计划`,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(stored));
      const shortUrl = new URL(window.location.href);
      shortUrl.searchParams.set('trip', tripId);
      qrDataUrl = generateQRCode(shortUrl.toString());
      showToast('行程较长，已使用短链接生成二维码', 3000, 'warning');
    }
    header.textContent = dict.shareQR || '📱 二维码';
    if (qrDataUrl) {
      qrEl.src = qrDataUrl;
      qrContainer.style.display = 'block';
      imgContainer.style.display = 'none';
      downloadBtn.style.display = 'inline-block';
      downloadBtn.onclick = () => {
        downloadImage(qrDataUrl, `qrcode-${tripPlan.city || 'travel'}.png`);
        showToast(dict.shareImageDownloaded || '✅ 图片已下载', 2500, 'success');
      };
      overlay.classList.add('open');
      showToast(dict.shareQRGenerated || '✅ 二维码已生成', 2500, 'success');
    } else {
      showToast(dict.shareLoadError || '⚠️ 二维码生成失败，链接过长', 2500, 'warning');
    }
  }
  } finally {
    isShareModalGenerating = false;
  }
}

function closeShareModal() {
  const overlay = document.getElementById('share-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

// 分享图片
document.getElementById('btn-share-image')?.addEventListener('click', () => {
  openShareModal('image');
});

// 分享链接（新）
document.getElementById('btn-share-link-new')?.addEventListener('click', () => {
  const tripPlan = getShareTripPlan();
  if (!tripPlan) {
    const dict = I18N[currentLang] || I18N.zh;
    showToast(dict.shareLoadError || '⚠️ 没有可分享的行程内容', 2500, 'warning');
    return;
  }
  const url = generateShareLink(tripPlan);
  if (url) {
    navigator.clipboard.writeText(url).then(() => {
      const dict = I18N[currentLang] || I18N.zh;
      showToast(dict.shareLinkCopied || '🔗 链接已复制到剪贴板', 2500, 'success');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      const dict = I18N[currentLang] || I18N.zh;
      showToast(dict.shareLinkCopied || '🔗 链接已复制到剪贴板', 2500, 'success');
    });
  }
});

// 二维码
document.getElementById('btn-share-qr')?.addEventListener('click', () => {
  openShareModal('qr');
});

// 关闭分享弹窗
document.getElementById('btn-close-share-modal')?.addEventListener('click', closeShareModal);
document.getElementById('btn-close-share-modal-2')?.addEventListener('click', closeShareModal);
document.getElementById('share-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeShareModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('share-modal-overlay');
    if (overlay?.classList.contains('open')) closeShareModal();
  }
});