import { agent, currentLang, showToast, EXPORT_STORAGE_KEY } from './context.js';
import { I18N } from './i18n.js';

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

export function createShareLink(content) {
  const tripId = crypto.randomUUID();
  const stored = JSON.parse(localStorage.getItem(EXPORT_STORAGE_KEY) || "{}");
  stored[tripId] = {
    content,
    title: `旅行计划`,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(stored));
  const url = new URL(window.location.href);
  url.searchParams.set("trip", tripId);
  navigator.clipboard.writeText(url.toString()).then(() => {
    showToast("分享链接已复制", 2500, 'success');
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = url.toString();
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("分享链接已复制", 2500, 'success');
  });
  renderSharedTrips();
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

document.getElementById("btn-share-link")?.addEventListener("click", () => {
  const content = getLastAssistantContent();
  if (!content) { showToast("没有可导出的行程内容", 2500, 'warning'); return; }
  createShareLink(content);
});