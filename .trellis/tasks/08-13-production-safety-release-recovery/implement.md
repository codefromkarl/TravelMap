# 实施清单

## 0. 基线与研究

- [x] 保存 git 状态和现有失败边界，不触碰既有 weather task。
- [x] 子代理 A 确认 pi registry/Git 固定依赖可行性与 Node 约束。
- [x] 子代理 B 审计 deploy staging、秘密文件暴露和 fail-open 路径。
- [x] 子代理 C 审计 CI/Deploy DAG、Playwright artifacts、AI eval gate。
- [x] 将结论写入 `research/`，主代理合并为最终实施决策。

## 1. 安全止血

- [x] 工作树删除 `.dev.vars` 并补忽略/示例（解除 Git 跟踪需后续获准提交）。
- [x] 实现 allowlisted artifact builder 和秘密扫描测试。
- [x] 让 Functions、hash、安全校验全部 fail-closed。

## 2. 可复现依赖

- [x] 替换 sibling `file:` 依赖并更新 lockfile。
- [x] 统一 Node engines/version/workflows。
- [x] 在无 sibling pi 的隔离安装中验证。

## 3. CI/Deploy 收敛

- [x] 重构 CI DAG 与 secret-aware AI eval gate。
- [x] 配置 HTML/JUnit/list Playwright reporters 与完整 artifacts。
- [x] 将 deploy 变成 artifact consumer；preview 使用 PR 隔离标识。
- [x] 增加 workflow/artifact contract 测试。

## 4. 验证

- [x] 运行直接相关的测试/脚本。
- [x] `npm run lint`：退出 0；保留 77 个既有 broken-symlink warning（本轮未重跑全量 lint）。
- [x] `npm run typecheck`。
- [x] unit/integration/coverage：145 files / 1802 tests passed，2 files / 40 tests skipped，阈值通过。
- [x] scoped Playwright Page Map desktop：12/12 passed。
- [x] 临时隔离 checkout 的 `npm ci` 与 typecheck。
- [x] 按用户要求分派独立子代理执行 trellis-check，复核 diff、规范和验证证据。
- [x] 单次运行完整 Playwright：380 tests，288 passed / 92 failed / 0 skipped；失败已按 UI/DOM 契约、onboarding 前置、mobile map、a11y、local config、`_agent.run` 运行时缺陷和测试 typo 分类，未盲目重跑。

## Trellis-check 终检补充（2026-08-13）

- 修复 post-deploy smoke 假绿：现在解析并请求 `index.html` 实际引用的内容寻址 JS/CSS，chat/auth OPTIONS 非 200/204、资源缺失或 index 响应达到 3 秒均返回非零。
- 将已验证 source SHA 传给 Wrangler `--commit-hash`；artifact 模式缺失/非法 SHA 时在调用 Wrangler 前失败。
- 新增 Git 索引守卫，拒绝跟踪除显式 `.dev.vars.example` 外的任意 `.dev.vars*`，并验证根目录与 `web/` 变体持续被 ignore。
- 新增 `health-check-contract.test.ts`；最终当前态窄验证为 artifact/health 2 files / 30 tests passed，Biome scoped check、Bash syntax、workflow YAML parse、typecheck 与 `git diff --check` 通过。
- 既有证据继续单独记录：隔离无 `../pi` 的 `npm ci` + typecheck、真实 builder/validator 96 files 同 SHA、Page Map 12/12、coverage 145 files / 1802 passed（2 files / 40 skipped，阈值通过）。本轮未重跑这些全量证据。
- Hosted CI、preview/production deploy、密钥轮换、CDN/账单审计仍未执行，不能并入 local green。
- 主代理在最终当前态独立复核：artifact、health、workflow 与 coverage 合同共 4 files / 45 tests passed；Bash syntax、typecheck 和 `git diff --check` 通过。
- 完整 E2E 运行期间 weather/guest 并行 WIP 持续改变共享工作树，因此 288/92 是被测快照证据，不是当前 dirty combined tree 的原子结论。

## 5. 续作：浏览器发布门禁最小恢复

- [x] 修复 `_agent.run` 重试 API 合同并增加回归测试。
- [x] 修复 `mododalClosed` 测试 typo，治理可选 `config.local.js` 控制台噪声。
- [x] 统一游客/onboarding 与 mobile map/chat 的 E2E 前置，不降低产品断言。
- [ ] 分别运行六个受影响 spec；记录通过、失败和根因，不盲目重跑。
- [x] 运行前端单元测试、typecheck、scoped lint 探测，并分派独立 trellis-check；Biome 明确因 `web/` ignore 未处理文件，未伪报 lint green。

### 续作验证快照（2026-08-13）

