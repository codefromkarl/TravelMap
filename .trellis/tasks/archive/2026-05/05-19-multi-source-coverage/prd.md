# 补齐 multi-source-service.ts 测试到 75%+

## 现状

- `multi-source-service.ts` 行覆盖 59.4%，是唯一下于 75% 阈值的核心 service
- 未覆盖部分主要集中在 `fetchGooglePlaces()`（Google Places API 调用路径）
- `deduplicate()` 中同名景点合并逻辑无覆盖
- `enrichWithUGC()` 中 `allReviews.length === 0` 的默认 local_knowledge 路径无覆盖

## 目标

将 `multi-source-service.ts` 行覆盖提升至 ≥ 75%，函数覆盖 ≥ 80%。

## 测试补全清单

### 1. Google Places 路径（主要缺口）

- [ ] 设置 GOOGLE_MAPS_API_KEY 时调用 Google Places API
- [ ] 验证返回 attractions 的结构（含 rating、types、editorial_summary 映射）
- [ ] Google Places 5xx 错误时降级到 mock
- [ ] Google Places ZERO_RESULTS 时降级到 mock
- [ ] Google Places 响应中不同类型映射到正确 category（museum/park/art_gallery 等）

### 2. deduplicate 合并逻辑

- [ ] 同名景点合并 sources 和 ugcReviews
- [ ] 合并后去重不丢失 UGC review

### 3. enrichWithUGC 边界路径

- [ ] `allReviews.length === 0` 时添加默认 local_knowledge

## 不纳入范围

- 小红书 API 路径（已有充分测试）
- 缓存路径（已有充分测试）

## 验收标准

- [ ] multi-source-service.ts 行覆盖 ≥ 75%
- [ ] multi-source-service.ts 函数覆盖 ≥ 80%
- [ ] 新增测试全部通过
- [ ] lint + typecheck 通过
