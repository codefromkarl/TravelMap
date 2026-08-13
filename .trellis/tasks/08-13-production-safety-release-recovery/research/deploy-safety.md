# 部署产物安全审计与最小实施设计

## 审计边界

- 审计时间：2026-08-13（Asia/Shanghai）。
- 基线提交：`e68f13615c988570a378e2376473fabc2cb95ddc`。
- 本文只审计 Git 元数据、文件路径、部署/构建实现、无秘密的源码引用、Cloudflare 官方文档，以及公开站点的**非敏感路径** HTTP 状态。
- 未打开、打印、比较或请求 `.dev.vars*` 的内容；没有请求线上 `.dev.vars*`、`.env*` 或 `config.local.js` 路径。本文只记录秘密文件路径，以及从普通源码中可见的变量名。
- 未触发部署、远程 workflow、CDN purge 或 Cloudflare API 写操作。Functions/hash 的实测只在 `/tmp` 隔离目录生成临时文件。
- 审计期间另一个并行任务开始修改 `web/functions/_lib/jwt.js`、`web/functions/_lib/quota.js`、`web/functions/api/chat.js`；本文未修改或覆盖这些文件。Functions 构建成功的实测对应审计早期快照，后续实现者必须针对合并后的最终 Functions 源码重新验证。
- 文档写入后的共享工作树校验又发现 `.gitignore`、`scripts/deploy.sh` 出现并行修改；这些不是本审计 worker 产生的。本文的脚本行号、dry-run 和风险结论均以顶部所列基线 tree/审计快照为准，不能当作对该并行 WIP 的复核。

## 结论摘要

当前部署链不是“排除少数敏感文件”，而是“复制整个 `web/` 后仅删除两个已知名字”。这使任何未知顶层文件、测试、开发服务器、TypeScript 源码和秘密 dotfile 自动进入 Cloudflare Pages staging。风险已经不是理论上的：

1. `.dev.vars` 和 `web/.dev.vars` 都被 Git 跟踪，且现有 ignore 规则均不覆盖它们。
2. `scripts/deploy.sh:43` 的 `rsync -a web/ ...` 会复制 dotfile，因此 `web/.dev.vars` 会进入 staging；当前排除列表只包含 `config.local.example.js` 和 `_headers.bak`。
3. `web/config.local.js` 虽被 Git 忽略，但如果开发者按示例创建该文件，现有脚本仍会部署它；部署指南所称“排除 `config.local.js`”与脚本不一致。
4. Functions 构建失败会被吞掉，hash 失败也会被吞掉；随后 Wrangler 仍部署不完整 artifact。
5. 仓库未锁定 Wrangler。Functions 构建在解析本地/全局/npx Wrangler **之前**直接调用全局 `wrangler`；GitHub hosted runner 很可能走“command not found → 警告 → 继续”，而实际 deploy 再由浮动的 `npx wrangler` 执行。
6. 生产 Pages 当前对非敏感路径 `/entry.ts`、`/local-dev-server.cjs`、`/__tests__/page-load.spec.ts` 返回 HTTP 200，证实宽泛 staging 已把开发/测试源码发布出去。没有探测任何可能含秘密的 URL。

因此最小修复必须同时完成三个边界：Git 止血、allowlisted builder、deploy consumer 重新校验。只给 `rsync` 再加几个 `--exclude` 不能满足“未知文件不自动进入生产”的验收条件。

## 证据

### 1. `.dev.vars` 跟踪与 ignore 状态

只执行了路径/索引级命令：

```bash
git ls-files --stage -- .dev.vars web/.dev.vars
git check-ignore -v --no-index .dev.vars web/.dev.vars .dev.vars.local web/.dev.vars.local
```

结果：

- Git 索引同时包含 `.dev.vars` 与 `web/.dev.vars`。
- `git check-ignore` 对上述路径和环境变体无匹配输出。
- `.gitignore:4-6` 只覆盖 `.env`、`.env.local`、`web/config.local.js`，没有 `.dev.vars*` 规则。
- Git 历史显示相关秘密文件至少自 `c946ab0` 已进入历史；从当前 tree 删除不能撤销历史暴露，也不能替代供应商密钥轮换。

