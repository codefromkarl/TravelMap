# pi 依赖的 registry 可复现性与兼容审计

审计日期：2026-08-13

## 范围与结论

本研究只针对 npm registry、TravelMap 源码/锁文件和相邻 `../pi` checkout 取证；没有修改产品代码、工作流、`package.json` 或 `package-lock.json`，没有提交、推送或部署，文档也没有记录或回显任何凭据值。

结论：`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`@earendil-works/pi-web-ui` 都有可由干净 checkout 从 npm registry 安装的精确版本，推荐三包统一固定为 **`0.75.3`**。

这是目前唯一合理的共同版本基线：

- `pi-agent-core` 和 `pi-ai` 已继续发布到 `0.84.1`，但 `pi-web-ui` 的最后一个/最新版本仍是 `0.75.3`。
- 三个 `0.75.3` tarball 的 registry `gitHead` 都是 `a7d8dd3d5db7d66aa5cc6886e32768b1196ce91f`，与 sibling 历史中的 `Release v0.75.3` 对应。
- TravelMap 当前 lockfile 缓存的三个本地包元数据也都是 `0.75.3`，所以它比当前 sibling 的 `0.79.10` 更接近现有代码的已知开发基线。
- 在不提供 `../pi` 的临时 TravelMap archive 中，重新生成 registry lock 后，`npm ci` 成功安装；TypeScript 未报告 pi API 相关错误。
- 不应混用 `pi-agent-core/pi-ai@0.79.10` 与 `pi-web-ui@0.75.3`。后者声明 `pi-ai: ^0.75.3`，在 `0.x` caret 规则下不接受 `0.79.10`，会引入第二份 `pi-ai@0.75.x` 或产生不可证明的运行时兼容性。

推荐的依赖身份不是 tag、branch 或 sibling 路径，而是：

```text
package.json 中的 exact 0.75.3
  + package-lock.json lockfileVersion 3
  + 每个实际 tarball 的 resolved URL 和 integrity
  + 隔离 checkout 的 npm ci / typecheck / browser bundle 验证
```

## Registry 证据

查询使用 canonical registry `https://registry.npmjs.org/`，并显式使用 `/tmp` cache，避免本机默认 npm cache 的只读状态影响结果。

| 包 | registry latest | 已发布版本范围（本次相关） | 推荐精确版本 | Node engine | `0.75.3` gitHead |
| --- | --- | --- | --- | --- | --- |
| `@earendil-works/pi-agent-core` | `0.84.1` | `0.74.0` 至 `0.84.1`，含 `0.75.3`/`0.79.10` | `0.75.3` | `>=22.19.0` | `a7d8dd3d5db7d66aa5cc6886e32768b1196ce91f` |
| `@earendil-works/pi-ai` | `0.84.1` | `0.74.0` 至 `0.84.1`，含 `0.75.3`/`0.79.10` | `0.75.3` | `>=22.19.0` | `a7d8dd3d5db7d66aa5cc6886e32768b1196ce91f` |
| `@earendil-works/pi-web-ui` | `0.75.3` | 仅 `0.74.0` 至 `0.75.3` | `0.75.3` | 包自身未声明；其 `pi-ai`/`pi-tui` 路径要求 `>=22.19.0` | `a7d8dd3d5db7d66aa5cc6886e32768b1196ce91f` |

三个推荐 tarball：

| 包 | tarball | integrity |
| --- | --- | --- |
| `pi-agent-core@0.75.3` | `https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.75.3.tgz` | `sha512-azg09GSrckQa3ffbH09YEZC7DyHgmNSX+vmWEoEhQvp4icbzqbqLfIeMayMNEK/aGusm1SghZC4bPlDdagDALg==` |
| `pi-ai@0.75.3` | `https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.75.3.tgz` | `sha512-UKccS+ADlkSVJ49a00346jUfXmUi6zzzB+pPWotsyA6SxhKr2ejjkGQksGyR1DyNVrsEP/WWlsOSTUUwVlzNaA==` |
| `pi-web-ui@0.75.3` | `https://registry.npmjs.org/@earendil-works/pi-web-ui/-/pi-web-ui-0.75.3.tgz` | `sha512-FVTG8bLA3DobB+OkrJBJC0RyHyEPfYjf0wOL8EU6Mwgiy/19sqi+AZqXNB7Zwa+9EEmPbI0ZXHB7CKfzHfiTYg==` |

