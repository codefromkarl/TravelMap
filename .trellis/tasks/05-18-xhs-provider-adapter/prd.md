# xhs-service 提取 provider adapter — 解耦实现细节

## 背景
`xhs-service.ts` 中直接实现了 4 个 provider（Rnote/JustOneAPI/TikHub/Crawler）的 fetch+parse 逻辑，且 `xhs-service.test.ts` 的 12 个测试直接验证这些实现细节（如 "Rnote API 失败时应返回空数组"）。

这导致：
- 新增 provider 时需要复制粘贴同样的测试结构
- provider API 格式变化时，xhs-service 测试也会崩溃
- 路由策略测试和 provider 实现测试混在一起

## 目标
1. 将 4 个 provider 提取为独立 adapter 模块（如 `src/services/xhs/adapters/rnote.ts`）
2. 每个 adapter 定义统一接口：`fetchXhsNotes(keyword: string, ctx: ProviderContext) => Promise<UGCReview[]>`
3. `xhs-service.test.ts` 只验证路由策略（priority/cost/all + 缓存），不验证 provider 解析细节
4. 新增 adapter 单元测试目录

## 验收标准
- [ ] 4 个 provider adapter 提取到独立文件
- [ ] xhs-service.ts 只保留路由策略和缓存逻辑
- [ ] xhs-service.test.ts 只测试路由策略（减少到 ~8 个测试）
- [ ] 新增 adapter 单元测试（每个 adapter 2-3 个测试）
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
