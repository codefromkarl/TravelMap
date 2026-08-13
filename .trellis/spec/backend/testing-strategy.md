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

### Coverage 与 E2E 的执行边界

- `npm run test:coverage` 只负责 Vitest unit、integration、quality 和普通 cross-layer 覆盖率；必须设置 `SKIP_PLAYWRIGHT=true`，避免在 Vitest worker 内再次启动 Playwright。
- `npm run test:e2e` 由独立 CI job 执行 Playwright，产出 HTML、JUnit、trace、截图与原始结果。
- 不可变制品 job 必须同时依赖 coverage job 与 E2E job 成功；跳过嵌套 Playwright 不能降低发布门禁。
- 开发者显式执行 `playwright-wrapper.test.ts` 且未设置 `SKIP_PLAYWRIGHT=true` 时，wrapper 行为保持可用，但它不属于 coverage 路径。

```json
{
  "scripts": {
    "test:coverage": "SKIP_PLAYWRIGHT=true vitest run --coverage",
    "test:e2e": "playwright test"
  }
}
```

错误模式是让 coverage 内嵌 Playwright，同时 CI 又单独跑 E2E；这会重复启动 web server、放大超时，并让 coverage 结果混入浏览器基础设施失败。

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

---

## Worker 数量限制规则（防 OOM）

### 背景

高核心数服务器（>8 核）上，测试框架默认使用大量 worker，可能导致 OOM：
- vitest `pool: "forks"` 默认 `maxForks = CPU - 1`（28 核 → 27 个 worker）
- Playwright 默认 `workers = CPU / 2`（28 核 → 14 个 worker）
- 每个 worker 占用 300-500MB（Node.js 运行时 + MSW + 被测代码）
- 27 个 worker × 400MB = 10.8 GB → 触发 OOM

### 规则

| 测试框架 | 配置项 | 推荐值 | 原因 |
|----------|--------|--------|------|
| vitest + forks | `poolOptions.forks.maxForks` | `4` | 平衡速度与内存 |
| vitest + threads | `poolOptions.threads.maxThreads` | `4` | 同上 |
| Playwright | `workers` | `CI ? 2 : 4` | CI 资源有限 |

### 配置模板

**vitest.config.ts**:
```typescript
import os from "node:os";

const MAX_WORKERS = process.env.CI
  ? 2
  : Math.min(4, os.cpus().length - 1);

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: MAX_WORKERS,
        minForks: 1,
      },
    },
  },
});
```

**playwright.config.ts**:
```typescript
export default defineConfig({
  workers: process.env.CI ? 2 : 4,
});
```

### 内存预估

| Worker 数量 | 预估内存 | 适用场景 |
|-------------|----------|----------|
| 1 | ~400 MB | AI E2E（串行） |
| 2 | ~800 MB | CI 环境 |
| 4 | ~1.6 GB | 本地开发（推荐） |
| 8 | ~3.2 GB | 大内存机器 |
| 14 | ~5.6 GB | ⚠️ 默认 Playwright |
| 27 | ~10.8 GB | ⚠️ 默认 vitest forks |

### 检查清单

- [ ] vitest.config.ts 有 `poolOptions.forks.maxForks` 限制
- [ ] playwright.config.ts 有 `workers` 限制
- [ ] CI 环境 worker 数量 ≤ 2
- [ ] 本地开发 worker 数量 ≤ 4

---

## 前端地理编码测试最佳实践

### 问题背景

前端 `map.js` 中的 `geocodeAttractions()` 函数负责自动补全缺失坐标的景点。由于该函数调用高德 API 且依赖浏览器环境，测试需要特殊处理。

### 测试分层

| 测试类型 | 文件 | 环境 | Mock 方式 |
|---------|------|------|----------|
| 单元测试 | `web/modules/__tests__/map-geocode.test.js` | jsdom | `vi.mock()` mock 依赖 |
| 集成测试 | `web/__tests__/flows/geocode-integration.spec.ts` | Playwright | 真实 API |
| E2E 测试 | `web/__tests__/flows/itinerary-map-linkage.spec.ts` | Playwright | 真实 API |

### 单元测试模板

