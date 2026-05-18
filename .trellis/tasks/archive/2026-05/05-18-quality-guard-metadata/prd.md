# Quality Guard 元数据扫描 — 声明式替代清单数组

## 背景
`quality-guard.test.ts` 维护三个中心清单数组：
- `SOURCE_FILES_REQUIRE_TEST` — 需要测试的源文件
- `EXPECTED_API_DOMAINS` — 需要 mock 的外部 API
- `EXPECTED_FIXTURE_TYPES` — 需要工厂函数的类型

每次新增 service/API/type，都需要修改这个文件。接口和实现几乎一样复杂，是浅层模块。

## 目标
将守卫规则转化为**可声明的元数据**：
1. 源文件顶部添加 `// @test-required` 注释标记
2. `quality-guard` 变为扫描器——读取源码中的标记，而不是维护中心列表
3. 减少新增文件时的心智负担

## 验收标准
- [ ] 所有 `SOURCE_FILES_REQUIRE_TEST` 中的文件添加 `@test-required` 标记
- [ ] quality-guard.test.ts 改为扫描式检查
- [ ] 删除 `SOURCE_FILES_REQUIRE_TEST` 硬编码数组
- [ ] 新增一个测试文件验证扫描逻辑正确
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
