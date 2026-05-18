# Check 快速参考

> 超精简版检查清单。用于小改动或作为 check 代理的首要依据。
> 完整规范见 spec/backend/index.md。

---

## 每次 Check 必做

### 1. 变更规模判断

| 规模 | 条件 | Check 范围 |
|------|------|-----------|
| **微小** | < 30 行，单文件 | 只跑 lint + 测试，不读 spec |
| **中等** | 新功能 / 重构 < 3 文件 | 读本文件 + 相关 layer 的 index.md |
| **大型** | 跨层改动 / > 3 文件 | 读 check.jsonl 中列出的全部 spec |

### 2. 代码规范检查（TypeScript）

- [ ] 所有函数参数和返回值有类型标注
- [ ] 无 `any` 类型（除非显式声明注释说明原因）
- [ ] 工具定义使用 TypeBox schema
- [ ] 无未使用的 import
- [ ] 注释使用中文

### 3. 验证命令

```bash
# 按顺序执行
npx biome check --write .    # Lint + Format
npx tsc --noEmit              # 类型检查
npx vitest run                # 测试
```

### 4. 跨层一致性

- [ ] 修改了类型定义 → 检查引用该类型的所有文件
- [ ] 修改了工具参数 schema → 检查 execute 函数的参数解构
- [ ] 新增 Agent 工具 → 检查 tools/index.ts 的 createTools 导出
