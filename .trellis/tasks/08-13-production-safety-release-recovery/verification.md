# 验证记录

验证日期：2026-08-13（Asia/Shanghai）

## 结论

发布恢复的本地契约已完成：依赖不再需要 `../pi`，Node 基线由 `.nvmrc` 统一，CI 是唯一验证/artifact producer，Deploy 只消费精确 `workflow_run` artifact，产物的 Functions/hash/allowlist/秘密扫描/引用闭包/manifest 校验全部 fail-closed。

第一次 Hosted deploy run `31693601165` 揭示了本地测试未覆盖的输出格式错误：Wrangler 4.122.0 的 deprecated `pages functions build --outfile` 写出 `_worker.bundle` multipart envelope，而 builder 把它命名为 `site/_worker.js`。`pages deploy` 因此在 `Content-Disposition: form-data; name="metadata"` 处把 multipart 当 JavaScript 解析并失败。修复改用 fresh temp `--outdir`，严格接受唯一 `index.js` 并复制为 `site/_worker.js`；builder/validator 都拒绝 multipart 标记。完整根因见 `research/wrangler-worker-output.md`。

`BASE_URL` 失败的根因是旧调用或 Vitest 传入文件系统路径，Playwright 将其直接用作导航基址。现在文件系统路径和 `file://` 会归一到 `http://127.0.0.1:3456/` 并启动本地 web server；显式 HTTP(S) 地址则不启动本地 server；其他无效值立即以 `[PLAYWRIGHT_BASE_URL_INVALID]` 失败。

## 通过的验证

| 验证 | 结果 |
|---|---|
| 全量 Vitest coverage | 145 files / 1802 tests 通过，2 files / 40 tests skipped，覆盖率阈值通过 |
| 最终发布/BASE_URL/workflow/artifact 与路径修复回归 | 既有证据：4 files，50/50 通过；本次 deploy fix 另有 1 file，36/36 通过 |
| `npm run typecheck` | 通过，0 个 TypeScript 错误 |
| `npm run lint` | 退出 0；`.claude` / `.agents` 机器工具树已用 Biome scanner force-ignore 排除，保留 53 个既有源码 warning 和 8 个 config info |
| shell/差异/禁止模式 | `bash -n`、本任务 `git diff --check` 通过；无 `../pi`、`link: true`、浮动 `npx wrangler` 或 `rsync web/` |
| 修复前真实 artifact build + independent validate | 曾通过 manifest 校验但 `_worker.js` 实为 multipart；该证据不能证明可部署，已由 run `31693601165` 推翻 |

## Deploy fix 最终验证

| 验证 | 结果 |
|---|---|
| `npx vitest run --project backend-unit src/__tests__/quality/deploy-artifact-safety.test.ts` | 1 file，36/36 通过；包含真实 Wrangler 4.122.0 构建、输出形状/清理与 multipart 回归 |
| `npm run typecheck` | 通过，0 个 TypeScript 错误 |
| builder/validator Node syntax | 两个 `.mjs` 均通过 `node --check` |
| 真实 `node scripts/build-deploy-artifact.mjs` | 通过；96 files；aggregate SHA-256 `412b5ffe975190db178ea69a0d97912036fca96d11435abb65b0eebe92ea89af` |
| 独立 `node scripts/validate-deploy-artifact.mjs` | 通过；同为 96 files、同一 aggregate SHA-256 |
| 最终 `site/_worker.js` | 46,326 bytes；`node --check` 通过；multipart boundary、`Content-Disposition: form-data`、`name="metadata"` 均不存在 |
| 最终 artifact 总大小 | 11,548,159 bytes |
| scoped `git diff --check` | 通过（见最终交付检查） |
| 无 sibling `../pi` 的 `/tmp` 隔离安装 | 正常 `npm ci` 安装 533 packages，typecheck 通过 |
| 隔离依赖身份 | core/ai/web-ui/tui 全部为 `0.75.3` |
| `BASE_URL="$PWD/web/" npm run test:e2e:pr` | Playwright desktop Page Map 12/12 通过，56.8s |
| Git 秘密路径合约 | `.dev.vars` / `web/.dev.vars` 未被跟踪，变体被 ignore，`.dev.vars.example` 被跟踪 |
| 部署源身份 | artifact 模式必须提供 40-64 位小写十六进制 SHA，Wrangler 必带 `--commit-hash` |

## 未通过或未执行的边界

- 未运行 full Playwright；按任务要求使用 PR-scoped desktop Page Map 证明 HTTP server/BASE_URL/reporter 契约。
- GitHub hosted CI 未触发；Actions 权限、Environments、required checks 与 secrets 配置仍待远程验证。
- Cloudflare preview/production 部署、exact-URL smoke 与 CDN 状态未在本子任务执行。
- 密钥轮换、供应商账单/调用审计、WAF/Access 配置不在仓库修改边界内，不得由本地 green 推导为已完成。

## 运行环境与备注

- workflow 使用 `node-version-file: .nvmrc`，文件值为 `22.19.0`。
- Wrangler 由 lockfile 精确固定为 `4.122.0`。本轮止血仍使用其内部 `pages functions build` 命令，但改用 `--outdir` 并增加严格输出守卫；迁移至受支持 build pipeline 需要独立后续任务。
- 特权 `workflow_run` 部署不再加载 `~/.bashrc`；未使用且弱于 canonical validator 的第二扫描脚本已删除。
- 隔离安装中 Husky 因临时 archive 没有 `.git` 输出 `.git can't be found`，但 `npm ci` 退出 0，随后typecheck 通过。
- 本验证没有读取或打印任何秘密值，没有提交、推送、远程部署或修改外部状态。
