# UI/UX 优化：首屏引导 + 交互一致性

## Goal

修复旅图前端界面的关键可用性问题：首屏空状态无引导、输入框语言不匹配、移动端未适配，以及多种交互不一致。使新用户打开页面后能立即理解产品并开始使用。

## What I already know

- **页面结构**：单文件 SPA (`web/index.html`，74.7KB)，内联 CSS/JS + pi-web-ui Web Component
- **技术栈**：原生 HTML/CSS/JS + Lit Web Components + Leaflet 地图
- **视口测试**：当前仅在 1024×929 下验证
- **设计系统**：Zinc 灰阶深色主题 + Indigo 强调色，CSS 变量已有但 spec 未填写
- **i18n**：已有 `data-i18n` 属性和语言切换按钮，但输入框 placeholder 硬编码英文
- **e2e 测试**：已有 `page-load.spec.ts`、`page-startup.spec.ts`、`interaction.spec.ts`
- **面板交互**：三种面板（出行人群=浮层、历史=抽屉、地图=抽屉）互不排斥

## Assumptions

- 不需要引入新的 UI 框架或组件库
- 保持单文件 SPA 架构，所有修改在 `web/index.html` 内完成
- pi-web-ui 的 `pi-chat-panel` Web Component 不在本任务修改范围

## Requirements

### P0 — 必须修复（阻塞可用性）

#### R1: 首屏欢迎状态

当前聊天区域完全空白，新用户打开页面只看到输入框，不知如何开始。

**需求**：
- 页面加载后，在聊天区域 `message-list` 中显示欢迎消息
- 展示 3-4 个示例提示词卡片（如"规划一个 3 天杭州亲子游"、"北京 5 日文化之旅"）
- 点击示例卡片自动填入输入框并发送
- 欢迎消息和示例卡片需支持 i18n（中/英/日）
- 用户发送第一条消息后，欢迎状态消失（由 pi-chat-panel 正常消息流接管）

#### R2: 输入框 placeholder 语言匹配

当前 `textarea` 的 `placeholder="Type a message..."` 是英文硬编码，与界面其他中文元素不匹配。

**需求**：
- 默认 placeholder 改为中文："描述你的旅行计划..."
- 切换语言时同步更新：EN → "Describe your travel plan..."，JA → "旅行計画を入力..."
- 使用已有的 i18n 机制绑定

#### R3: 移动端基本适配

当前仅有一个 `@media (max-width: 640px)` 规则用于地图面板全宽，无其他移动端适配。

**需求**：
- 添加 `@media (max-width: 640px)` 断点规则：
  - Header：标题缩短或隐藏副标题，按钮改为图标
  - 出行人群面板：全宽显示
  - 历史行程面板：全宽显示
  - 聊天输入框：宽度自适应
- 375px 宽度下无水平滚动条
- 触控目标至少 44×44px

### P1 — 重要优化

#### R4: 统一面板交互模式

三种面板交互模式不一致：出行人群=浮层（position:fixed），历史/地图=抽屉（transform）。

**需求**：
- 出行人群面板改为右侧抽屉滑入，与历史/地图一致
- 打开任意面板时，关闭其他已打开的面板（互斥）
- 所有面板统一关闭方式：✕ 按钮 + 点击遮罩层关闭 + Esc 键关闭
- 添加半透明遮罩层（z-index 低于面板）

#### R5: 出行人群面板添加关闭控制

当前出行人群面板无关闭按钮，只能点"保存设置"。

**需求**：
- 已由 R4 覆盖（改为抽屉 + 统一关闭方式）

#### R6: 地图图例颜色冲突修复

图例中景点和高风险路线都使用 `#ef4444`（红色），无法区分。

**需求**：
- 景点标记改用蓝色 `#3b82f6`（blue-500）
- 更新对应图例文字的颜色指示点
- 地图标记代码中的景点 marker 颜色同步更新

#### R7: 隐藏功能入口可见性

MD/PDF/分享/地图按钮初始 `display:none`，用户无法预知这些功能存在。

