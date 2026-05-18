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
│   ├── xhs.ts          # 小红书服务
│   ├── map.ts          # 地图服务调度（Google/高德）
│   └── weather.ts      # 天气 API 服务
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
