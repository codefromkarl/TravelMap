import { currentTravelers, setCurrentTravelers, TRAVELERS_KEY, showToast } from './context.js';
import { buildSystemPrompt } from './prompt.js';
import { agent, setAgent, currentLang } from './context.js';

// ─── 出行人群面板 ─────────────────────────────────────
export function loadTravelersFromStorage() {
  try {
    const raw = localStorage.getItem(TRAVELERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function saveTravelersToStorage(t) {
  localStorage.setItem(TRAVELERS_KEY, JSON.stringify(t));
}

export function formatTravelersText(t) {
  if (!t) return "";
  const parts = [];
  if (t.adults > 0) parts.push(`${t.adults}成人`);
  if (t.seniors > 0) parts.push(`${t.seniors}老人`);
  if (t.children > 0) parts.push(`${t.children}儿童`);
  if (t.infants > 0) parts.push(`${t.infants}婴幼儿`);
  if (t.pregnant) parts.push("孕妇");
  if (t.mobilityImpaired) parts.push("行动不便");
  return parts.length > 0 ? `👥 ${parts.join(" · ")}` : "👥 未设置";
}

export function updateSystemPromptWithTravelers() {
  if (agent) {
    agent.state.systemPrompt = buildSystemPrompt(currentLang);
  }
}

export function initTravelersPanel() {
  const t = loadTravelersFromStorage();
  if (t) {
    setCurrentTravelers(t);
    document.getElementById("t-adults").value = t.adults;
    document.getElementById("t-seniors").value = t.seniors;
    document.getElementById("t-children").value = t.children;
    document.getElementById("t-infants").value = t.infants;
    document.getElementById("t-pregnant").checked = t.pregnant;
    document.getElementById("t-mobility").checked = t.mobilityImpaired;
    document.getElementById("travelers-summary").textContent = formatTravelersText(t);
    document.getElementById("travelers-btn").classList.add("active");
  }
  if (agent) {
    agent.state.systemPrompt = buildSystemPrompt(currentLang);
  }
}

// 出行人群按钮
document.getElementById("travelers-btn")?.addEventListener("click", () => {
  const { activePanel, openPanel, closePanel } = window._panels || {};
  if (activePanel === "travelers-panel") {
    closePanel?.("travelers-panel");
  } else {
    openPanel?.("travelers-panel");
  }
});

document.getElementById("btn-close-travelers")?.addEventListener("click", () => {
  const { closePanel } = window._panels || {};
  closePanel?.("travelers-panel");
});

document.getElementById("travelers-save")?.addEventListener("click", () => {
  const t = {
    adults: Math.max(0, parseInt(document.getElementById("t-adults").value) || 0),
    seniors: Math.max(0, parseInt(document.getElementById("t-seniors").value) || 0),
    children: Math.max(0, parseInt(document.getElementById("t-children").value) || 0),
    infants: Math.max(0, parseInt(document.getElementById("t-infants").value) || 0),
    pregnant: document.getElementById("t-pregnant").checked,
    mobilityImpaired: document.getElementById("t-mobility").checked,
  };
  setCurrentTravelers(t);
  saveTravelersToStorage(t);
  document.getElementById("travelers-summary").textContent = formatTravelersText(t);
  document.getElementById("travelers-btn").classList.add("active");
  updateSystemPromptWithTravelers();
  document.getElementById("travelers-panel").classList.remove("open");
  setActivePanel(null);
  document.getElementById("overlay")?.classList.remove("visible");
  showToast(`已保存：${formatTravelersText(t)}`, 2500, 'success');
});