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
| **📤 多格式导出 & 分享** | 支持 Markdown / PDF 导出，以及**行程图片/链接/二维码分享**（新增） | 行程分享、旅行社交分享 |
| **🌏 多语言界面** | 中文 / English / 日本語 | multilingual travel planner |

---

## 🆕 行程分享（新增）

🎉 **前端已内置零依赖分享引擎** `web/modules/share.js`：

- **📸 分享图片** — Canvas 绘制 900×1200 px 精美行程卡片，适合发朋友圈/小红书
- **🔗 分享链接** — LZ-String 压缩行程数据，生成只读短链接（`#share=`）
- **📱 二维码** — 内联 QR 码算法，256×256 px，扫码即达行程页

> 所有分享功能零外部依赖（无 html2canvas、无 qrcode.js），纯原生 API 实现。

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

直接访问 **[travel.codefromkarl.xyz](https://travel.codefromkarl.xyz)**，登录后即可免费体验全部功能。

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

- [🌐 在线体验](https://travel.codefromkarl.xyz) — 免费使用旅图 TravelMap
- [📖 English README](./README.en.md)
- [✍️ 作者博客](https://codefromkarl.com)
- [⭐ GitHub 仓库](https://github.com/codefromkarl/TravelMap)

---

> **SEO 关键词**: AI旅行规划, 智能行程助手, 行程生成器, 旅游攻略, 旅行路线规划, 行程分享, 智能旅行助手, AI旅游, trip planner, travel itinerary generator
