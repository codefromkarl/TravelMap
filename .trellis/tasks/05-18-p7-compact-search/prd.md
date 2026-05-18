# P7-b: 搜索结果紧凑化

## 目标
将 `formatSearchResultsForAgent` 的输出从 verbose markdown 改为紧凑格式，减少 input tokens。

## 当前问题

每个景点输出 ~100 字符的 markdown：

```markdown
- **景点一** (Attraction1) — 博物馆
  📍 地址 | 🎫 ¥50 | ⏱ 120分钟
```

10 个景点 = 1,000 字符 ≈ 250 tokens。

## 优化方案

### 紧凑 JSON 格式

```json
{"city":"北京","days":3,"attractions":[
  {"n":"故宫","c":"博物馆","p":50,"d":120,"r":true},
  {"n":"长城","c":"古迹","p":40,"d":180}
],"weather":[
  {"dt":"07-01","dw":"晴","dT":30,"nT":22},
  {"dt":"07-02","dw":"多云","dT":28,"nT":20}
]}
```

同样信息量，字符数从 1,000 → 300，**省 ~70%**。

## 具体改动

1. **修改 `src/services/search-orchestrator.ts`**
   - `formatSearchResultsCompact(bundle)` — 紧凑格式
   - 保留 `formatSearchResultsForAgent` 作为可选（调试/可读性）

2. **修改 `injectSearchResults`**
   - 默认使用紧凑格式
   - 支持 `format: "compact" | "readable"` 选项

## 验收标准
- [ ] 紧凑格式输出正确且信息完整
- [ ] 字符数比 markdown 格式减少 ≥ 50%
- [ ] 保留 readable 格式选项（向后兼容）
- [ ] `npm run check` 全部通过
