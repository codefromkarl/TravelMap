# TravelMap 用户体验优化 PRD

## 背景

用户分析发现 TravelMap 在构建稳定性、加载性能、错误反馈和无障碍方面存在改进空间。

## 目标

提升首次加载速度、改善错误反馈、增强无障碍支持。

---

## 需求列表

### R1: P0 — 构建稳定性 [已完成]

**问题**：`npm run build` 曾出现 TS2835 错误（现已修复）。
**验收**：`npm run build` 通过。

### R2: P1 — Bundle 拆分 + 懒加载

**问题**：`pi-bundle.js`(10.3MB) 包含所有依赖，首屏加载慢。
**方案**：
1. 将 Leaflet 地图库改为 CDN 动态加载（已有 `<script>` 标签，但 importmap 也引入了）
2. QR 码生成器（`share.js` 中的 `generateQRCode`）改为按需加载
3. 分享模块 `share.js` 整体懒加载

**验收**：
- `pi-bundle.js` 体积减小
- 地图功能正常
- 分享功能正常

### R3: P1 — 首屏加载骨架屏

**问题**：页面加载时白屏，用户不知道在等什么。
**方案**：
1. 在 `#page-map` 区域添加 CSS 骨架屏动画
2. JS 初始化完成后移除骨架屏
3. 添加 `prefers-reduced-motion` 支持（骨架屏动画降级）

**验收**：
- 加载时显示骨架屏
- 初始化完成后骨架屏消失
- `prefers-reduced-motion` 下无动画

### R4: P2 — 错误 Toast 增强

**问题**：错误 Toast 只显示通用提示，用户无法自助排障。
**方案**：
1. Agent 请求失败时显示具体错误（网络错误/API 错误/超时）
2. 在 `chat-init.js` 的 `resetToolbarAfterError` 中添加详细 Toast
3. 地图加载失败时显示降级提示

**验收**：
- 网络断开时提示"网络连接失败，请检查网络"
- API Key 无效时提示"API Key 无效，请在设置中检查"
- 超时时提示"请求超时，请稍后重试"

### R5: P2 — 无障碍增强

**问题**：缺少 `prefers-reduced-motion` 支持。
**方案**：
1. 在 `main.css` 添加 `@media (prefers-reduced-motion: reduce)` 规则
2. 禁用/简化所有 `transition` 和 `animation`
3. 骨架屏动画降级为静态占位

**验收**：
- 系统开启"减少动态效果"后，所有动画停止
- 功能不受影响

---

## 技术约束

- 不修改 `pi-chat-panel` Web Component
- 保持 i18n 三语支持
- 零新增外部依赖
- 浏览器兼容：Chrome 90+, Firefox 90+, Safari 15+

## 测试策略

- 手动验证各浏览器加载性能
- `npm run build` 通过
- `npm run test` 通过
