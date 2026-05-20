# 重构 web/index.html 单文件 (4736行)

## 背景

`web/index.html` 是项目唯一的前端入口，当前 4736 行 / 194KB，包含：
- 1401 行 CSS（30%）
- 378 行 HTML（8%）
- 2887 行 JS（61%），含 55 个具名函数/类，零 export

**核心问题**：
- 可维护性 🔴：单文件认知负荷过高，Git diff/review 效率低
- 可测试性 🔴：所有函数在闭包中，无法独立单元测试
- CDN 缓存 🟡：每次访问重传 194KB，改一行 CSS 全部重传
- 开发体验 🔴：编辑器符号跳转、outline 不可用

详细分析见：`.trellis/tasks/research/refactor-web-indexhtml.md`

---

## 方案：纯 ES Module 拆分（零构建）

采用浏览器原生 ES Module，无需引入打包工具，保持 `wrangler pages deploy web/` 部署方式不变。

---

## Phase 1: CSS 提取（1小时，零风险）

**操作**：将 `<style>` 提取到 `web/styles/main.css`，HTML 改为 `<link>`

**文件变更**：
- 新建 `web/styles/main.css` — 从 index.html 提取的 1401 行 CSS
- 修改 `web/index.html` — `<style>` → `<link rel="stylesheet" href="./styles/main.css">`

**验收**：
- [ ] Playwright E2E 测试全通过
- [ ] 页面视觉无变化
- [ ] CSS 独立可缓存（Network 面板确认）

---

## Phase 2: JS 模块拆分（2-3天，核心重构）

按依赖拓扑从叶子到根提取，每步都跑 E2E 回归：

### 目标结构
```
web/
  modules/
    storage.js          ← LocalStorageBackend + AppStorage
    tools/
      attractions.js    ← searchAttractionsTool
      weather.js        ← searchWeatherTool
      hotels.js         ← searchHotelsTool
      geocode.js        ← geocodeTool
      budget.js         ← estimateBudgetTool
      action-links.js   ← actionLinkTool
      companion.js      ← companionQATool
      multi-city.js     ← multiCityPlanTool
      index.js          ← 聚合所有工具
    auth.js             ← checkAuth, requireAuth, onAuthenticated, updateQuota
    export.js           ← generateMarkdown, downloadMarkdown, exportPDF, shareLink
    i18n.js             ← applyI18n, 语言资源
    travelers.js        ← 出行人群面板逻辑
    panels.js           ← openPanel, closePanel, closeAllPanels, trapFocus
    db.js               ← IndexedDB 会话持久化
    supply-cache.js     ← 补给点缓存
    map.js              ← 地图面板 + Leaflet 逻辑
    model-config.js     ← 模型配置弹窗
    history.js          ← 历史面板 + 自动保存
    welcome.js          ← 欢迎状态 + 示例卡片
    session.js          ← 页面恢复会话
    context.js          ← 共享状态（agent 实例、appStorage 实例）
  index.html            ← 精简为 ~100 行 HTML + import 胶水
```

### 提取顺序（叶子 → 根）
1. **纯数据/纯函数**（零依赖）：`storage.js`, `tools/*.js`, `i18n.js`
2. **DOM 依赖**：`panels.js`, `travelers.js`, `welcome.js`
3. **外部库依赖**：`map.js` (Leaflet), `db.js` (IndexedDB)
4. **有状态模块**：`auth.js`, `export.js`, `history.js`, `session.js`
5. **入口胶水**：精简 `index.html`

### 关键风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| 共享状态传递 | 创建 `context.js` 导出单例，各模块 import |
| Leaflet CDN + ES Module 混用 | Leaflet 保持 `<script>` 全局加载，map.js 用 `window.L` |
| 回归 bug | 每步都跑 Playwright E2E |

**验收**：
- [ ] 所有模块有 `export`
- [ ] `index.html` ≤ 150 行
- [ ] Playwright E2E 测试全通过
- [ ] CDN 缓存生效（JS/CSS 独立缓存）

---

## Phase 3: 可测试性补全（1-2天）

为提取出的模块添加 vitest 单元测试：

| 优先测试模块 | 理由 |
|-------------|------|
| `tools/*.js` | 8 个工具定义，mock 数据最需覆盖 |
| `db.js` | IndexedDB 操作，数据完整性关键 |
| `auth.js` | 认证逻辑，安全关键 |
| `i18n.js` | 3 语言翻译完整性 |
| `map.js` | 500 行最复杂模块 |

**验收**：
- [ ] 核心模块有 vitest 单元测试
- [ ] 测试覆盖工具定义的 mock 数据
- [ ] CI 中集成测试运行

---

## Phase 4（可选）: Vite 构建

Phase 2 稳定后按需引入，获得 HMR、Tree-shaking 等能力。当前不建议，保持零构建。

---

## 依赖

- Phase 1 独立，可立即执行
- Phase 2 依赖 Phase 1（CSS 已分离）
- Phase 3 依赖 Phase 2（模块已 export）
- Phase 4 依赖 Phase 2

## 验收标准

- [ ] `web/index.html` ≤ 150 行
- [ ] 所有 JS 模块可独立 import/export
- [ ] Playwright E2E 测试全通过
- [ ] CDN 缓存生效（JS/CSS 独立缓存，HTML 从 194KB 降至 ~20KB）
- [ ] 核心模块有 vitest 单元测试
- [ ] 部署方式不变（`wrangler pages deploy web/`）