独立核验还流式下载了三个 tarball，并确认实际 SHA-512 与 registry integrity 一致；tarball 含已编译的 `dist` 文件，不依赖消费者自行 checkout/build pi monorepo。

需要特别记录的传递依赖：

- `pi-agent-core@0.75.3` 声明 `pi-ai: ^0.75.3`。
- `pi-web-ui@0.75.3` 声明 `pi-ai: ^0.75.3`、`pi-tui: ^0.75.3`。
- `pi-web-ui@0.75.3` 的 peer 是 `@mariozechner/mini-lit: ^0.2.0`、`lit: ^3.3.1`。
- `pi-web-ui@0.75.3` 仍直接引用 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`。lockfile 可以固定其 integrity，但首次安装仍受该外部 CDN 可用性影响。

## 当前 sibling `../pi` 状态

审计时相邻 checkout 的身份为：

```text
HEAD:    1efc4490da36f079e0d576201492259742f6b7a4
branch:  wip/pi-update-20260624
remote:  origin/wip/pi-update-20260624
state:   ahead 1，且工作树不干净
date:    2026-06-24T17:22:38+08:00
subject: fix(coding-agent): let project extensions override global ones on name conflicts
```

当前工作树有已修改和未跟踪文件，包括一个未提交的 `pi-ai` compat export。因此：

- HEAD SHA 不能代表当前 sibling 工作树的完整内容。
- 当前 `packages/agent/package.json` 与 `packages/ai/package.json` 均标称 `0.79.10`、Node `>=22.19.0`。
- registry 中发布的 `0.79.10` 来自另一个 `gitHead` `8e1900666f3cb83c281297d8f787fae6ee2bd0e6`；不能把“本地标称 0.79.10”与“published 0.79.10”视为同一内容。
- 当前 HEAD 已没有 `packages/web-ui`。历史显示 `a7d8dd3d` 是 `Release v0.75.3`，之后 `b141e1fa` 执行 `chore: remove web-ui workspace`，且删除提交是当前 HEAD 的祖先。

所以，固定当前 sibling commit 不能重现 TravelMap 所需的三包集合。即使选旧的 `a7d8dd3d`，npm 的普通 Git dependency 也以 monorepo 根 package 为安装单位，不能可靠地把三个 workspace 子目录分别解析成三个直接依赖。registry exact tarball + lockfile 是更简单且更可审计的方案。

## TravelMap 当前 lockfile 的问题

当前仓库证据：

- `package.json:49-51`：三包均为 `file:../pi/packages/*`。
- `package.json:68-69`：项目只声明 Node `>=20.0.0`，低于 pi 的 `>=22.19.0`。
- `package-lock.json:11-13`：根依赖仍是三个 sibling `file:` spec。
- `package-lock.json:34-108`：缓存的本地包元数据是旧 `0.75.3`。
- `package-lock.json:550-560`：三个安装项均是 `link: true`，`resolved` 指向 `../pi/packages/*`。
- lockfile 缺少一个完整 registry 安装应有的 `pi-tui`、web-ui peers 和外部 tarball节点。

这是一个已经漂移的 link lock：lock 仍显示 `0.75.3`，但 link 的 core/ai 源码已变成 `0.79.10`，且 web-ui 路径不存在。本地 link 内容可以在 TravelMap lockfile 完全不变时发生变化，因此现有 lock 既不完整也不可作为供应链身份。

另一个实测陷阱：仅把 `package.json` 改为 registry version 后运行 `npm install --package-lock-only`，npm 10 仍可能保留旧的 `node_modules/... link: true` 节点。实施时应在可回滚的变更中重新生成完整 lock，而不是在旧 link lock 上做增量修补；生成后必须显式拒绝所有 `../pi` 和 `link: true`。

## TravelMap import/API 兼容审计

### `pi-agent-core`

TravelMap 依赖的主要表面：

- `src/agent/travel-agent.ts:15-17`：`AgentEvent`、`AgentTool`、`Agent`。
- `src/agent/travel-agent.ts:377-404`：`new Agent({ initialState, beforeToolCall, afterToolCall, prepareNextTurn })` 与 `subscribe`。
- `src/agent/travel-agent.ts:192-202,342-356,451-482,528-531`：直接读写 `state`，调用 `steer`、`followUp`、`prompt`。
- `src/agent/review-agent.ts:19-21,255-264,316-321,390-397`：`prompt`、`waitForIdle`、`reset`、`subscribe`。
- `src/services/discover-service.ts:18-19,101-117`：构造 Agent、`prompt`、`waitForIdle`。
- `src/tools/define-tool.ts:22,62-103` 及各工具：`AgentTool` 结构。
- `web/modules/trip/chat-init.js:37,133-142,173`：浏览器 Agent、`initialState`、`getApiKey`、`subscribe`。

上述导出、构造参数、state 字段和方法均存在于 registry `0.75.3` 的声明/源码中；主要 Agent API 的回退风险较低。

### `pi-ai`

实际使用面包括：

- `getModel`；
- TypeBox `Type`；
- 类型 `Tool`、`ToolCall`；
- `validateToolArguments`；
- `streamSimple`；
- `createAssistantMessageEventStream`。

关键位置包括 `src/agent/travel-agent.ts`、`src/agent/review-agent.ts`、`src/services/discover-service.ts`、`src/tools/*.ts`、integration/unit/evaluation tests 和 `src/evaluation/dimensions/semantic.ts`。这些导出在 `0.75.3` tarball typings 中都存在；TravelMap 使用的 `gpt-4o`、`gpt-4o-mini`、`claude-sonnet-4` 也存在于该版本 model catalog。

### `pi-web-ui`

实际使用面包括：

- `web/entry.ts:1`：`ChatPanel`、`AppStorage`、`setAppStorage`、`getAppStorage`。
- `web/modules/infra/storage.js:1,73-89`：五参数 `new AppStorage(...)` 与全局 storage。
- `web/modules/infra/model-config.js:5`：`getAppStorage`。
- `web/modules/trip/chat-init.js:425-436`：`ChatPanel.setAgent`。
- `web/modules/trip/chat-init.js:449-461` 与 `web/modules/ui/map.js:919-940`：直接访问 `agentInterface` 和 `sendMessage`。

`0.75.3` 导出上述四个顶层符号，AppStorage 构造器、`ChatPanel.setAgent` 与 `AgentInterface.sendMessage` 也存在。

### 与依赖迁移无关、但会影响验证解释的现存风险

1. `web/modules/trip/chat-init.js:169` 调用 `_agent.run(content)`，而 `Agent` 在 `0.75.3` 和当前 sibling HEAD 都没有 `run()`；公开入口是 `prompt()`。这是现存浏览器重试路径缺陷，不是 registry 替换引入的。
2. `src/evaluation/dimensions/semantic.ts:169-175` 与 `src/__tests__/evaluation/evaluators.test.ts:181-189` 给 `streamSimple` 的第二参数传了消息数组；两版签名都要求 `{ messages, systemPrompt?, tools? }`。代码用 `as any` 绕过了类型检查，真实 AI eval 仍有运行时风险。
3. `tsconfig.json` 只覆盖 `src/**/*.ts`，且开启 `skipLibCheck`；所以 backend typecheck 不是 web JS/API 兼容性的完整证据，仍需 browser bundle 与 scoped Playwright smoke。
4. 当前提交的 `web/pi-bundle.js` 注释仍泄露它由 sibling `../pi` 构建的来源路径；迁移后必须重建 bundle，不能只更新 package/lock。

## 推荐的不可变依赖与 lockfile 方案

### 必选项

```json
{
  "dependencies": {
    "@earendil-works/pi-agent-core": "0.75.3",
    "@earendil-works/pi-ai": "0.75.3",
    "@earendil-works/pi-web-ui": "0.75.3"
  },
  "engines": {
    "node": ">=22.19.0"
  },
  "overrides": {
    "@earendil-works/pi-ai": "0.75.3",
    "@earendil-works/pi-tui": "0.75.3"
  }
}
```

- 三个 direct dependency 必须是 exact version，不使用 `^`、`~`、tag 或 Git branch。
- 用 override 让 web-ui 的 pi family 保持同一 `0.75.3`，避免默认把 `pi-tui ^0.75.3` 解到 `0.75.5`。
- 提交 lockfileVersion 3 的完整 `resolved`/`integrity` 图；`npm ci` 实际以 lockfile 为安装身份。

### 建议显式固定的宿主依赖

```json
{
  "dependencies": {
    "@mariozechner/mini-lit": "0.2.0",
    "lit": "3.3.1",
    "@opentelemetry/api": "1.9.0"
  }
}
```

理由：

- 前两个是 web-ui peer；显式固定可以避免 npm 版本变化选择不同的满足版本。
- fresh registry lock 允许 `pi-ai` 的 `@mistralai/mistralai: ^2.2.0` 解析到较新的 2.x。隔离 browser bundle 首次实测因其 telemetry import 找不到 `@opentelemetry/api` 而失败；显式加入 API `1.9.0` 后 bundle 成功。另一种方案是 override Mistral 到经验证的精确旧版，但这比满足其声明的 peer 更侵入，当前不推荐。
- 即使 package.json 中传递 range 仍存在，提交 lockfile 会固定实际 Mistral tarball；依赖更新必须通过显式 lockfile review，而不是在 CI 中重新求解。

### 实施时的精确命令

以下命令是下一阶段的实施方案，本研究没有在工作树执行它们：

```bash
npm pkg set \
  'engines.node=>=22.19.0' \
  'dependencies.@earendil-works/pi-agent-core=0.75.3' \
  'dependencies.@earendil-works/pi-ai=0.75.3' \
  'dependencies.@earendil-works/pi-web-ui=0.75.3' \
  'dependencies.@mariozechner/mini-lit=0.2.0' \
  'dependencies.lit=3.3.1' \
  'dependencies.@opentelemetry/api=1.9.0' \
  'overrides.@earendil-works/pi-ai=0.75.3' \
  'overrides.@earendil-works/pi-tui=0.75.3'

