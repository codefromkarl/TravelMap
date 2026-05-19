# 补充 Cloudflare Functions 后端测试

## 现状

- `web/functions/` 下 737 行代码零测试
- 覆盖认证、付费、chat 转发等核心路径
- 无测试意味着认证绕过、配额溢出等风险无保障

## 目标

为 Cloudflare Functions 核心路径建立测试覆盖。

## 任务

### 1. 测试基础设施

- [ ] 调研测试方案：Miniflare 2/3 vs vitest + mock env
- [ ] 配置测试环境（Wrangler env mock / Miniflare 实例）
- [ ] 创建 `web/__tests__/functions/` 测试目录

### 2. jwt.js — 签发/验证/过期

- [ ] JWT 签发测试（有效 payload）
- [ ] JWT 验证测试（有效 token 通过）
- [ ] JWT 过期测试（过期 token 拒绝）
- [ ] JWT 伪造测试（无效签名拒绝）

### 3. quota.js — 配额扣减/溢出

- [ ] 正常扣减测试
- [ ] 配额不足时拒绝
- [ ] 配额重置逻辑

### 4. chat.js — provider 路由/SSE 转发/认证守卫

- [ ] 认证守卫：无 token 拒绝
- [ ] provider 路由：正确转发到对应 provider
- [ ] SSE 转发：流式响应正确

### 5. auth/sso.js + auth/callback.js

- [ ] SSO 流程初始化
- [ ] OAuth callback 处理

## 不纳入范围

- 前端 UI 测试（已有 Playwright）
- 完整的端到端 OAuth 流程（需要真实 IdP）

## 验收标准

- [ ] web/functions/ 核心文件测试覆盖 ≥ 70%
- [ ] 所有测试通过
- [ ] lint + typecheck 通过
