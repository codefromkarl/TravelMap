# TravelAgent 目录结构约定

## 源码结构

```
src/
├── agent/              # Agent 编排层
│   ├── travel-agent.ts # 核心 Agent 类（pi-agent-core）
│   └── prompts.ts      # System Prompt 模板
├── tools/              # Agent 工具层
│   ├── index.ts        # 工具注册入口
│   ├── attractions.ts  # 景点搜索工具（未来拆分）
│   ├── weather.ts      # 天气查询工具
│   ├── hotels.ts       # 酒店搜索工具
│   └── geocode.ts      # 地理编码工具
├── services/           # 外部服务适配层
│   ├── geo/            # 地理编码适配器
│   │   ├── types.ts    # GeocodeProvider 接口
│   │   ├── amap-adapter.ts
│   │   ├── google-adapter.ts
│   │   ├── nominatim-adapter.ts
│   │   └── index.ts
│   ├── weather/        # 天气适配器
│   │   ├── types.ts    # WeatherProvider 接口
│   │   ├── qweather-adapter.ts
│   │   ├── amap-adapter.ts
│   │   ├── owm-adapter.ts
│   │   ├── mock-adapter.ts
│   │   └── index.ts
│   ├── free-sources/   # 免费数据源适配器
│   │   ├── types.ts    # FreeSourceAdapter 接口
│   │   ├── wikivoyage-adapter.ts
│   │   ├── opentripmap-adapter.ts
│   │   ├── qunar-adapter.ts
│   │   ├── wikipedia-adapter.ts
│   │   ├── fusion-engine.ts
│   │   └── index.ts
│   ├── xhs/            # 小红书适配器
│   │   ├── types.ts    # ProviderAdapter 接口
│   │   ├── adapters/   # 具体适配器实现
│   │   ├── router.ts   # 路由策略
│   │   └── utils.ts
│   └── ...
├── types/              # 类型定义
│   ├── trip.ts         # 旅行规划核心类型
│   └── index.ts        # 类型导出
└── index.ts            # 包入口
```

## 分层原则

- `agent/` 只做编排，不含业务逻辑
- `tools/` 定义 Agent 可调用的工具，使用 TypeBox schema
- `services/` 封装外部 API 调用，tools 层调用 services 层
- `types/` 纯类型定义，无运行时代码

## Adapter 模式

项目使用 Adapter 模式统一外部 API 调用：

- **GeocodeProvider**: 地理编码后端（高德/Google/Nominatim）
- **WeatherProvider**: 天气后端（和风/高德/OpenWeatherMap/Mock）
- **FreeSourceAdapter**: 免费数据源（Wikivoyage/OpenTripMap/去哪儿/Wikipedia）
- **ProviderAdapter**: 小红书 API 提供商（rnote/justoneapi/tikhub/crawler）

每个 adapter 实现统一接口，便于测试和扩展。