精确建议：

- 从当前索引和工作树移除 **两个**已跟踪文件：`.dev.vars`、`web/.dev.vars`。不要只处理 PRD 中提到的根文件。
- `.gitignore` 增加任意目录生效的规则，并显式保留无值样例：

  ```gitignore
  .dev.vars
  .dev.vars.*
  !.dev.vars.example
  ```

- 新增根级 `.dev.vars.example`，只列变量名与空占位/说明，不复制任何现值。当前 Functions 普通源码中可见的候选变量名包括：`AMAP_GEO_KEY`、`AMAP_WEB_KEY`、`CHAT_RATE_LIMITER`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`JWT_SECRET`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_PROVIDER`、`RATE_LIMIT_KV`。并行安全代理任务还可能引入 provider 专用变量；样例应以最终合并源码复核。
- 增加仓库测试，断言 `git ls-files` 中不存在 `(^|/)\.dev\.vars(?:\..*)?$`，避免“已 ignore 但仍 tracked”的假安全。
- 代码止血完成后仍需把密钥轮换、账单/调用审计、Cloudflare 缓存处理列为独立运营状态；本轮本地修改无法证明这些动作完成。

### 2. `web/` 顶层与实际 staging

审计快照共有 21 个顶层文件、4 个顶层目录；`web/` 下 155 个文件全部被 Git 跟踪，总计约 20.7 MB，其中 56 个测试文件。顶层如下：

```text
.dev.vars
__tests__/
_headers
config.local.example.js
entry-core.ts
entry-pi-ai.ts
entry.ts
favicon.svg
functions/
help.html
index.html
llms.txt
local-dev-server.cjs
modules/
node-empty.js
og-image.svg
pi-ai.bundle.js
pi-bundle.js
pi-core.bundle.js
pi-web-ui.css
privacy.html
robots.txt
sitemap.xml
styles/
terms.html
```

用与脚本相同的 `rsync -ani --exclude=node_modules web/ <tmp>/` 做 dry-run，路径列表明确包含：

- `.dev.vars`
- `__tests__/`
- `functions/`
- `modules/__tests__/`
- `config.local.example.js`
- `entry.ts`、`entry-core.ts`、`entry-pi-ai.ts`
- `local-dev-server.cjs`

`scripts/deploy.sh:29-50` 之后只删除 `config.local.example.js` 与 `_headers.bak`。特别注意：

- `rsync` 的源路径是 `web/`，所以根 `.dev.vars` 不经这条路径部署，但 `web/.dev.vars` 会部署。
- `web/config.local.js` 当前 checkout 不存在；它被 `.gitignore:6` 忽略，但 `rsync` 不读取 Git ignore，因此一旦本地存在就会进入 staging。
- `web/modules/infra/config.js:18-24` 会动态导入 `web/config.local.js`，说明开发者确有按示例创建它的正常路径。
- `web/pi-ai.bundle.js`、`web/pi-core.bundle.js`、`web/node-empty.js` 当前没有运行时引用；`web/index.html:55-58` 使用的是 `pi-bundle.js`，`web/index.html:65` 使用 `pi-web-ui.css`。分离 bundle 是历史遗留产物，不应继续无条件部署。

公开环境只做了无正文、非敏感路径检查：

| 基址 | 路径 | 状态 | Content-Type | 结论 |
|---|---|---:|---|---|
| `travel-agent-ebl.pages.dev` | `/robots.txt` | 200 | `text/plain` | 正常静态资产 |
| 同上 | `/entry.ts` | 200 | `video/mp2t` | TypeScript 源码已发布 |
| 同上 | `/local-dev-server.cjs` | 200 | `application/node` | 本地开发服务器源码已发布 |
| 同上 | `/__tests__/page-load.spec.ts` | 200 | `video/mp2t` | 测试源码已发布 |
| `travel.codefromkarl.xyz` | 同上四个路径 | 200 | 同类 | 自定义域也复现 |

`/functions/api/chat.js` 返回 200 但 Content-Type 是 `text/html`，更像路由 fallback，不能据此断言 Function 源文件直接可下载。未进一步读取正文。

### 3. Functions 构建与 Wrangler 选择

`scripts/deploy.sh:52-61`：

- 直接运行 `wrangler pages functions build web/functions --outdir=<tmp>`。
- 构建成功才复制 `index.js` 为 staging 的 `_worker.js`。
- 构建失败仅打印警告，脚本继续部署，导致 API/Auth 可整体消失而静态页面仍上线。

`scripts/deploy.sh:67-75` 在 Functions 构建之后才选择 Wrangler：本地 `node_modules/.bin/wrangler` → 全局 Wrangler → `npx wrangler`。当前证据：

- 仓库 `devDependencies` 和 lockfile 没有 Wrangler；`npm ls wrangler --depth=0` 为空。
- 审计机有全局 Wrangler `4.101.0`；GitHub runner 不应依赖这项机器状态。
- 在 `/tmp` 隔离输出中，早期 Functions 快照用全局 Wrangler 构建成功，退出码 0，并生成单个 `index.js`。该结果只证明源码当时可构建，不证明 CI 可重现；并行 Functions WIP 合并后必须重跑。

Cloudflare 当前官方契约：

- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) 要求先构建预制资产，再把**一个输出目录**交给 `wrangler pages deploy`；`--branch=<name>` 会创建对应 branch alias。
- [Pages Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/) 明确提供 `pages functions build [DIRECTORY]`，支持 `--outdir`/`--outfile` 且 sourcemap 默认关闭。
- [Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/) 规定输出目录存在 `_worker.js` 时使用它，并忽略整个 `/functions` 目录。因此部署编译后的 `_worker.js` 即可，Function 源目录不应进入 artifact。
- [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) 说明上传目录中的站点文件会进入 Pages 全球网络；“文件在 staging 中但 Cloudflare 可能替我们过滤”不是可接受的安全边界。

精确建议：

- 在 `devDependencies` 中精确锁定 Wrangler（不使用 `^`、浮动 tag 或运行时 `npx` 下载），lockfile 同步记录。
- builder 只调用 `./node_modules/.bin/wrangler`；不存在或版本不符立即退出。
- Functions 命令非零、输出 `_worker.js` 缺失/为空、输出含 sourcemap，任一条件立即失败。
- artifact 只包含编译后的 `_worker.js`，不包含 `functions/` 源目录。

### 4. hash 与健康检查的 fail-open

`scripts/hash-assets.js` 当前只读取和改写 `index.html`：

- `scripts/hash-assets.js:28-33` 只匹配 `index.html` 中 `modules/`、`styles/` 的相对引用。
- `scripts/hash-assets.js:55-57` 遇到引用文件不存在只警告并继续。
- `scripts/hash-assets.js:66-78` 复制 hashed 文件、改写 HTML，但保留原文件，也不遍历模块内部 import。
- `scripts/deploy.sh:63-65` 又用 `|| echo` 吞掉整个 hash 命令失败。

隔离实测：只给脚本一份现有 `index.html`、不给任何被引用资产时，脚本报告 17 个 missing warning，但退出码仍为 0。该返回值无法作为发布门禁。

`scripts/health-check.sh` 也不能补救：

- 页面、JS、CSS 失败会累积 `ERRORS`。
- `/api/chat` 预检与 `/api/auth/status` 异常只打印 warning，不累积错误（`scripts/health-check.sh:57-68,92-100`）。
- 因此没有 `_worker.js` 的静态站仍可能 health green。
- health check 位于 deploy 与 CDN purge 之后；即便返回非零，也只能标记部署后失败，不能让已经发生的发布“未发生”。

精确建议：

- hash 工具遇到任何本地引用缺失、路径逃逸、复制/写入失败时非零退出。
- builder 完成后解析 `index.html` 和本地 ESM imports，保证所有相对引用在 artifact 中存在。
- deploy 前的构建/hash/安全校验绝不使用 `|| echo` 或“warn then continue”。
- smoke 必须把核心 Functions 路由失败计为错误；但报告中仍要把“artifact validation green”和“post-deploy smoke green”分开。

## 最小 allowlisted artifact builder

### 文件与职责

建议新增两个 Node ESM 脚本，避免 shell 中复杂路径/扫描逻辑：

1. `scripts/build-deploy-artifact.mjs`
   - 输入：仓库根、目标 artifact 根。
   - 输出：`<artifact>/site/` 与 `<artifact>/manifest.json`。
   - 只复制 allowlist，构建 `_worker.js`，运行 hash，调用 validator，最后写 canonical manifest。
2. `scripts/validate-deploy-artifact.mjs`
   - 可独立对下载后的 artifact 重验。
   - 验证路径策略、manifest/散列、秘密签名、source map、symlink、必需文件和引用闭包。

artifact 结构：

```text
deploy-artifact/
  manifest.json        # 不部署，仅随 workflow artifact 保存
  site/                # Wrangler 唯一可见的 deploy directory
    _headers
    _worker.js
    index.html
    ...allowlisted runtime files...
