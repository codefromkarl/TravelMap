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
- [x] `npm run lint`：退出 0；机器工具目录已用 scanner force-ignore 排除，保留 53 个既有源码 warning 和 8 个 config info。
- [x] `npm run typecheck`。
- [x] unit/integration/coverage：145 files / 1802 tests passed，2 files / 40 tests skipped，阈值通过。
- [x] scoped Playwright Page Map desktop：12/12 passed。
- [x] 临时隔离 checkout 的 `npm ci` 与 typecheck。
- [x] trellis-check 子代理复核 diff、规范和验证证据。

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
