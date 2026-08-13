# 实施计划

1. 统一浏览器天气工具的结构化返回、目标日期与 coverage 错误分支。
2. 新增天气匹配、风险分类、建议与 Windy URL 纯函数及单元测试。
3. 扩展最终 TripPlan 工具 schema、校验和 system prompt，确保天气事实不丢失。
4. 将天气/风险/雷达链接接入普通与动画路线面板渲染路径。
5. 增加 zh/en/ja 文案、路线面板样式和移动端/焦点行为。
6. 修正跨层天气 fixture 与断言，扩展聚焦 Playwright 用例。
7. 固化 Agent 的选项优先确认协议，并增加提示词单元测试。

## 聚焦验证

```bash
npx vitest run --project frontend-unit web/modules/__tests__/tools.test.js web/modules/__tests__/weather-planning.test.js web/modules/__tests__/i18n.test.js
npx playwright test web/__tests__/page-map.spec.ts web/__tests__/flows/cross-layer-integration.spec.ts --config playwright.config.ts
npm run typecheck
npm run lint
```

遵守仓库测试策略：先运行受影响的单测；失败后先读测试与实现、修复根因，再验证一次。同一失败命令不得无修改盲目重试超过两次。

## 风险文件

- `web/modules/ui/map.js` 同时有普通和动画渲染路径，必须保持 routePanelData 对称。
- `web/modules/tools/action-links.js` 的 schema 影响 LLM 最终工具调用。
- `web/modules/infra/i18n.js` 三语言键必须完全一致。
- `web/__tests__/flows/cross-layer-integration.spec.ts` 当前复制了旧契约，修复时必须验证生产路径而非继续复制条件。

## 完成前检查

- `git diff --check`
- 确认没有 Windy iframe、SDK、API key 或常驻天气工具按钮。
- 确认超范围和未知天气不生成低风险结论或雷达链接。
- 确认未提交、未推送、未部署。
