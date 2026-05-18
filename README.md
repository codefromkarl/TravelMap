# TravelAgent

AI Travel Planning Agent — 基于 [pi](https://pi.dev) 框架的智能旅行规划智能体。

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 检查（lint + typecheck）
npm run check

# 测试
npm run test
```

## 项目结构

```
src/
├── agent/
│   ├── travel-agent.ts   # 核心 Agent 编排器
│   └── prompts.ts        # System Prompt
├── tools/
│   └── index.ts          # Agent 工具定义（景点/天气/酒店/地理编码）
├── types/
│   └── trip.ts           # 旅行规划类型定义
└── index.ts              # 入口
```

## 技术栈

- **Agent 框架**: [@earendil-works/pi-agent-core](https://pi.dev)
- **LLM API**: [@earendil-works/pi-ai](https://pi.dev) (20+ 供应商统一接口)
- **类型验证**: TypeBox (运行时 schema 验证)
- **Lint**: Biome
- **测试**: Vitest
- **工作流**: Trellis

## 环境变量

```bash
# LLM 配置 (至少配一个供应商)
OPENAI_API_KEY=sk-xxx
# ANTHROPIC_API_KEY=sk-ant-xxx

# 地图服务 (后续接入)
# VITE_AMAP_WEB_KEY=xxx
# GOOGLE_MAPS_API_KEY=xxx
```

## License

MIT
