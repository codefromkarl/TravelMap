# UI/UX P2 优化 — 动画偏好/发送按钮/键盘无障碍/卡片i18n

## Goal

打磨旅途星辰前端的体验细节：动画偏好适配、发送按钮可发现性、键盘无障碍、示例卡片国际化。

## Requirements

### R1: prefers-reduced-motion 动画偏好适配

当前所有面板的 `transition: transform 0.25s ease` 和按钮 hover 过渡在用户开启"减少动画"系统设置后仍然播放。

**需求**：
- 添加 `@media (prefers-reduced-motion: reduce)` 规则
- 将所有 `transition` 设为 `none` 或极短（0.01ms）
- 覆盖范围：面板抽屉滑入、按钮 hover/active、toast 弹出、卡片 hover
- 不影响功能，只是去掉动画

### R2: 发送按钮可发现性优化

当前发送按钮仅 32×32px，无文字标识，难以发现。

**需求**：
- 发送按钮尺寸增大到至少 40×40px
- 添加 `title` 属性："发送消息" / "Send" / "送信"（i18n）
- hover 时显示 subtle 高亮（与 accent-color 一致）
- 可选：Enter 键发送提示文字

**注意**：发送按钮在 `message-editor` Web Component shadow DOM 内，无法直接修改。通过 CSS `::part()` 或外部 CSS 变量覆盖。

### R3: 示例卡片 i18n

当前 4 个示例卡片文本硬编码中文，切换语言后卡片内容不变。

**需求**：
- 为每个卡片添加 `data-i18n` 属性
- I18N 表中添加 4 个卡片的翻译（中/英/日）
- 切换语言时通过 `applyI18n()` 更新卡片文本

### R4: 键盘无障碍基础

**需求**：
- 添加 `skip-link`（跳到主内容），首次 Tab 时显示
- 面板打开时 focus trap（Tab 循环在面板内）
- 所有 `✕` 关闭按钮添加 `aria-label="关闭"`
- 遮罩层添加 `role="dialog"` + `aria-modal="true"` 标记

## Acceptance Criteria

- [ ] `prefers-reduced-motion: reduce` 下所有过渡动画消失
- [ ] 发送按钮 ≥ 40×40px，有 title 提示
- [ ] 示例卡片中/英/日三语切换正确
- [ ] 首次 Tab 显示 skip-link，可跳到聊天区
- [ ] 面板打开时 Tab 不离开面板
- [ ] 关闭按钮有 aria-label
- [ ] 432 测试通过 + biome check 通过

## Out of Scope

- SVG logo 替换
- 深色/浅色主题切换
- pi-web-ui Web Component 内部修改

## Technical Approach

所有修改集中在 `web/index.html`：
- CSS：添加 `@media (prefers-reduced-motion: reduce)` + 发送按钮尺寸覆盖
- HTML：添加 skip-link、aria 属性、卡片 data-i18n
- JS：更新 I18N 表 + applyI18n() + focus trap 逻辑
