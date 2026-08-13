## Bug Analysis: bundle 文本被部署扫描器误判为 secret/import

### 1. Root Cause Category

- **Category**: E - Implicit Assumption, with D - Test Coverage Gap
- **Specific Cause**: 初版扫描器假设形似 `clientSecret: "..."` 或 `import("...")` 的文本一定是运行时代码；真实 bundle 同时包含协议字段映射、JSDoc、URL、正则和模板文本。

### 2. Why Fixes Failed

1. 只放宽命名赋值：解决 `clientSecret: "client_secret"` 后，真实构建又暴露 JSDoc import 误判，范围不完整。
2. 从文件头实现轻量 JS 词法状态：复杂 bundle 正则/模板让状态漂移，仍在 `html_renderer` 处失败；自制完整 parser 会扩大安全代码面。
3. 最终采用局部可证明判断：块注释用最近边界，行注释只分析当前行并跳过引号；每个 allow 都配套一个仍应 reject 的对照测试。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Test Coverage | 用真实 `pi-bundle.js` 跑 builder + independent validator | DONE |
| P0 | Test Coverage | 每个 false-positive 允许规则必须带相邻 true-positive 拒绝回归 | DONE |
| P1 | Architecture | 保持显式 allowlist 与 manifest 完整性，不因误判绕过整个文件 | DONE |
| P1 | Documentation | 将局部例外写入 release code-spec | DONE |

### 4. Systematic Expansion

- **Similar Issues**: source-map 注释、HTML 属性、CSS `url()`、协议示例和错误消息都可能形似引用或凭据。
- **Design Improvement**: 组合显式复制 allowlist、确定性内容规则、引用闭包与 manifest hash，不能依赖单个正则宣称安全。
- **Process Improvement**: 安全扫描器必须用生产大小 bundle 验证，而不仅是手写微型 fixture。

### 5. Knowledge Capture

- [x] 新增 `.trellis/spec/backend/release-pipeline.md`
- [x] 更新部署指南和测试边界
- [x] 真实 bundle 与成对回归已进入 `deploy-artifact-safety.test.ts`
- [ ] Hosted CI、Cloudflare 部署和线上 smoke 需在获得推送/部署授权后验证