```

### 当前兼容优先的 allowlist

精确顶层文件：

```text
_headers
favicon.svg
help.html
index.html
llms.txt
og-image.svg
pi-bundle.js
pi-web-ui.css
privacy.html
robots.txt
sitemap.xml
terms.html
```

精确目录策略：

- `modules/**/*.js`，但拒绝任何 `__tests__` 路径。
- `styles/**/*.css`。
- builder 生成的 `_worker.js`。
- hash 阶段生成且其文件名中的 SHA-256 前缀与内容一致的 `modules/**/*.js`、`styles/**/*.css` 变体。

明确不复制：

- 所有 dotfile、`.dev.vars*`、`.env*`、`config.local.js`、`config.local.example.js`。
- `__tests__/`、`modules/__tests__/`、测试报告、coverage。
- `functions/` 源目录；仅编译产物 `_worker.js` 可进入。
- `entry*.ts`、`local-dev-server.cjs`、`node-empty.js`。
- 当前未引用的 `pi-ai.bundle.js`、`pi-core.bundle.js`。
- `*.map` 和包含 `sourceMappingURL=` 的文件。

为兼容现有页面，本轮保留所有非测试 `modules/**/*.js`，即使其中存在旧/新目录并存；运行时依赖裁剪应另开任务，不能在安全止血中顺带做。

### 构建顺序与 fail-closed 条件

1. 要求目标不存在或为空；拒绝在任意非空目录上“清理后复用”，避免 stale 文件混入。
2. 使用 `lstat` 验证源/目标均为普通文件或目录；拒绝 symlink、绝对路径、`..`、NUL 和路径越界。
3. 按上述 allowlist 复制到 `site/`；未知顶层文件只记录 `ignored path`，绝不自动复制。
4. 用仓库锁定的 Wrangler 构建 Functions 到独立临时目录；要求命令返回 0，且输出 `_worker.js` 为非空普通文件。
5. 对 `site/` 运行修正后的 hash 工具；任何本地引用缺失或 hash/改写失败立即非零。
6. validator 递归枚举 `site/`，先做路径 deny，再做内容扫描，再检查引用闭包。
7. 对每个文件记录 POSIX 相对路径、byte size、完整 SHA-256；按路径排序、稳定 JSON 序列化。`artifact_sha256` 计算 canonical `files` 数组，不把 manifest 自身纳入，避免循环散列。
8. 写 `manifest.json` 后重新读取并完整复验；实际文件集合必须与 manifest **完全相等**，多一个、少一个、内容变化均失败。
9. deploy consumer 下载 artifact 后再次运行 validator，再把 `site/` 传给 `wrangler pages deploy`。Wrangler 不得看到 checkout 的 `web/`。

### Secret scan 规则

扫描器输出必须只有 `rule id + relative path`，绝不打印匹配文本、上下文、行内容或环境值。

路径级硬拒绝：

- 任意目录的 `.dev.vars`、`.dev.vars.*`、`.env`、`.env.*`。
- `config.local.js`、常见私钥/证书容器扩展（`.pem`、`.key`、`.p12`、`.pfx`、`.jks`）。
- `*.map`、`__tests__`、`test-results`、`playwright-report`、`coverage`。
- 默认拒绝所有 dotfile；若以后确有 `.well-known`，必须显式加入 allowlist。

内容级高置信规则：

- PEM/OpenSSH private key header。
- 常见 LLM/cloud/provider token 前缀与长度结构，例如 OpenAI/Anthropic、Google API、AWS access key、GitHub token、Slack token。
- JWT 三段式高熵结构和 `Bearer <high-entropy>`。
- `API_KEY`、`CLIENT_SECRET`、`ACCESS_TOKEN`、`PASSWORD` 等名字直接赋给足够长的非占位字符串。
- `sourceMappingURL=`、内联 `data:application/json;base64` sourcemap、`sourcesContent`。

允许的无秘密文本应窄化为显式占位符（空字符串、`YOUR_*`、`example`），不要做大范围文件豁免。高熵 vendor bundle 若产生误报，应增加针对**规则与固定文件散列**的审计豁免，而不是跳过整个 bundle 扫描。

## `scripts/deploy.sh` 兼容迁移

保留开发者入口，但让所有路径汇合到同一已验证 artifact：

```text
bash scripts/deploy.sh
  -> 临时 artifact
  -> build-deploy-artifact.mjs
  -> validate-deploy-artifact.mjs
  -> deploy artifact/site to main

