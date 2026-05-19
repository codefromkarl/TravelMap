# MVP 质量关卡：测试补全 + CI 自动化 + 工程化加固

## 背景

项目已具备完整的 agent 编排 + Web 前端 + Cloudflare 部署能力，432 测试全通过，service 层覆盖率 90%+。
但系统性分析发现三大缺口：
1. **核心编排器 travel-agent.ts 覆盖率仅 28.7%** — 主流程、偏好挖掘、steering 微调未测试
2. **Web Functions 605 行零测试** — 认证/JWT/配额/API 代理无覆盖
3. **无 CI 管道** — 质量仅靠 pre-commit hook，跳过后无防护

## 目标

使项目达到 MVP 上线标准：
- 核心代码行覆盖 ≥ 75%
- 所有质量检查自动化（CI）
- Web 后端关键路径有测试
- E2E 可在 CI 环境运行

## 子任务 & 优先级

| # | 子任务 | 优先级 | 预估 | 依赖 |
|---|--------|--------|------|------|
| 1 | test-travel-agent: 补全核心编排器测试到 70%+ | P0 | 4-6h | 无 |
| 2 | ci-github-actions: 搭建 GitHub Actions CI | P0 | 2h | 无 |
| 3 | test-web-functions: Cloudflare Functions 测试 | P1 | 3-4h | 无 |
| 4 | e2e-portability: 修复 Playwright 可移植性 | P1 | 1-2h | #2 |
| 5 | coverage-thresholds: 提升阈值 + 补全低覆盖模块 | P1 | 3h | #1 |
| 6 | env-validation: 启动时环境变量验证 | P1 | 1-2h | 无 |
| 7 | test-perf-fake-timers: 消除测试中的真实等待 | P2 | 1-2h | 无 |

## 建议执行顺序

```
Phase A (并行): test-travel-agent + ci-github-actions + env-validation
Phase B (串行): e2e-portability (依赖 CI)
Phase C (并行): test-web-functions + coverage-thresholds + test-perf-fake-timers
```

## 验收标准

- [ ] `npm run test:coverage` 行覆盖 ≥ 75%，函数 ≥ 70%，分支 ≥ 65%
- [ ] travel-agent.ts 行覆盖 ≥ 70%
- [ ] web/functions/ 关键路径有单元测试
- [ ] GitHub Actions CI green (lint + typecheck + test + coverage threshold)
- [ ] E2E 可在 CI 运行（至少 page-load.spec.ts）
- [ ] 缺少关键环境变量时启动有明确 warning

## 不在范围内

- Hotels API 接入（Phase 2 功能）
- 结构化日志框架引入
- 监控/错误追踪集成 (Sentry etc.)
- 数据库 / 用户行程持久化
