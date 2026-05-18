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

---

## Required Patterns

- 新增外部 API 调用 → 必须有 fallback 降级逻辑
- 新增 Agent Tool → 必须定义 TypeBox schema + label + description
- 测试中 mock HTTP 使用 MSW (`server.use()`)，不用 `jest.fn()` 替换 fetch

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

---

## Code Review Checklist

- [ ] 新增代码有对应测试
- [ ] 测试覆盖正常路径 + 错误路径
- [ ] `npm run check` 全部通过
- [ ] 新增外部 API 的 mock handler 已添加到 `handlers.ts`
