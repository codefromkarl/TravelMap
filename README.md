# 🗺️ 旅图 TravelMap

> **AI 驱动的智能旅行规划助手** — 输入目的地与偏好，秒级生成带地图的精美行程，支持一键分享至微信/小红书/微博。

[![在线体验](https://img.shields.io/badge/🌐_在线体验-travel.codefromkarl.xyz-6366f1?style=flat-square)](https://travel.codefromkarl.xyz)
[![English](https://img.shields.io/badge/📖_English-README-3b82f6?style=flat-square)](./README.en.md)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](./LICENSE)

---

## 一句话介绍

**旅图 TravelMap** 是一款基于多模型 AI 的智能行程生成工具，专为自由行旅客、家庭出游和背包客设计。只需输入目的地、旅行天数和偏好，即可自动获得包含每日路线、景点推荐、住宿建议、天气预报和预算评估的完整旅游攻略，并生成可交互地图与可分享的行程卡片。

**核心关键词**：AI旅行规划 · 智能行程助手 · 行程生成器 · 旅游攻略 · 路线规划 · 行程分享

---

## ✨ 核心能力

| 能力 | 说明 | 关键词 |
|------|------|--------|
| **🗺️ 交互式地图** | 行程路线实时渲染，支持标准/卫星/地形图层切换 | 旅行路线规划、地图导航 |
| **🤖 多模型 AI** | 支持 OpenAI / Anthropic / Google / DeepSeek / OpenRouter 自由切换 | AI旅行规划、大模型旅行助手 |
| **📋 智能行程规划** | 自动生成每日行程、景点推荐、住宿建议和城际交通方案 | 智能行程生成、自动旅游攻略 |
| **🌤️ 实时天气 & 风险评估** | 查询目的地天气，评估路线安全和出行适宜度 | 旅行天气查询、出行安全评估 |
| **👥 多人群适配** | 根据成人/老人/儿童/孕妇等人群特征优化推荐 | 亲子游规划、家庭旅行助手 |
| **🔗 行动链接** | 一键生成景点预约、酒店比价、交通搜索等实用链接 | 旅行预订助手 |
| **📤 多格式导出 & 分享** | 支持 Markdown / PDF 导出，以及**行程图片/链接/二维码分享 + 移动端原生分享（Web Share API）** | 行程分享、旅行社交分享 |
| **✏️ 行程编辑** | 历史行程可直接调整景点顺序、跨天移动、删除整天，保存后地图实时更新 | 行程微调、旅行计划调整 |
| **🌙 暗黑模式** | 手动切换 + 跟随系统 | 夜间使用、深色主题 |
| **📱 PWA 支持** | 可安装到主屏，Service Worker 离线缓存 | 离线旅行、添加到主屏幕 |
| **🌏 多语言界面** | 中文 / English / 日本語 | multilingual travel planner |

---

## 🆕 行程分享（新增）

🎉 **前端已内置零依赖分享引擎** `web/modules/share.js`：

- **📸 分享图片** — Canvas 绘制 900×1200 px 精美行程卡片，适合发朋友圈/小红书
- **🔗 分享链接** — LZ-String 压缩行程数据，生成只读短链接（`#share=`）
- **📱 二维码** — 内联 QR 码算法，256×256 px，扫码即达行程页

> 所有分享功能零外部依赖（无 html2canvas、无 qrcode.js），纯原生 API 实现。移动端支持系统原生分享面板（Web Share API）。

---

## ⚡ 性能优化

- **JS 体积减半** — pi 运行时 bundle 经 esbuild minify（10.4MB → 5.1MB），应用逻辑单独打包（app.bundle.js ~260KB）
- **内容哈希缓存** — 部署时所有 JS/CSS 自动生成 `.<hash>.js/css` 文件并重写引用，配合 `Cache-Control: immutable` 长缓存，二次访问近乎瞬时
- **Leaflet 自托管** — 不再依赖 unpkg CDN，地图库（JS/CSS，图片内联）随站点部署，国内访问更稳定
- **Bundle 门禁** — CI 强制校验提交的 bundle 与源码一致（防漂移）并限制体积上限
- **本地构建** — `npm run build:bundle` 一键重建，`npm run verify:bundle` 校验 bundle 与源码一致性

---

## 🎯 适用场景

- **🧳 自由行规划** — 不想花时间做攻略，让 AI 5 秒生成完整行程
- **👨‍👩‍👧 家庭出游** — 根据老人/儿童需求自动调整节奏和景点
- **✈️ 商务差旅** — 快速生成高效路线，附带交通和酒店建议
- **📸 社交分享** — 生成精美行程卡片，分享旅行计划到社交媒体
- **🎒 背包客探路** — 多城市联游、预算控制、风险评估一站式解决

---

## 🚀 快速开始

### 在线使用（推荐）

直接访问 **[travel.codefromkarl.xyz](https://travel.codefromkarl.xyz)**。无需登录即可加载完整预设示例，并体验每日行程、地图路线、本地历史记录、导出与分享。示例中的日期、天气和价格均为演示数据，并非实时旅行信息。

当您输入自己的旅行需求或要求 AI 微调时，再使用 GitHub 或 Google 登录。游客预设演示不会调用 AI。

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/codefromkarl/TravelMap.git
cd TravelMap

# 安装依赖
npm install

# 开发模式
npm run dev
```

### 环境配置

复制 `.env.example` 并填入所需的 API Key：

```bash
cp .env.example .env
```

| 服务 | 用途 | 是否必需 |
|------|------|---------|
| LLM API Key (OpenAI/Anthropic/Google/DeepSeek 等) | AI 模型调用 | 共享模式可免配 |
| Google Maps API Key | 地图服务 | 可选 |
| 高德地图 Web API Key | 国内地图增强 | 可选 |
| OpenWeatherMap API Key | 天气查询 | 可选 |

---

## 🏗️ 技术架构

```
TravelAgent/
├── src/                     # Agent 核心逻辑
│   ├── agent/               # Agent 编排器 & System Prompt
│   ├── tools/               # 工具定义（景点/天气/酒店/地理编码/预算/分享）
│   ├── services/            # 外部服务集成层
│   └── types/               # TypeScript 类型定义
├── web/                     # Cloudflare Pages 前端部署
│   ├── index.html           # 主页面（SPA）
│   ├── modules/             # 前端模块（地图/导出/分享/国际化等）
│   ├── functions/           # Cloudflare Functions（认证/聊天/配额）
│   ├── robots.txt & sitemap.xml  # SEO 配置
│   └── _headers             # 安全 & 缓存策略
├── .github/workflows/       # CI/CD（自动检查 + 部署）
├── docs/                    # 部署与使用文档
└── scripts/                 # 构建与部署脚本
```

### 技术栈

- **Agent 框架**: [pi](https://github.com/earendil-works/pi) — AI Agent 编排框架
- **前端**: Web Components (Lit) + Leaflet.js 地图 + 原生 Canvas 分享引擎
- **部署**: Cloudflare Pages + Functions
- **测试**: Vitest + Playwright
- **代码质量**: Biome + TypeScript strict mode

---

## 📚 相关文档

| 文档 | 说明 |
|------|------|
| [小红书免费数据源部署指南](./docs/xhs-crawler-deployment.md) | 如何自建 MediaCrawler 作为零成本小红书数据源 |
| [前端开发规范](./.trellis/spec/frontend/component-guidelines.md) | 组件、样式、i18n、面板系统规范 |
| [CHANGELOG](./CHANGELOG.md) | 版本更新日志（如有） |

---

## 📜 License

[MIT](./LICENSE) © [codefromkarl](https://github.com/codefromkarl)

---

## 🔗 相关链接

- [🌐 在线体验](https://travel.codefromkarl.xyz) — 无需登录即可操作完整示例行程
- [📖 English README](./README.en.md)
- [🤖 LLMs.txt](https://travel.codefromkarl.xyz/llms.txt) — AI 友好描述文件
- [✍️ 作者博客](https://codefromkarl.com)
- [⭐ GitHub 仓库](https://github.com/codefromkarl/TravelMap)

---

## 🤖 AI 搜索引擎优化 (GEO)

本项目已针对 AI 搜索引擎进行优化，包括：

- **`llms.txt` 文件**：为 AI 提供结构化的项目描述，便于理解和引用
- **结构化数据**：使用 JSON-LD 格式，包含 WebApplication 和 FAQ 结构化数据
- **语义化 HTML**：清晰的标题层次和语义标签
- **多语言支持**：中文、英文、日文内容

---

## 📈 SEO 关键词

**中文关键词**：AI旅行规划, 智能行程助手, 行程生成器, 旅游攻略, 旅行路线规划, 行程分享, 智能旅行助手, AI旅游, 旅行规划工具, 自动行程生成

**英文关键词**：AI travel planner, travel itinerary generator, intelligent itinerary assistant, trip planner, travel planning tool, AI-powered travel, smart travel assistant

---

> **SEO 关键词**: AI旅行规划, 智能行程助手, 行程生成器, 旅游攻略, 旅行路线规划, 行程分享, 智能旅行助手, AI旅游, trip planner, travel itinerary generator, AI travel planner, intelligent itinerary assistant