bash scripts/deploy.sh preview
  -> 同上，branch=preview（兼容旧入口）

bash scripts/deploy.sh --artifact <downloaded-artifact> --branch <exact-branch>
  -> 只重验 manifest/site
  -> deploy artifact/site
```

CI/发布 workflow 只允许第三种模式；前两种只为本地兼容。具体文件级变更：

- `scripts/deploy.sh`
  - 删除 `rsync web/`、排除列表和所有 fail-open 分支。
  - 不再隐式依赖全局 Wrangler或浮动 `npx`。
  - deploy 前强制 validator；校验非零时 Wrangler deploy 必须完全未调用。
  - 兼容 `preview`，并增加显式 `--branch` 供 PR 隔离 branch 使用。
  - 建议停止隐式 source `~/.bashrc`；至少在 CI artifact 模式下只接受已传入的环境变量。可暂时兼容现有 token 变量名，但应对历史拼写 `CLOUDFRAME_API_KEY` 给出弃用提示。
- `scripts/hash-assets.js`
  - missing reference 改为收集错误并非零退出。
  - 做路径 containment；输出结构化的已生成文件列表，供 manifest 使用。
  - 写入完成后再次校验 hashed 文件内容与文件名散列匹配。
- `package.json` / `package-lock.json`
  - 精确锁定 Wrangler。
  - 增加 `build:deploy-artifact`、`validate:deploy-artifact`；现有 `deploy`、`deploy:preview` 命令名保持不变。
- `.gitignore` / `.dev.vars.example`
  - 按上文处理两个已跟踪秘密文件与变体。
- `.trellis/spec/guides/deployment-guide.md`
  - 实现完成后更新“只排除 config.local”这一过时说明，改为 allowlist/manifest/validator 契约。

缓存 purge 与 smoke 都发生在发布之后：它们的失败应该让 job 失败并清晰报告，但不能描述为“部署被阻止”。是否自动 rollback 是后续运营设计，不应在本轮伪装完成。

## 对应测试设计

建议新增 `src/__tests__/quality/deploy-artifact-safety.test.ts`，它已被 `backend-unit` project 的 `src/__tests__/quality/**/*.test.ts` include 覆盖。所有用例使用临时 fixture 和假的 Wrangler/deploy 命令，不访问 Cloudflare。

### Builder/allowlist

1. 最小合法 fixture 生成 `site/` 与稳定 `manifest.json`。
2. 在 `web/` 顶层加入未知 sentinel，构建成功但 sentinel 不进入 artifact；证明未知文件不会自动部署。
3. 当前兼容 manifest 包含所有必需 HTML、`pi-bundle.js`、CSS、非测试 modules 与 `_worker.js`。
4. `__tests__`、Functions 源、`entry*.ts`、本地 server、旧 split bundles 均不进入。
5. 输出目标非空时拒绝，防止 stale 文件残留。
6. symlink、`..`、绝对路径、大小写变体的 forbidden name 均失败。

### Git/秘密扫描

7. 子进程执行 `git ls-files`，断言无 `.dev.vars*` tracked path。
8. 参数化验证根级与嵌套 `.dev.vars`、`.dev.vars.local`、`.env`、`.env.production`、`config.local.js` 全部被拒绝。
9. 用完全合成的假 token/PEM/JWT fixture 验证每条 rule；捕获 stdout/stderr，断言只包含 rule id 与路径，不包含 fixture 的匹配值。
10. `*.map`、外部 `.map` 引用、内联 sourcemap、`sourcesContent` 全部失败。
11. 普通 bundle、公开 SRI hash、空值/`YOUR_*` 占位符不误报。

### Functions/hash/fail-closed

12. fake Functions builder 非零：artifact 不生成，fake deploy 调用计数为 0。
13. builder 返回 0 但 `_worker.js` 缺失/为空：失败，deploy 调用计数为 0。
14. `index.html` 引用缺失资产：hash 非零；覆盖当前“17 个 warning 仍为 0”的缺陷。
15. hash 工具非零：wrapper 原样非零，deploy 调用计数为 0。
16. secret scan 非零：deploy 调用计数为 0。
17. manifest 多文件、少文件、文件内容被改、散列文件名与内容不符：每种都失败。
18. 同一输入两次构建产生相同 canonical manifest/artifact SHA（排除时间戳等不稳定字段）。

### 兼容与 smoke contract

19. `bash scripts/deploy.sh` 选择 `main`，`bash scripts/deploy.sh preview` 选择 `preview`；二者都先构建/验证。
20. `--artifact` 模式不得读取/复制 checkout `web/`；在 checkout 放 sentinel 后验证 fake Wrangler 只收到 `<artifact>/site`。
21. 核心 `/api/chat` OPTIONS 与 `/api/auth/status` 失败应让 smoke 非零；静态页面 green 不能掩盖 Functions 缺失。

实现后的直接验证命令建议：

```bash
npm run test:unit -- src/__tests__/quality/deploy-artifact-safety.test.ts
npm run build:deploy-artifact -- /tmp/travelmap-artifact
npm run validate:deploy-artifact -- /tmp/travelmap-artifact
find /tmp/travelmap-artifact/site -type f -print | sort
```

最后一个命令只用于人工核对路径集合；自动门禁必须依赖 validator 和 manifest，而不是人工目测。

## 实施顺序与验收映射

1. 先移除两个 tracked `.dev.vars`，补 ignore 与空样例；此时 Git 跟踪测试应先变绿。
2. 先实现 validator 与安全测试，再实现 builder；避免 builder 在无独立门禁时被接入 deploy。
3. 修正 hash 严格返回码，锁定 Wrangler，接入 Functions build。
4. 把 `deploy.sh` 改为 artifact consumer，并保留本地 legacy wrapper。
5. 最后才让 workflow 上传/下载 immutable artifact；部署前重验 manifest。
6. 执行 scoped unit/quality test、隔离 builder/validator、typecheck；只做非敏感 smoke。部署、Hosted CI、密钥轮换、CDN 清理分别报告，不能合并为一个 “green”。

该顺序直接覆盖 R1/验收 1、5，并为 R3 artifact consumer 提供稳定输入。当前只完成审计与设计，尚未完成任何代码止血、密钥轮换、Cloudflare 清理或线上重新部署。
