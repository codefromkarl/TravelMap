# 行程分享服务

## 背景

当前行程只有导出 Markdown/PDF 功能，没有社交化分享能力。用户生成精美行程后，无法方便地分享到微信/小红书/微博等平台。这是获客和口碑传播的最大瓶颈。

## 目标

新增 `web/modules/share.js`，提供三种分享能力：
1. **分享图片** — 生成精美行程卡片（Canvas 绘制），支持下载 PNG
2. **分享链接** — 生成只读行程链接（基于 hash + IndexedDB 数据）
3. **二维码** — 为分享链接生成二维码图片

## 功能需求

### F1: `generateShareImage` 分享图片生成

输入：`TripPlan` 对象
输出：PNG data URL (base64)

设计规格：
- 卡片尺寸：900 × 1200 px（适合手机屏幕）
- 顶部：城市名 + 日期范围 + 行程天数
- 中部：每日行程缩略（每天 1-2 个景点，最多展示 3 天）
- 底部：TravelMap 品牌标识 + 二维码占位
- 配色：使用现有主题色（#1a73e8 主色，#f5f5f5 背景）
- 字体：系统默认中文字体栈

实现：使用 HTML5 Canvas API 绘制，零依赖。

### F2: `generateShareLink` 分享链接

输入：`TripPlan` 对象
输出：分享 URL string

机制：
- 将行程数据序列化为 JSON
- 使用 LZ-string 压缩（`web/modules/` 内联实现或引用 CDN）
- 编码为 base64，放入 URL hash：`https://travel.codefromkarl.xyz/#share=<compressed>`
- 链接长度控制在 2000 字符以内（浏览器 URL 上限）

### F3: `generateQRCode` 二维码

输入：分享 URL string
输出：PNG data URL (base64)

实现：内联 QR 码生成算法（基于 QRCode.js 的精简版，~200 行），零外部依赖。
- 纠错级别：M（15%）
- 尺寸：256 × 256 px
- 颜色：黑色码点 + 白色背景

### F4: 导出面板扩展

在现有 `export.js` 的导出面板中增加「分享」区域：
- 「生成分享图片」按钮 → 预览弹窗 → 下载 PNG
- 「复制分享链接」按钮 → 生成链接 → 写入剪贴板
- 「生成二维码」按钮 → 弹窗展示二维码 → 可下载

### F5: `share-trip` Agent Tool（可选）

注册为 Agent Tool，供 LLM 在伴游问答时调用：
- 参数：tripId（从 IndexedDB 读取）
- 返回：分享链接和二维码
- costTier: "cheap"

## 技术约束

1. **零外部依赖**：不使用 html2canvas、qrcode.js 等库，全部用原生 API 实现
2. **前端仅修改 web/modules/**：不修改后端代码
3. **不破坏现有导出功能**：在现有 export.js 面板中扩展，不影响 Markdown/PDF 导出
4. **兼容现有数据格式**：直接使用 `TripPlan` 类型（已从 IndexedDB 读取）
5. **URL 长度限制**：分享链接压缩后 + base64 编码，确保 < 2000 字符

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `web/modules/share.js` | 核心分享服务（图片/链接/二维码） |
| 修改 | `web/modules/export.js` | 导出面板增加分享按钮区域 |
| 修改 | `web/index.html` | 增加分享预览弹窗 DOM |
| 可选 | `src/tools/share.ts` | Agent Tool 定义（如需要） |
| 新增 | `web/__tests__/unit/share.test.js` | 前端单元测试 |

## 实现优先级

1. 分享图片生成（Canvas 绘制）— 用户感知最强
2. 二维码生成 — 实现简单，与图片配合使用
3. 分享链接 — 需要压缩算法，复杂度中等