- `chat-init.test.js`：独立复核发现 `prompt()` 会重复追加原 user；现已按 Pi 0.75.3 公开合同改为删除失败 assistant 后调用 `Agent.continue()`。Vitest 1 file / 5 tests passed，并模拟续跑状态变化断言最终 transcript 只有一条原 user；认证失败不修改消息或发请求。
- `welcome.test.js`：Vitest 1 file / 5 tests passed；活动快捷提示只保留 `map.js` 单一监听入口。
- 共享 Playwright fixture 明确提供空 `config.local.js`、返回用户 onboarding 状态、分层应用 readiness，并通过真实移动端按钮进入地图视图。
- fixture 首轮限定验证：4 specs 中 9 个命名测试 × desktop/mobile，18 total / 16 passed / 2 failed；两项 desktop 初始化时序在分析后改为等待 Agent ready。
- interaction 定向复验：路线面板与最小化 × desktop/mobile，4/4 passed。
- accessibility 合并态复验：6 total / 4 passed / 2 skipped；跳过原因是活动 DOM 没有可见 `disabled-ghost`，无遮挡与 44×44 在 desktop/mobile 均通过。
- Page Map desktop 合并态：首轮 11/12 passed；新增 Discover 改变 `.quick-prompt:first` 后，旧测试选择器失败。分析后改为显式选择 `.quick-prompt[data-prompt]`，仅复验失败项 1/1 passed；未把两个运行合并伪报为单次 12/12。
- Discover 成功路径新增定位缓存 → `buildDiscoverPrompt` → `sendMessage` exactly-once 回归，desktop 1/1 passed。
- 独立复核发现新暴露的 Travelers 保存路径调用未定义 `setActivePanel`；现统一走 `window._panels.closePanel()`，并将 interaction 测试改为真实打开、填写、保存、持久化和关闭闭环，desktop/mobile 2/2 passed。
- 唯一活动 `h1` Playwright desktop：1/1 passed；`npm run typecheck` passed；`git diff --check` 与 Trellis context validate passed。
- Biome scoped check 处理 0 files 并退出 1，因为当前 `biome.json` 忽略全部 `web/` 路径；不能把它记为 scoped lint green。
- 六个完整受影响 spec 尚未全部分别运行，本轮不据此宣称 Full E2E green。
- 独立 trellis-check 首次识别出 retry transcript 重复和 Travelers 保存 `ReferenceError` 两个 major；修复后快速复核确认三处（含 Discover exactly-once）均无新的 blocking/major，仅余测试 mock 清理小项。

## 5. Deploy run 31693601165 恢复

- [x] 复现并确认 `pages functions build --outfile=site/_worker.js` 把 `_worker.bundle` multipart envelope 误命名为 JavaScript。
- [x] 改用 fresh temp `--outdir`，只接受唯一、普通、非 symlink、非空的 `index.js`，复制为 `site/_worker.js` 后清理临时目录。
- [x] builder 与 independent validator 拒绝 multipart boundary、`Content-Disposition: form-data` 和 `name="metadata"`。
- [x] 增加缺失/空文件/symlink/额外模块/临时目录清理/multipart/真实 Wrangler JavaScript 回归。
- [x] 运行最终 focused tests、真实 artifact build/validate 与 diff check，并把精确结果写入 `verification.md`。
- [ ] 后续独立任务：迁移离开 Cloudflare 标记为内部接口的 `pages functions build`；本轮不扩大到 compiler 迁移。

## 6. Deploy run 31695172551 smoke 恢复

- [x] 确认部署创建成功后的即时 smoke 全为 404，而约 30 秒后 canonical `/` 为 200、API OPTIONS 为 204；`/index.html` 稳定 308 到 `/`。
- [x] index 获取与测速统一使用 exact deployment URL 的 canonical `/`。
- [x] 对 404/5xx 增加默认 7 次、间隔 5 秒的有界传播重试，并允许测试以环境变量降为 1/0；非健康 API 最终仍阻断。
- [x] 增加 canonical root、短暂 root 404 后恢复、持续 chat 404/auth 503 失败及最终诊断回归。
- [x] 运行 focused test、shell 静态检查和 scoped diff check，并把结果写入 `verification.md`。

## 风险文件

- `.dev.vars`, `.gitignore`, `package.json`, `package-lock.json`
- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- `scripts/deploy.sh`, 新增 artifact builder/validator
- `playwright.config.ts`, 相关 workflow contract tests

## 验证命令候选

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit -- <scoped-test>
npx playwright test web/__tests__/page-map.spec.ts --project=desktop
node scripts/build-deploy-artifact.mjs <temporary-output>
node scripts/validate-deploy-artifact.mjs <temporary-output>
```

禁止对同一失败命令无代码改动连续重跑超过两次；失败后必须先读测试与实现并定位根因。
