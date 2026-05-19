# 🗺️ 旅图 TravelMap

**AI 驱动的智能旅行规划助手** — 输入目的地和偏好，自动生成行程路线、景点推荐、住宿建议、天气预报和预算规划。

[🌐 在线体验](https://travel.codefromkarl.xyz) · [📖 English](./README.en.md)

---

## ✨ 核心能力

- **🗺️ 交互式地图** — 行程路线实时渲染在地图上，支持标准/卫星/地形图层切换
- **🤖 多模型 AI** — 支持 OpenAI / Anthropic / Google / DeepSeek / OpenRouter，自由切换
- **📋 智能行程规划** — 自动生成每日行程、景点推荐、住宿建议和城际交通方案
- **🌤️ 实时天气 & 风险评估** — 查询目的地天气，评估路线安全和出行适宜度
- **👥 多人群适配** — 根据成人/老人/儿童/孕妇等人群特征优化推荐
- **🔗 行动链接** — 一键生成景点预约、酒店比价、交通搜索等实用链接
- **📤 多格式导出** — 支持 Markdown / PDF 导出和行程分享
- **🌏 多语言界面** — 中文 / English / 日本語

## 🚀 快速开始

### 在线使用

直接访问 [travel.codefromkarl.xyz](https://travel.codefromkarl.xyz)，登录后即可免费体验。

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

可选配置项：

| 服务 | 用途 | 必需 |
|------|------|------|
| LLM API Key (OpenAI/Anthropic/Google 等) | AI 模型调用 | 共享模式可免配 |
| Google Maps API Key | 地图服务 | 可选 |
| 高德地图 Web API Key | 国内地图增强 | 可选 |
| OpenWeatherMap API Key | 天气查询 | 可选 |

## 🏗️ 技术架构

```
TravelAgent/
├── src/                     # Agent 核心逻辑
│   ├── agent/               # Agent 编排器 & System Prompt
│   ├── tools/               # 工具定义（景点/天气/酒店/地理编码/预算等）
│   ├── services/            # 外部服务集成层
│   └── types/               # TypeScript 类型定义
├── web/                     # Cloudflare Pages 部署
│   ├── index.html           # 主页面（SPA）
│   ├── functions/           # Cloudflare Functions（认证/聊天/配额）
│   ├── robots.txt & sitemap.xml  # SEO
│   └── _headers             # 安全 & 缓存策略
├── .github/workflows/       # CI/CD（自动检查 + 部署）
└── docs/                    # 部署文档
```

### 技术栈

- **Agent 框架**: [pi](https://github.com/earendil-works/pi) — AI Agent 编排框架
- **前端**: Web Components (Lit) + Leaflet.js 地图
- **部署**: Cloudflare Pages + Functions
- **测试**: Vitest + Playwright
- **代码质量**: Biome + TypeScript strict

## 📜 License

MIT © [codefromkarl](https://github.com/codefromkarl)

## 🔗 友情链接

- [codefromkarl](https://codefromkarl.com) — 作者博客
- [codefromkarl/TravelMap](https://github.com/codefromkarl/TravelMap) — 本项目 GitHub
