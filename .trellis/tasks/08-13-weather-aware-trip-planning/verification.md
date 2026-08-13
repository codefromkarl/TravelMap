# 验证记录

验证日期：2026-08-13（Asia/Shanghai）

## 结论

浏览器天气链路已统一为 `search_weather -> details.weatherInfo[] -> TripPlan.weatherInfo[] -> route panel`。路线面板按日期和城市匹配天气，使用确定性风险规则生成行动建议，并且只在短期降水风险且存在有效坐标时生成内部构造的 Windy 雷达外链。

Agent 的方向确认协议也已固化为“推荐选项优先 + 自由输入兜底”：每轮只确认一个方向决策，提供 2-4 个编号选项，推荐项置顶，并保留“其他”自由输入。无法合理枚举的客观事实才直接询问。

移动端地图入口的重复故障已从 DOM 所有权层修复：用于显示隐藏地图的控件现在归属于稳定的 `#page-map`，不再被 `#map-right-area` 的 `display: none` 隐藏。

## 通过的验证

| 验证 | 结果 |
|---|---|
| 天气工具单元测试 | `web/modules/__tests__/tools.test.js`，42/42 通过 |
| 天气规划纯函数 | `web/modules/__tests__/weather-planning.test.js`，21/21 通过 |
| i18n | `web/modules/__tests__/i18n.test.js`，74/74 通过；zh/en/ja 天气键一致 |
| Agent 提示词 | `web/modules/__tests__/prompt.test.js`，18/18 通过 |
| 桌面天气路线面板 | Playwright focused，1/1 通过 |
| 移动端地图入口与天气路线面板 | 修复后 desktop + mobile focused，2/2 通过，0 失败 |
| JavaScript 语法 | `node --check web/modules/ui/map.js` 与 `node --check web/modules/trip/prompt.js` 通过 |
| 差异完整性 | 任务范围 `git diff --check` 通过 |

## 已验证的关键边界

- 多城市天气不会仅因日期相同而串用其他城市预报。
- 缺少可信天气状况时不会误判为低风险；只有明确数值阈值可提升为中高风险。
- 空值、超出供应商日期范围和未知天气码安全降级为 `unknown`，不伪造天气事实。
- 普通与动画地图渲染路径共用 `buildRoutePanelDayData()`。
- 动态天气、城市、建议和 URL 在 HTML 边界转义。
- 雷达链接包含 `target="_blank"` 和 `rel="noopener noreferrer"`，并阻止路线标题点击冒泡。
- 未引入 Windy iframe、SDK、API key、原生雷达瓦片或常驻天气按钮。

## 未验证边界

- Hosted CI、Cloudflare 部署和线上真实行程烟测需要在提交并推送后单独验证。
- Windy 外链的商业使用许可仍需产品上线方自行确认；代码只生成外链，不嵌入或抓取 Windy 数据。
- 本记录不把自动化通过等同于真实旅行建议的人工体验验收。

## 重复故障复盘

- 根因分类：Cross-Layer Contract，辅因是隐式 DOM 所有权假设和移动端 E2E 缺口。
- 两次仅修改按钮 CSS 的尝试都无法越过隐藏祖先的 `display: none`，因此属于表面修复。
- 持久预防规则已写入 `.trellis/spec/frontend/component-guidelines.md`：负责揭示可隐藏面板的控件必须属于共同且稳定可见的祖先；移动 E2E 同时验证 DOM 所有权、入口可见、状态类变化和目标行为。
