# Wrangler Pages Functions 输出格式根因

调查日期：2026-08-13（Asia/Shanghai）

## 事故证据

- GitHub Actions deploy run `31693601165` 在 `wrangler pages deploy` 编译 `site/_worker.js` 时失败：`_worker.js:2:19 Expected ";" but found ":"`，对应文本为 `Content-Disposition: form-data; name="metadata"`。
- CI artifact 中的 `site/_worker.js` 以 `------formdata-undici-...` 开头；它不是 JavaScript，而是 Worker upload multipart envelope。
- 本地锁定的 Wrangler `4.122.0` 可稳定复现：`pages functions build --outfile=<path>` 写出 multipart；`--outdir=<fresh-dir>` 写出普通模块 `index.js`。

## 根因

`scripts/build-deploy-artifact.mjs` 把 `pages functions build --outfile` 的结果命名为 `site/_worker.js`。Wrangler 4.122.0 的 `--outfile` 分支调用 `createUploadWorkerBundleContents()`，把 `metadata` 与真实模块序列化成 `_worker.bundle` 格式；随后 `pages deploy` 依照 Advanced Mode 把名为 `_worker.js` 的文件当 Module Worker JavaScript 再次交给 bundler，multipart header 因而被当作 JavaScript 解析。

这不是远端随机破坏上传内容，而是本地构建阶段混淆了两个互斥格式：

- `_worker.js`：Module Worker JavaScript；
- `_worker.bundle`：包含 metadata 与模块的 multipart upload bundle。

官方证据：

- [Cloudflare issue #3065](https://github.com/cloudflare/workers-sdk/issues/3065) 记录了相同命令、multipart header 和 parser error。
- [Wrangler 4.122.0 build source](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.122.0/packages/wrangler/src/pages/build.ts) 显示 `--outfile` 已 deprecated，且 outfile 分支写入 `createUploadWorkerBundleContents()` 返回的 Blob。
- [Wrangler 4.122.0 bundle source](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.122.0/packages/wrangler/src/api/pages/create-worker-bundle-contents.ts) 明确生成 Worker upload FormData Blob。
- [Pages deployment API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/) 将 `_worker.js` 与 `_worker.bundle` 定义为互斥字段。
- [Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/) 要求输出目录中的 `_worker.js` 使用 Module Worker syntax。

## 本轮止血与长期边界

本轮改用 fresh temp `--outdir`，只接受唯一的普通、非 symlink、非空 `index.js`，验证其不含 multipart 标记后原样复制为 `site/_worker.js`，并保证临时目录在成功或失败后都清理。若 Wrangler 以后产生额外模块，构建必须失败，不能静默丢弃；届时应显式设计 `_worker.js/index.js` 多模块 artifact。

Cloudflare 维护者在 issue #3065 中说明 `pages functions build` 不应被视为长期稳定的 external production API。因此替换为受支持的 Pages Functions compiler/build pipeline 属于独立后续任务，不在本次最小恢复中完成。

## Post-deploy smoke follow-up

Hosted deploy run `31695172551` 已成功创建部署，但上传完成后立即执行的 smoke 对页面与 Functions 全部得到 404。约 30 秒后重新观察，canonical `/` 已为 200，chat/auth OPTIONS 已为 204；与此同时 `/index.html` 稳定返回 308 并重定向到 `/`。这将失败拆成两个明确契约问题：Pages 的 canonical 文档路径是 `/`，且新部署 URL 存在短暂传播窗口。

本轮最小修复让 index 获取与响应时间探测都使用 exact deployment URL 的 `/`。页面、引用资产与 chat/auth preflight 仅在 HTTP 404 或 5xx 时按有界策略重试；默认 7 次、间隔 5 秒，覆盖从 0 到 30 秒的观察窗口。测试通过 `HEALTH_CHECK_MAX_ATTEMPTS=1`、`HEALTH_CHECK_RETRY_DELAY_SECONDS=0` 保持确定且快速，并用 2/0 证明短暂 404 可恢复。持续 404/5xx 在耗尽边界后仍返回非零，输出保留最终 HTTP 状态和尝试次数，不能把 API 故障误判为健康。
