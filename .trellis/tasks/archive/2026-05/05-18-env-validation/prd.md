# 添加启动时环境变量验证 + 降级提示

## 现状

- 15+ 环境变量（GOOGLE_MAPS_API_KEY, AMAP_WEB_KEY, OPENWEATHER_API_KEY, XHS_API_TOKEN 等）无启动验证
- 缺少 key 时服务静默降级到 mock，用户无法区分真实数据和 mock 数据
- config.ts 仅读取环境变量，无校验逻辑

## 目标

启动时明确验证关键环境变量，缺失时给出清晰的降级提示。

## 任务

### 1. config.ts 添加 validateConfig()

- [ ] 定义关键环境变量清单（影响真实 API 调用的 key）
- [ ] `validateConfig()` 检查每个 key 是否存在且非空
- [ ] 返回验证结果：哪些服务可用、哪些降级到 mock

### 2. 启动时降级提示

- [ ] TravelAgent 构造函数调用 `validateConfig()`
- [ ] 缺少关键 key 时 `console.warn` 输出明确提示：
  ```
  [TravelAgent] 以下 API Key 未配置，将使用 mock 数据：
    - GOOGLE_MAPS_API_KEY（餐厅/景点搜索降级）
    - XHS_API_TOKEN（UGC 评价降级）
  ```

### 3. API 响应中携带数据来源标记

- [ ] 所有 service 返回的数据结构已包含 `source` 字段（"real"/"mock"/"cached"）
- [ ] 确保 tool execute 结果中的 `details.source` 正确标识

## 验收标准

- [ ] 无 API Key 时启动，控制台有明确 warn 提示
- [ ] 有 API Key 时启动，控制台无 warn（或显示服务已启用）
- [ ] `npm run test:unit` 通过
- [ ] lint + typecheck 通过