```javascript
/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';

// Mock 依赖
vi.mock('../context.js', () => ({
  showToast: vi.fn(),
  getAmapGeoKey: vi.fn(() => 'test-key'),
  CITY_CENTERS: { '杭州': [30.2741, 120.1551] },
}));

// 测试用例
describe('geocodeAttractions', () => {
  it('有坐标的景点不触发补全', async () => {
    // ...
  });

  it('location: null 触发高德 API 补全', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: '1', geocodes: [{ location: '120.1484,30.2458' }] }),
    });
    // ...
  });

  it('高德 API 失败时 fallback 到 CITY_CENTERS', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    // ...
  });
});
```

### 关键测试场景

1. **正常路径**
   - 有坐标的景点不触发补全
   - `location: null` 触发高德 API 补全
   - `location: {0, 0}` 触发补全

2. **降级路径**
   - 高德 API 失败 → fallback 到 CITY_CENTERS
   - 无 API Key → 使用 CITY_CENTERS
   - 网络超时 → 使用 CITY_CENTERS

3. **边界情况**
   - 空行程返回 0
   - 无 days 字段返回 0
   - LRU 缓存命中不重复请求
   - 批量补全并发控制

### E2E 测试预期更新

当后端或前端逻辑变更时，E2E 测试预期需要同步更新。例如：
- 地理编码补全后，原本无坐标的景点会生成 marker
- marker 数量预期需要从 "无坐标=不渲染" 更新为 "补全后=渲染"

---

## E2E 行为测试规范（吸收自 visionresult）

### 核心原则

> **结构检查 ≠ 功能测试**
> 
> E2E 测试必须验证**用户行为**，不只是**元素存在**。
> 如果测试只检查 DOM 结构，功能完全不能用也会通过。

### 禁止模式 ❌

```typescript
// ❌ 只检查结构 — 功能不能用也会通过
test("页面有按钮", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#btn")).toBeAttached();
});

// ❌ 只检查可见性 — 不验证功能
test("地图可见", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
});
```

### 必须模式 ✅

```typescript
// ✅ 模拟用户操作 + 验证行为
test("点击示例卡片发送消息", async ({ page }) => {
  await page.goto("/");
  
  // 1. 模拟用户操作
  await page.locator(".prompt-card").first().click();
  
  // 2. 验证行为（API 调用、状态变化、内容渲染）
  await expect(page.locator("chat-message")).toBeVisible();
});

// ✅ 文件上传 + 结果验证
test("上传图片触发分析", async ({ page }) => {
  await page.goto("/");
  
  // 1. Mock API
  const requests = [];
  page.route("**/api/analyze", route => {
    requests.push(route.request());
    route.fulfill({ status: 200, body: '{"result":"ok"}' });
  });
  
  // 2. 模拟用户操作
  await page.locator("#upload").setInputFiles("test.jpg");
  
  // 3. 验证行为
  expect(requests.length).toBe(1);
  await expect(page.locator("#result")).toContainText("分析完成");
});
```

### E2E 测试关键字

**用户操作关键字**（必须有至少一个）:
- `click(` / `.click`
- `fill(`
- `type(`
- `press(`
- `check(`
- `select(`
- `hover(`
- `scroll(`
- `setInputFiles`

**行为断言关键字**（必须有至少一个）:
- `toContainText`
- `toHaveText`
- `toHaveValue`
- `toHaveAttribute`
- `toHaveCSS`
- `toBeChecked`
- `toBeDisabled`
- `toBeEnabled`
- `waitForSelector`
- `waitForResponse`
- `waitForRequest`

### 质量守卫

在 `src/__tests__/quality/quality-guard.test.ts` 中自动检查：
1. E2E 测试必须有用户操作模拟
2. E2E 测试必须有行为断言
3. 禁止只有结构检查

### E2E 测试模板

```typescript
test.describe("功能名称", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("用户操作应触发预期行为", async ({ page }) => {
    // 1. Mock API（如果需要）
    const requests = [];
    page.route("**/api/endpoint", route => {
      requests.push(route.request());
      route.fulfill({ status: 200, body: '{"result":"ok"}' });
    });

    // 2. 模拟用户操作
    await page.locator("#target").click();

    // 3. 验证行为
    expect(requests.length).toBe(1);
    await expect(page.locator("#result")).toContainText("预期内容");
  });

  test("失败路径应显示错误提示", async ({ page }) => {
    // 1. Mock API 返回错误
    page.route("**/api/endpoint", route => {
      route.fulfill({ status: 500, body: '{"error":"failed"}' });
    });

    // 2. 模拟用户操作
    await page.locator("#target").click();

    // 3. 验证错误处理
    await expect(page.locator(".error-toast")).toContainText("失败");
  });
});
```