**需求**：
- 导出按钮（MD/PDF/分享）和地图按钮改为 disabled + ghost 状态显示
- Tooltip 提示"生成行程后可用"
- 生成行程后自动切换为 enabled 状态
- 视觉区分：disabled 状态降低 opacity（0.4），去除 hover 效果

## Acceptance Criteria

- [ ] 首屏显示欢迎消息 + 至少 3 个示例提示词卡片，中/英/日三语正确
- [ ] 点击示例卡片能自动填入输入框
- [ ] 输入框 placeholder 随语言切换同步变化（中/英/日）
- [ ] 375px 宽度无水平滚动，header 不溢出
- [ ] 三种面板统一抽屉交互，互斥，均有 ✕ + 遮罩 + Esc 关闭
- [ ] 景点图例颜色与高风险路线颜色不同
- [ ] 导出/地图按钮以 disabled ghost 状态可见，tooltip 提示
- [ ] 生成行程后导出/地图按钮自动 enabled
- [ ] e2e 测试通过（`npx playwright test`）
- [ ] 无 console error（非 CORS/网络类）

## Definition of Done

- 所有 Acceptance Criteria 通过
- `biome check` 通过（index.html 内的 JS 不在 biome 扫描范围内，手动检查格式）
- Playwright e2e 测试通过（desktop + mobile project）
- 浏览器实际验证：1024px + 375px 两个视口

## Technical Approach

### 修改范围

所有修改集中在 `web/index.html` 单文件中：

1. **CSS 部分**（`<style>` 块内）
   - 添加首屏欢迎状态样式
   - 添加遮罩层样式
   - 添加 disabled ghost 按钮样式
   - 扩展移动端媒体查询

2. **HTML 部分**（`<body>` 内）
   - 在 `#chat-container` 前插入欢迎状态 DOM
   - 在 `#app` 下添加遮罩层 `#overlay`
   - 导出按钮和地图按钮改为 disabled 状态

3. **JS 部分**（`<script type="module">` 内）
   - 添加欢迎状态初始化和示例卡片点击逻辑
   - 添加面板互斥逻辑
   - 添加遮罩层点击 + Esc 键监听
   - 更新 i18n 翻译表
   - 更新 placeholder 切换逻辑
   - 更新导出按钮 disabled/enabled 切换逻辑

### 关键设计决策

- **欢迎状态位置**：作为 `pi-chat-panel` 内部的 welcome message 注入，还是覆盖在 `message-list` 上方的独立层 → 选择在 `#chat-container` 内添加独立 welcome div，发送首条消息后隐藏
- **面板互斥**：维护一个全局状态变量 `activePanel`，打开新面板时关闭当前面板

## Decision (ADR-lite)

**Context**: 三种面板交互模式不一致，首屏无引导，移动端未适配
**Decision**: 统一抽屉模式 + 遮罩层互斥；首屏添加独立 welcome div；移动端仅添加关键断点
**Consequences**: 修改集中在 CSS 和 JS，不涉及 pi-web-ui 组件内部；需注意 welcome div 与 pi-chat-panel 的层级关系

## Out of Scope

- pi-web-ui Web Component 内部修改（ChatPanel、MessageEditor 等）
- 新增 SVG logo 或品牌升级
- `prefers-reduced-motion` 支持（降级为 P2）
- 发送按钮尺寸优化（降级为 P2）
- 深色/浅色主题切换
- 性能优化

## Technical Notes

- 目标文件：`web/index.html`（74.7KB，~2000 行）
- CSS 变量体系：`--bg-primary` `--bg-secondary` `--bg-tertiary` `--text-primary` `--text-secondary` `--border-color` `--accent-color`
- i18n 机制：`data-i18n` 属性 + `window.I18N` 翻译表 + `applyI18n()` 函数
- 测试文件：`web/__tests__/page-load.spec.ts`、`interaction.spec.ts`、`page-startup.spec.ts`
- Playwright 配置：desktop (1280×720) + mobile (375×812) 两个 project
- 已有 e2e 测试中 page-load 验证了 header/subtitle，需注意欢迎状态不影响现有测试断言