# 旧 lock 是 sibling-link lock，先保存再从 package.json 重新求解。
cp package-lock.json /tmp/travelmap-package-lock.before-pi-registry.json
rm package-lock.json

PI_NPM_CACHE="$(mktemp -d /tmp/travelmap-pi-install.XXXXXX)"
npm --cache "$PI_NPM_CACHE" install \
  --package-lock-only --ignore-scripts --no-audit --no-fund \
  --registry=https://registry.npmjs.org/
```

生成后 fail-closed 检查：

```bash
if rg -n \
  'file:\.\./pi|"resolved": "\.\./pi|"link": true' \
  package.json package-lock.json
then
  echo 'ERROR: sibling pi dependency remains' >&2
  exit 1
fi

npm ci --registry=https://registry.npmjs.org/

npm ls \
  @earendil-works/pi-agent-core \
  @earendil-works/pi-ai \
  @earendil-works/pi-web-ui \
  @earendil-works/pi-tui \
  @mariozechner/mini-lit \
  lit \
  @opentelemetry/api

node scripts/build-bundle.cjs
npm run typecheck
```

期望 `npm ls` 中 pi family 都是 `0.75.3`；lockfile 中 registry 包都有具体 `version`、`resolved` 和 `integrity`，没有 `link: true` 或 `../pi`。

最终验收要在不含 sibling 的真正隔离 checkout 中运行正常 `npm ci`，而不只运行 `--ignore-scripts`：

```bash
ISOLATED_ROOT="$(mktemp -d /tmp/travelmap-isolated.XXXXXX)"
git archive HEAD | tar -x -C "$ISOLATED_ROOT"
cd "$ISOLATED_ROOT"

