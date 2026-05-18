# Quality Guidelines

> Code quality standards for TravelAgent backend development.

---

## Overview

- Linter: Biome (`npm run lint`)
- Formatter: Biome (`npm run format`)
- Type check: TypeScript strict (`npm run typecheck`)
- Test: Vitest (`npm test`)
- All checks: `npm run check`

---

## Forbidden Patterns

- 不允许在测试中调用真实 LLM API（集成测试和评估层除外，需显式标注）
- 不允许在非测试文件中导入 `__tests__/` 下的任何模块
- 服务层不允许直接 `fetch` 不经过 try-catch 包装
- ❌ **禁止仅 `.not.toThrow()` 作为测试的唯一断言** — 必须有值验证断言
- ❌ **禁止为 try-catch 不写错误路径测试** — catch 分支必须有对应用例

---

## Required Patterns

- 新增外部 API 调用 → 必须有 fallback 降级逻辑
- 新增 Agent Tool → 必须定义 TypeBox schema + label + description
- 测试中 mock HTTP 使用 MSW (`server.use()`)，不用 `jest.fn()` 替换 fetch
- ✅ **双重验证模式** — 测试降级路径时，同时验证：
  - 降级后返回的数据格式正确
  - 降级前确实尝试了真实调用（通过 spy fetch 或检查 source 字段）

---

## Testing Requirements

### 框架

- **Vitest 3.x** + **MSW 2.x** + **@vitest/coverage-v8**
- 配置文件: `vitest.config.ts`
- 全局 setup: `src/__tests__/setup.ts`（MSW 生命周期）

### 目录约定

```
src/__tests__/
├── mocks/          # 共享 mock 资源
│   ├── handlers.ts # HTTP mock handlers（新增 API 必须在此补充）
│   ├── fixtures.ts # 测试数据工厂（新增类型必须在此补充工厂函数）
│   └── mock-llm.ts # LLM mock 工具
├── unit/           # 单元测试（不依赖 LLM，不依赖外部 API）
├── integration/    # 集成测试（mock LLM + 真实工具执行）
└── evaluation/     # AI 评估（结构化断言 + LLM-as-Judge）
```

### 编写规则

- 测试文件与源文件同名 + `.test.ts` 后缀，放在对应层级的目录中
- 新增 service/tool → 必须同步添加单元测试
- `mocks/fixtures.ts` 中维护测试数据工厂，禁止在测试文件中硬编码 mock 数据
- **每个测试必须有实质性值断言** — 禁止仅 `.not.toThrow()` 作为唯一断言
- **每个 try-catch 的错误路径必须有对应用例** — 用 `mockRejectedValue` 或 `server.use()` 模拟异常

### 测试反模式禁止清单

| 反模式 | 禁止理由 | 替代方案 |
|--------|----------|----------|
| 仅 `.not.toThrow()` | 不验证结果正确性，实现可随意变 | 补具体值断言 |
| catch 块无错误路径测试 | 真实路径退化时无感知 | 模拟异常 + 验证降级 |
| 测试无 `expect` | 根本不算测试 | 删除或用 `it.skip` |
| mock 数据硬编码在测试中 | 变更时成本高 | 用 `fixtures.ts` 工厂 |

---

## Code Review Checklist

- [ ] 新增代码有对应测试
- [ ] 测试覆盖正常路径 + 错误路径
- [ ] 每个 `catch` 块都有对应用例
- [ ] 测试断言有实质性值验证（非仅 `.not.toThrow()`）
- [ ] `npm run check` 全部通过
- [ ] 新增外部 API 的 mock handler 已添加到 `handlers.ts`
