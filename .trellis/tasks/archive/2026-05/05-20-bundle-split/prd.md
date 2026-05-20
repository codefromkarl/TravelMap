# 前端 Bundle 拆分优化

## Goal

减少首屏加载的 JS bundle 大小，提升页面加载性能。

## Current State

| 文件 | 大小 | 内容 |
|------|------|------|
| `pi-bundle.js` | 10 MB | pi-agent-core + pi-ai + pi-web-ui + lit |
| `pi-core.bundle.js` | 4.5 MB | pi-agent-core 单独 |
| `pi-ai.bundle.js` | 4.2 MB | pi-ai 单独 |

所有 importmap 映射都指向 `pi-bundle.js`，即使已有独立 bundle。

## Problem

- `pi-bundle.js` 包含所有 pi 包，但 importmap 让浏览器只加载这一个文件
- 首屏加载 10MB JS 是灾难性的
- 已有独立的 core 和 ai bundle，但未被使用

## Constraints (Out of Scope)

- ❌ pi 框架层面的 tree-shaking（需要在 pi 仓库操作）
- ❌ 引入新的构建工具链（Webpack/Vite）
- ❌ 代码分割（code splitting）需要 pi 框架支持

## Proposed Solution

### 1. 调整 importmap 引用
将 importmap 从单一大 bundle 改为使用独立 bundle：

```html
<script type="importmap">
{
  "imports": {
    "@earendil-works/pi-agent-core": "./pi-core.bundle.js?v=4",
    "@earendil-works/pi-ai": "./pi-ai.bundle.js?v=4",
    "@earendil-works/pi-web-ui": "./pi-bundle.js?v=4",
    "lit": "./pi-bundle.js?v=4"
  }
}
</script>
```

### 2. 评估影响
- `pi-core.bundle.js` 和 `pi-ai.bundle.js` 是否包含完整的 pi-agent-core 和 pi-ai
- `pi-web-ui` 和 `lit` 是否仍在 `pi-bundle.js` 中
- 总下载量是否变化（可能仍是 10MB，但并行加载）

### 3. 替代方案
- 如果独立 bundle 不完整，需要在 pi 框架层面重新构建
- 考虑用 `<link rel="preload">` 预加载关键 bundle

## Acceptance Criteria

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | importmap 使用独立 bundle | 代码审查 |
| 2 | 页面功能正常 | 手动测试 |
| 3 | 首屏加载时间改善 | Lighthouse 测试 |

## Status: BLOCKED

需要先验证 `pi-core.bundle.js` 和 `pi-ai.bundle.js` 是否是完整的独立包。
如果是，可以立即调整 importmap；如果不是，需要在 pi 框架层面处理。
