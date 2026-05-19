# 🗺️ TravelMap

> **AI-Powered Smart Travel Planning Assistant** — Enter your destination and preferences to generate a beautiful, map-based itinerary in seconds. Share instantly to social media.

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-travel.codefromkarl.xyz-6366f1?style=flat-square)](https://travel.codefromkarl.xyz)
[![中文文档](https://img.shields.io/badge/📖_中文文档-README-3b82f6?style=flat-square)](./README.md)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](./LICENSE)

---

## One-Liner

**TravelMap** is a multi-model AI travel itinerary generator designed for independent travelers, families, and backpackers. Simply enter your destination, trip duration, and preferences to automatically receive a complete travel guide with daily routes, attraction recommendations, accommodation suggestions, weather forecasts, and budget assessments—plus an interactive map and shareable trip cards.

**Core Keywords**: AI travel planner · smart itinerary assistant · trip generator · travel guide · route planning · trip sharing

---

## ✨ Key Features

| Feature | Description | Keywords |
|---------|-------------|----------|
| **🗺️ Interactive Map** | Real-time route rendering with standard/satellite/terrain layer switching | travel route planner, map navigation |
| **🤖 Multi-Model AI** | Supports OpenAI / Anthropic / Google / DeepSeek / OpenRouter, switch freely | AI trip planner, LLM travel assistant |
| **📋 Smart Itinerary** | Auto-generates daily plans, attraction picks, hotel suggestions, and inter-city transport | smart itinerary generator, auto travel guide |
| **🌤️ Live Weather & Risk Assessment** | Destination weather queries, route safety and travel suitability evaluation | travel weather, trip safety assessment |
| **👥 Group-Aware** | Optimizes recommendations for adults, seniors, children, pregnant travelers, etc. | family trip planner, group travel assistant |
| **🔗 Action Links** | One-click generation of booking links, hotel comparisons, and transport search | travel booking assistant |
| **📤 Multi-Format Export & Share** | Markdown / PDF export, plus **trip image/link/QR code sharing** (new) | trip sharing, social travel sharing |
| **🌏 Multilingual UI** | 中文 / English / 日本語 | multilingual travel planner |

---

## 🆕 Trip Sharing (New)

🎉 **Zero-dependency sharing engine built in** at `web/modules/share.js`:

- **📸 Share Image** — Canvas-drawn 900×1200 px trip cards, perfect for social feeds
- **🔗 Share Link** — LZ-String compressed trip data, read-only short link (`#share=`)
- **📱 QR Code** — Inline QR algorithm, 256×256 px, scan to open trip page

> All sharing features use zero external dependencies (no html2canvas, no qrcode.js). Pure native API implementation.

---

## 🎯 Use Cases

- **🧳 Independent Travel** — Skip the research; let AI generate a complete itinerary in 5 seconds
- **👨‍👩‍👧 Family Trips** — Auto-adjust pace and attractions for seniors & children
- **✈️ Business Travel** — Quickly generate efficient routes with transport & hotel suggestions
- **📸 Social Sharing** — Create beautiful trip cards to share travel plans on social media
- **🎒 Backpacker Routes** — Multi-city trips, budget control, and risk assessment in one place

---

## 🚀 Quick Start

### Use Online (Recommended)

Visit **[travel.codefromkarl.xyz](https://travel.codefromkarl.xyz)** and sign in for free access to all features.

### Local Development

```bash
# Clone the repository
git clone https://github.com/codefromkarl/TravelMap.git
cd TravelMap

# Install dependencies
npm install

# Development mode
npm run dev
```

### Environment Configuration

Copy `.env.example` and fill in the API keys you need:

```bash
cp .env.example .env
```

| Service | Purpose | Required |
|---------|---------|----------|
| LLM API Key (OpenAI/Anthropic/Google/DeepSeek, etc.) | AI model calls | Optional in shared mode |
| Google Maps API Key | Map service | Optional |
| Amap Web API Key | Enhanced China maps | Optional |
| OpenWeatherMap API Key | Weather queries | Optional |

---

## 🏗️ Architecture

```
TravelAgent/
├── src/                     # Agent core logic
│   ├── agent/               # Agent orchestrator & System Prompt
│   ├── tools/               # Tool definitions (attractions/weather/hotels/geocoding/budget/share)
│   ├── services/            # External service integration
│   └── types/               # TypeScript type definitions
├── web/                     # Cloudflare Pages frontend deployment
│   ├── index.html           # Main page (SPA)
│   ├── modules/             # Frontend modules (map/export/share/i18n)
│   ├── functions/           # Cloudflare Functions (auth/chat/quota)
│   ├── robots.txt & sitemap.xml  # SEO configuration
│   └── _headers             # Security & cache policies
├── .github/workflows/       # CI/CD (auto checks + deploy)
├── docs/                    # Deployment and usage docs
└── scripts/                 # Build and deploy scripts
```

### Tech Stack

- **Agent Framework**: [pi](https://github.com/earendil-works/pi) — AI Agent orchestration framework
- **Frontend**: Web Components (Lit) + Leaflet.js maps + native Canvas sharing engine
- **Deployment**: Cloudflare Pages + Functions
- **Testing**: Vitest + Playwright
- **Code Quality**: Biome + TypeScript strict mode

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Xiaohongshu Free Data Source Deployment Guide](./docs/xhs-crawler-deployment.md) | How to self-host MediaCrawler as a zero-cost Xiaohongshu data source |
| [Frontend Development Guidelines](./.trellis/spec/frontend/component-guidelines.md) | Component, styling, i18n, and panel system conventions |
| [CHANGELOG](./CHANGELOG.md) | Release notes (if available) |

---

## 📜 License

[MIT](./LICENSE) © [codefromkarl](https://github.com/codefromkarl)

---

## 🔗 Links

- [🌐 Live Demo](https://travel.codefromkarl.xyz) — Use TravelMap for free
- [📖 中文文档](./README.md)
- [✍️ Author's Blog](https://codefromkarl.com)
- [⭐ GitHub Repository](https://github.com/codefromkarl/TravelMap)

---

> **SEO Keywords**: AI travel planner, smart itinerary assistant, trip generator, travel guide, route planning, trip sharing, intelligent travel assistant, AI tourism, travel itinerary generator, travel planning app
