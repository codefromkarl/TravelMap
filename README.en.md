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
| **📤 Multi-Format Export & Share** | Markdown / PDF export, plus **trip image/link/QR code sharing**; share links stored in cloud KV (30-day TTL), work across devices | trip sharing, social travel sharing |
| **✏️ Trip Editing** | Edit right after AI generation or from trip history: reorder attractions, move across days, delete days; map updates instantly on save | itinerary tweaks, plan adjustment |
| **☁️ Cloud Sync** | Trips auto-sync to the cloud after sign-in (KV), merged bidirectionally by update time; production only | trip sync, multi-device travel planning |
| **⚖️ Plan Comparison** | One-click second itinerary with a different focus from the same request; A/B cards switch map & stats, AI output diff table | itinerary comparison, multi-plan selection |
| **📊 Public Eval Report** | Automated multi-dimension evaluation (structure/semantics/usability/safety/UX), [online report page](/eval.html) with score trends | evaluation-driven development |
| **🏙️ SEO City Pages** | 10 city landing pages (Beijing/Shanghai/Guangzhou/Shenzhen/Chengdu/Hangzhou/Xi'an/Chongqing/Nanjing/Wuhan) with SEO meta + OG + JSON-LD, listed in sitemap | city travel guide, destination pages |
| **🛡️ Security** | Site-wide CSP, JWT auth, API rate limiting (see [Security](#security) section) | travel data safety, privacy protection |
| **🌙 Dark Mode** | Manual toggle + follow system | night use, dark theme |
| **📱 PWA Support** | Installable to home screen; Service Worker precaches core assets (~100 hashed files) at build time for true offline use | offline travel, add to home screen |
| **🌏 Multilingual UI** | 中文 / English / 日本語 | multilingual travel planner |

---

## 🆕 Trip Sharing

🎉 **Zero-dependency sharing engine built in** at `web/modules/share.js`:

- **📸 Share Image** — Canvas-drawn 900×1200 px trip cards, perfect for social feeds
- **🔗 Share Link** — Trip data compressed into a read-only short link (`#share=`); long trips are uploaded to cloud KV (30-day TTL), so links work across devices
- **📱 QR Code** — Inline QR algorithm, 256×256 px, scan to open trip page

> All sharing features use zero external dependencies (no html2canvas, no qrcode.js). Pure native API implementation.

---

## ⚡ Performance

- **Smaller JS bundles** — pi runtime minified with esbuild (10.4MB → 5.1MB), app logic bundled separately (app.bundle.js ~260KB)
- **Content-hashed caching** — all JS/CSS assets get `.<hash>.js/css` names at deploy time with `Cache-Control: immutable` long caching
- **Self-hosted Leaflet** — no unpkg CDN dependency; the map library (JS/CSS, inlined images) ships with the site for better stability in China
- **SW precache** — ~100 hashed assets injected into the Service Worker precache manifest at build time, so core resources work truly offline
- **API TTL cache** — Amap POI search 24h / Nominatim 7-day frontend cache (up to 200 entries), zero requests on cache hits
- **Bundle gate** — CI verifies committed bundles match source (anti-drift) and enforces size limits

---

## 🔐 Data & Privacy

- **Trip Cloud Sync** — After sign-in, trips auto-sync to the cloud (Cloudflare KV, 90-day TTL) and merge bidirectionally by update time; sync runs in production only — local dev and E2E tests send no data (isLocalHost guard)
- **Export & Delete** — The history panel offers full export options (Markdown / PDF / share image / short link / QR code); any trip can be deleted with one click and is removed from local history and the cloud
- **Share Link Storage** — Shared data lives in KV with a 30-day TTL; a 32KB size cap and IP rate limiting (10/min) prevent abuse
- **Lightweight Analytics** — Only anonymous events like page_view are collected, batched and throttled, with metadata sanitized — no personally identifiable information; silent in local dev and E2E

---

## 🛡️ Security

- **JWT OAuth** — GitHub / Google sign-in issues a JWT (HttpOnly cookie); APIs isolate data per user (`web/functions/_lib/jwt.js`)
- **Rate Limiting** — All `/api/*` endpoints are IP rate-limited (share 10/min, analytics 20/min); quota/rate limits are consumed only once across the provider failover chain
- **Site-wide CSP** — `_headers` sends a Content-Security-Policy: `default-src 'self'` plus precise script/style/img/connect allowlists, `object-src 'none'`, `frame-ancestors 'self'`
- **Secret Scanning & Dependency Audit** — Deploy artifact validation scans for secret patterns (private keys / API keys are blocked, `scripts/validate-deploy-artifact.mjs`); CI runs `npm audit --audit-level=high`

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

Visit **[travel.codefromkarl.xyz](https://travel.codefromkarl.xyz)** to load a complete preset trip without signing in. Guests can explore the daily itinerary, map and routes, local history, exports, and sharing. Dates, weather, and prices in preset trips are demonstration data, not live travel information.

Sign in with GitHub or Google only when you want to enter your own travel request or ask AI to refine an itinerary. The guest preset demo does not call AI.

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
│   ├── functions/           # Cloudflare Functions (auth/chat/quota/cloud-sync/share/analytics)
│   ├── city/                # SEO city landing pages (10 cities)
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
| [Product Polish Plan](./docs/product-polish-plan.md) | Product presentation & UX optimization roadmap |
| [CHANGELOG](./CHANGELOG.md) | Release notes |

---

## 📜 License

[MIT](./LICENSE) © [codefromkarl](https://github.com/codefromkarl)

---

## 🔗 Links

- [🌐 Live Demo](https://travel.codefromkarl.xyz) — Explore a complete preset trip without signing in
- [📖 中文文档](./README.md)
- [🤖 LLMs.txt](https://travel.codefromkarl.xyz/llms.txt) — AI-friendly description file
- [✍️ Author's Blog](https://codefromkarl.com)
- [⭐ GitHub Repository](https://github.com/codefromkarl/TravelMap)

---

## 🤖 AI Search Engine Optimization (GEO)

This project is optimized for AI search engines, including:

- **`llms.txt` file**: Structured project description for AI to understand and reference
- **Structured Data**: JSON-LD format with WebApplication and FAQ structured data
- **Semantic HTML**: Clear heading hierarchy and semantic tags
- **Multilingual Support**: Chinese, English, and Japanese content

---

## 📈 SEO Keywords

**English Keywords**: AI travel planner, travel itinerary generator, intelligent itinerary assistant, trip planner, travel planning tool, AI-powered travel, smart travel assistant, automated trip planning, AI tourism assistant

**Chinese Keywords**: AI旅行规划, 智能行程助手, 行程生成器, 旅游攻略, 旅行路线规划, 行程分享, 智能旅行助手, AI旅游, 旅行规划工具, 自动行程生成

---

> **SEO Keywords**: AI travel planner, smart itinerary assistant, trip generator, travel guide, route planning, trip sharing, intelligent travel assistant, AI tourism, travel itinerary generator, travel planning app
