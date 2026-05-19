# 🗺️ TravelMap

**AI-Powered Travel Planning Assistant** — Enter your destination and preferences to auto-generate itineraries with route maps, attraction recommendations, accommodation suggestions, weather forecasts, and budget planning.

[🌐 Try it Live](https://travel.codefromkarl.xyz) · [📖 中文文档](./README.md)

---

## ✨ Key Features

- **🗺️ Interactive Map** — Real-time route rendering with standard/satellite/terrain layer switching
- **🤖 Multi-Model AI** — Supports OpenAI / Anthropic / Google / DeepSeek / OpenRouter, switch freely
- **📋 Smart Itinerary** — Auto-generates daily plans, attraction picks, hotel suggestions, and inter-city transport
- **🌤️ Live Weather & Risk Assessment** — Destination weather queries, route safety and travel suitability evaluation
- **👥 Group-Aware** — Optimizes recommendations for adults, seniors, children, pregnant travelers, etc.
- **🔗 Action Links** — One-click generation of booking links, hotel comparisons, and transport search
- **📤 Multi-Format Export** — Markdown / PDF export and trip sharing
- **🌏 Multilingual UI** — 中文 / English / 日本語

## 🚀 Quick Start

### Use Online

Visit [travel.codefromkarl.xyz](https://travel.codefromkarl.xyz) and sign in for a free trial.

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

Optional configuration:

| Service | Purpose | Required |
|---------|---------|----------|
| LLM API Key (OpenAI/Anthropic/Google, etc.) | AI model calls | Shared mode available without key |
| Google Maps API Key | Map service | Optional |
| Amap Web API Key | Enhanced China maps | Optional |
| OpenWeatherMap API Key | Weather queries | Optional |

## 🏗️ Architecture

```
TravelAgent/
├── src/                     # Agent core logic
│   ├── agent/               # Agent orchestrator & system prompt
│   ├── tools/               # Tool definitions (attractions/weather/hotels/geocoding/budget)
│   ├── services/            # External service integration
│   └── types/               # TypeScript type definitions
├── web/                     # Cloudflare Pages deployment
│   ├── index.html           # Main page (SPA)
│   ├── functions/           # Cloudflare Functions (auth/chat/quota)
│   ├── robots.txt & sitemap.xml  # SEO
│   └── _headers             # Security & cache policies
├── .github/workflows/       # CI/CD (auto checks + deploy)
└── docs/                    # Deployment docs
```

### Tech Stack

- **Agent Framework**: [pi](https://github.com/earendil-works/pi) — AI Agent orchestration framework
- **Frontend**: Web Components (Lit) + Leaflet.js maps
- **Deployment**: Cloudflare Pages + Functions
- **Testing**: Vitest + Playwright
- **Code Quality**: Biome + TypeScript strict

## 📜 License

MIT © [codefromkarl](https://github.com/codefromkarl)

## 🔗 Links

- [codefromkarl](https://codefromkarl.com) — Author's blog
- [codefromkarl/TravelMap](https://github.com/codefromkarl/TravelMap) — This project on GitHub