test ! -e ../pi
npm ci --registry=https://registry.npmjs.org/
npm run typecheck
node scripts/build-bundle.cjs
```

注意：若用 `git archive HEAD` 验证尚未提交的 package/lock 改动，archive 不会包含它们。实施阶段应复制明确 allowlist 的当前文件到临时目录，或在独立 worktree 验证当前 diff；不能把旧 HEAD archive 的结果当作新 lock 验证。

## 本次实际运行与结果

### Registry/源码核验

```bash
PI_NPM_VIEW_CACHE="$(mktemp -d /tmp/travelmap-pi-npm-view.XXXXXX)"

npm --cache "$PI_NPM_VIEW_CACHE" view \
  '@earendil-works/pi-agent-core' dist-tags versions --json \
  --registry=https://registry.npmjs.org/
npm --cache "$PI_NPM_VIEW_CACHE" view \
  '@earendil-works/pi-ai' dist-tags versions --json \
  --registry=https://registry.npmjs.org/
npm --cache "$PI_NPM_VIEW_CACHE" view \
  '@earendil-works/pi-web-ui' dist-tags versions --json \
  --registry=https://registry.npmjs.org/

for spec in \
  '@earendil-works/pi-agent-core@0.75.3' \
  '@earendil-works/pi-ai@0.75.3' \
  '@earendil-works/pi-web-ui@0.75.3'
do
  npm --cache "$PI_NPM_VIEW_CACHE" view "$spec" \
    version engines repository gitHead dist.tarball dist.shasum \
    dist.integrity exports dependencies peerDependencies --json \
    --registry=https://registry.npmjs.org/
