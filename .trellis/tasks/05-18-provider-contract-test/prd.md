# Provider Contract Test — 消除复制粘贴测试

## 背景
xhs-service 的 4 个 provider 测试中，每个 provider 都有几乎相同的测试结构：
- "应正确调用 X API 并解析响应"
- "X API 失败时应返回空数组"

这是复制-粘贴测试，违反了 DRY 原则。新增第 5 个 provider 时，开发者会自然复制同样的模式。

## 目标
将 provider 的通用测试提炼为一个 **contract test 函数**，每个 provider 只需要提供 setup、mock 响应和期望结果，就能自动获得标准测试。

## 验收标准
- [ ] 新增 `testProviderAdapter()` contract test 函数
- [ ] Rnote / JustOneAPI / TikHub / Crawler 全部使用该 contract
- [ ] 删除重复的测试代码
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
