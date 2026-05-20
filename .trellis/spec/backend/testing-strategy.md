# Testing Strategy

> 测试分层策略、Mock 路由规则、新模块测试模板。

---

## Mock 路由规则

### 何时用什么 Mock

| 测试层 | Mock 方式 | 适用场景 |
|--------|----------|---------|
| **service 层单元测试** | MSW mock HTTP | 测试 service 的业务逻辑（降级、重试、融合），MSW 拦截 HTTP 请求 |
| **tool 层单元测试** | `vi.mock(service)` | tool 是格式化层，测试 tool 的输出格式、参数透传 |
| **tool 层深度测试** | MSW mock HTTP（不 mock service） | 当需要验证 tool→service→HTTP 完整链路时 |
| **integration 测试** | mock-llm + 真实工具 | 测试 Agent 编排链路，LLM 被 mock，工具真实执行 |
| **e2e 测试** | Playwright + 真实页面 | 浏览器端测试 UI 交互 |

### 决策树

```
测试需要调用外部 API 吗？
├─ 否 → 纯函数测试，无需 mock
└─ 是 → 
    测试的是 service 层逻辑吗？
    ├─ 是 → MSW mock HTTP（在 handlers.ts 或 handlers/ 中）
    └─ 否 → 
        测试的是 tool 层格式化吗？
        ├─ 是 → vi.mock(service) + fixtures 工厂数据
        └─ 否 → MSW mock HTTP（完整链路测试）
```

---

## 分层标准

### Unit（单元测试）

**位置**: `src/__tests__/unit/`
**原则**: 单模块 + MSW/vi.mock，不依赖 LLM

- `unit/services/` — service 层逻辑，**优先用 MSW**
- `unit/tools/` — tool execute + 参数验证，用 `vi.mock(service)` + fixtures
- `unit/agent/` — Agent 构造、prompt 内容、模型选择
- `unit/utils/` — 纯工具函数

### Integration（集成测试）

**位置**: `src/__tests__/integration/`
**原则**: 跨模块调用链，mock LLM + 真实工具执行

- agent-integration: Mock LLM + Agent 事件流
- orchestration-contract: 多步骤编排合约
- partial-edit-integration: 编辑链路端到端

### Quality（质量守卫）

**位置**: `src/__tests__/quality/`
**原则**: 元测试，确保测试体系不退化

### Evaluation（AI 评估）

**位置**: `src/__tests__/evaluation/`
**原则**: LLM-as-Judge，结构化断言

### E2E（端到端）

**位置**: `web/__tests__/`（Playwright）
**原则**: 真实浏览器 + 真实页面

---

## 前端测试规范

### 环境

- **Vitest + jsdom**（不依赖 Playwright，纯逻辑测试）
- 配置在 `vitest.config.ts` 的 `include` 中

### 基础设施

```
web/__tests__/
├── setup.js          # jsdom 全局 setup
└── helpers/
    ├── dom.js        # DOM fixture 工厂
    └── storage.js    # localStorage mock
```

### 测试模板

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLogger } from '../logger.js';

// localStorage mock（jsdom 环境需要）
beforeEach(() => {
  localStorage.clear();
});

describe('模块名', () => {
  it('应正常工作', () => {
    const result = fn(input);
    expect(result).toBe(expected);
  });
});
```

### 前端测试优先级

1. **纯逻辑模块**（无 DOM 依赖）→ 最高优先级
   - `trace.js`、`logger.js`、`perf-trace.js`、`config.js`、`i18n.js`
2. **DOM 交互模块**（有 DOM 但简单）→ 中等优先级
   - `auth.js`、`session.js`、`storage.js`
3. **UI 组件**（复杂 DOM/动画）→ 低优先级，用 Playwright E2E
   - `chat-init.js`、`map.js`、`waterfall.js`

---

## MSW Handler 管理

### 位置

- `src/__tests__/mocks/handlers/` — 按 domain 拆分
- `src/__tests__/mocks/handlers/index.ts` — barrel re-export

### 拆分规则

| 文件 | 覆盖的 API |
|------|-----------|
| `weather.ts` | OWM、和风天气、高德天气 |
| `attractions.ts` | Google Places、OpenTripMap、去哪儿 |
| `transport.ts` | 高德路线规划 |
| `restaurants.ts` | 高德周边搜索、Google Nearby |
| `xhs.ts` | Rnote、JustOneAPI、TikHub、Crawler |
| `geocode.ts` | Google Geocoding、Nominatim、高德 Geocode |
| `images.ts` | Unsplash、Pexels |
| `elevation.ts` | Open Topo Data |

### 新增 API 流程

1. 在对应 domain 文件中添加 handler
2. 如无对应 domain 文件，新建并加入 `index.ts`
3. 在 `quality-guard.test.ts` 中确认 API 被覆盖

---

## Fixtures 使用规范

### 工厂函数

所有 mock 数据必须通过 `src/__tests__/mocks/fixtures.ts` 中的 `createMock*` 工厂创建。

```ts
// ✅ 正确：用工厂 + overrides
const attraction = createMockAttraction({ nameZh: '故宫', ticketPrice: 60 });

// ❌ 错误：硬编码完整对象
const attraction = {
  nameZh: '故宫', nameEn: 'Forbidden City', name: '故宫',
  address: '北京市东城区', ...  // 20+ 字段
};
```

### Scenario 工厂

多步骤测试用 scenario 工厂：

```ts
const { request, attractions, weather, hotel } = createCityScenario('北京', 3);
const { request, scenarios } = createMultiCityScenario([
  { city: '北京', days: 3 },
  { city: '上海', days: 2 },
]);
```

---

## 新模块测试 Checklist

### 后端新 Service

- [ ] `src/__tests__/unit/services/<name>.test.ts` 创建
- [ ] 使用 MSW mock HTTP（`server.use()` 覆盖或默认 handler）
- [ ] 测试正常路径 + 降级路径 + 错误路径
- [ ] `mocks/fixtures.ts` 添加对应工厂函数（如需要）
- [ ] `mocks/handlers/` 添加 API handler（如需要）
- [ ] `quality-guard.test.ts` 不报新告警

### 后端新 Tool

- [ ] `src/__tests__/unit/tools/<name>.test.ts` 创建
- [ ] 用 `vi.mock(service)` + fixtures 工厂测试格式化逻辑
- [ ] 至少 1 个深度测试用 MSW 验证完整链路
- [ ] 测试参数校验、空结果、边界情况

### 前端新模块

- [ ] `web/modules/__tests__/<name>.test.js` 创建
- [ ] jsdom 环境下运行
- [ ] localStorage 操作有 beforeEach 清理
- [ ] 纯逻辑函数优先测试
