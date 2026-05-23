# 架构深化 #5: 前端 modules 按领域分组

## 优先级
⭐ — 低影响，低工作量

## 问题

`web/modules/` 的 18 个 JS 文件全部平铺在同一目录下，没有按领域分组：

```
modules/
  auth.js, chat-init.js, config.js, context.js, db.js,
  export.js, history.js, i18n.js, map.js, model-config.js,
  panels.js, prompt.js, session.js, share.js, storage.js,
  supply-cache.js, travelers.js, welcome.js
  tools/  ← 唯一的子目录分组
```

## 决定：延后执行

经分析，此任务涉及 40+ 个相对 import 路径更新（纯 JS 无类型保护），
回归风险高而收益仅为可读性。在以下条件满足时再执行：
- 前端迁移到 TS（类型检查保护）
- 或引入 build 工具自动解析路径别名

## 方案

按领域分组：

```
modules/
  auth/          ← auth.js
  trip/          ← chat-init.js, context.js, prompt.js, session.js, history.js,
                    supply-cache.js, travelers.js, export.js
  ui/            ← panels.js, welcome.js, map.js
  infra/         ← config.js, db.js, storage.js, model-config.js, i18n.js
  share/         ← share.js
  tools/         ← 保持不变
```

### 注意事项

- ES module 的 import 路径需要全部更新
- `entry.ts` 和其他入口文件的导入路径需同步修改
- 考虑用 codemod 或 IDE refactoring 辅助

## 涉及文件

- `web/modules/*` → 按领域移动
- `web/entry.ts` / `web/entry-core.ts` / `web/entry-pi-ai.ts` — 更新导入路径

## 收益

- 可读性提升 — 新开发者能快速定位模块所属领域
- 与 `tools/` 的分组策略对齐

## 验收标准

- [x] 文件按领域分入子目录
- [x] 所有 import 路径更新
- [x] 构建通过（`npm run build`）
- [x] 前端关键路径测试通过（地理编码单元测试 + desktop/mobile E2E）