done

git -C ../pi rev-parse HEAD
git -C ../pi status --short --branch
git -C ../pi ls-tree --name-only HEAD:packages
git -C ../pi log --oneline -- packages/web-ui/package.json
```

结果：registry 查询成功；三包 `0.75.3` 可取得且 integrity 校验匹配；sibling HEAD/dirty 状态和 web-ui 删除历史如上。

### 无 sibling 安装与兼容验证

临时目录由 `git archive HEAD` 创建；只在临时副本中把依赖改为上述 exact/override 方案并重新生成 lock，不改 TravelMap 工作树。

- Node：`v22.22.3`；npm：`10.9.8`。
- `npm ci --ignore-scripts`：成功，安装 501 个包。
- 正常 `npm ci`（含 root `prepare`）：成功；临时 archive 没有 `.git`，Husky打印 `.git can't be found` 警告但命令仍为 0。
- `npm ls`：core/ai/web-ui/tui 均为 `0.75.3`；mini-lit `0.2.0`、lit `3.3.1`、OpenTelemetry API `1.9.0` 均单例归并。
- `node scripts/build-bundle.cjs`：显式固定 OpenTelemetry peer 后成功，产物约 10.3 MB。
- `npm run typecheck`：退出 2，但没有 pi 导出、构造参数或方法类型错误。剩余错误来自当前 HEAD 中两组测试引用不存在的实现：
  - `src/__tests__/unit/services/poi-searcher.test.ts` 引用缺失的 `src/__tests__/services/poi-searcher.js` 相对目标，并产生后续 implicit-any；
  - `src/__tests__/unit/tools/define-tool.test.ts` 引用缺失的 `src/__tests__/tools/define-tool.js` 相对目标，并产生后续 implicit-any。

因此当前证据可以确认“registry 依赖在干净输入中可安装、pi 声明/API 未阻塞 typecheck、browser bundle可构建”；不能把整个 TravelMap typecheck 报告为 green。上述测试路径错误需要在依赖改动之外单独归因/修复。

## 风险与未验证边界

1. **版本陈旧但最兼容**：`0.75.3` 不是 core/ai 最新版本，但它是 web-ui 的最后共同版本。选择它是复现/兼容决策，不代表获得上游最新修复。
2. **外部 SheetJS CDN**：即使有 integrity，首次 `npm ci` 仍依赖 `cdn.sheetjs.com`。如果发布环境要求完全单 registry/离线重放，需要后续单独评估 vendor tarball 或批准的内部镜像。
3. **传递依赖 range**：package.json 的 exact direct 不能固定整棵树；只有提交并审查 lockfile，且始终使用 `npm ci`，才能避免重新求解漂移。
4. **browser JS 缺少静态覆盖**：现有 typecheck 不覆盖 `web/modules/**/*.js`，必须重建 bundle并跑 scoped page startup/smoke。
5. **现存 API 误用**：`Agent.run()` 和两个 `streamSimple(..., messagesArray)` 调用不会因换 registry 自动修复；验证失败时应与依赖解析分开报告。
6. **Node 一致性**：package engines、开发版本文件和所有 CI workflow 都需统一到 `22.19+`；只改 package engines 不足以满足可复现条件。
7. **供应链身份**：registry metadata 的 `gitHead` 是辅助 provenance；真正被 npm 校验的是 lockfile integrity。两者都应留在审计证据中。
8. **本次未运行完整测试/E2E**：本研究只做依赖安装、声明/API、typecheck 边界和 bundle核验，没有调用真实 LLM、没有运行 Playwright、没有触发 CI 或部署。

## 最终决策

下一实施阶段应采用：

1. 三个 direct pi 包统一 exact `0.75.3`；
2. Node 下限 `>=22.19.0`；
3. override `pi-ai`/`pi-tui` 到 `0.75.3`；
4. 宿主 exact 固定 web-ui peers，并显式提供 bundle 所需 `@opentelemetry/api@1.9.0`；
5. 从 package.json 重新生成完整 registry lock，拒绝任何 `../pi`/`link: true`；
6. 在无 sibling 的隔离 checkout 依次执行正常 `npm ci`、`npm ls`、bundle、typecheck 和 scoped browser smoke；
7. 把依赖可复现 green、既存 typecheck 错误、browser runtime、hosted CI 分别报告，不能互相替代。
