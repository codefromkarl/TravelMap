# 生产安全止血与发布链路恢复

## 目标与用户价值

先恢复 TravelMap 的最小可信交付基线：干净 checkout 可安装和类型检查，部署产物采用显式白名单且构建失败即停止，CI 不再用缺失密钥制造必失败结果，并为后续 Agent 生产路径统一提供健康的工程底座。

## 本轮授权与范围

用户已明确要求分派子代理执行优化，并建议把“生产安全止血与发布链路恢复”作为首个任务。本轮只修改本地仓库；不提交、不推送、不部署、不修改 GitHub required checks、不轮换第三方密钥、不清理 CDN，也不代表线上风险已经消除。

## 已确认事实

- `main` 与 `origin/main` 当前指向同一提交，开始时除既有未跟踪 Trellis 任务外无代码改动。
- 根目录 `.dev.vars` 被 Git 跟踪，包含真实形态的 LLM 凭据；此前线上同路径可访问。
- `package.json` 和 `package-lock.json` 的三个核心 pi 依赖仍指向 `file:../pi/packages/*`。
- 相邻 pi checkout 的三个包要求 Node `>=22.19.0`，而项目自身声明 `>=20.0.0`，两套 GitHub Actions 使用 Node 20。
- `ci.yml` 与 `deploy.yml` 都在 main push 和 PR 上执行重复的安装、静态检查和 E2E。
- `ci.yml` 在 main push 上无条件运行需要密钥的 AI evaluation。
- `scripts/deploy.sh` 从整个 `web/` 目录复制部署内容，只排除少量文件；Functions 构建和资源哈希失败会继续部署。
- Playwright 当前只配置 list reporter；失败时并未完整、统一归档 HTML、JUnit、trace、截图和原始 test-results。
- 既有未跟踪任务 `.trellis/tasks/08-13-weather-aware-trip-planning/` 与本轮无关，必须保留。

## 需求

### R1 安全止血

- 从可部署/可提交内容中移除 `.dev.vars`，添加覆盖 `.dev.vars` 及其环境变体的忽略规则，并保留无秘密的示例配置（若仓库已有约定则复用）。
- 部署输入改为显式 allowlist 或等价的 fail-closed manifest；未知顶层文件不得自动进入生产产物。
- Functions 构建、资源 hash、产物安全校验任一失败时部署必须停止。
- 增加可自动执行的部署产物检查，至少拒绝 dot-env/dev-vars、源码映射中的秘密配置和明显密钥形态。

### R2 独立构建可复现

- 三个 pi 依赖不再依赖 checkout 外的 `../pi` 目录；选择可由干净 checkout 获取且固定到不可变版本/提交的来源。
- 项目 Node 约束、开发版本文件、CI 统一为 Node 22.19+。
- `npm ci`、`npm run typecheck` 在不依赖相邻 `../pi` 的隔离条件下可执行。

### R3 CI 与发布链路收敛

- `ci.yml` 成为 PR/main 的唯一验证入口：lint、typecheck、unit/integration/coverage、PR scoped E2E、main full E2E。
- AI evaluation 只有在所需 secret 确实配置时运行；无密钥时明确 skip，而不是红灯。
- Playwright 归档 `test-results`、trace/截图、HTML report 和 JUnit report。
- `deploy.yml` 只消费通过验证后构建的不可变 artifact，再执行 preview/production deploy 与 smoke；不重复质量检查。
- PR preview 使用 PR 隔离的分支/URL，不再全部覆盖固定 `preview`。
- 仓库内能自动验证工作流依赖关系、artifact 名称和 fail-closed 条件。

### R4 真实验证与诚实报告

- 先运行与改动直接相关的单元/脚本/配置验证，再运行 typecheck；E2E 仅运行本轮关联的 page-map 或 smoke 范围，除非修复证据要求扩大。
- 报告 local green、GitHub hosted CI、部署、密钥轮换、CDN 清理为不同状态。

## 验收标准

1. `git ls-files .dev.vars` 不再返回文件，忽略规则阻止重新加入，且仓库测试能验证部署 staging 不包含秘密文件。
2. 在临时隔离目录中不提供相邻 `../pi` 时，`npm ci` 能安装固定依赖，`npm run typecheck` 通过或只剩与本轮无关且已明确记录的既存错误。
3. 所有工作流使用 Node 22.19+；CI 和部署没有重复执行同一静态检查/E2E。
4. 缺少 AI API secret 不会让 main CI 失败；日志/summary 明确说明跳过原因。
5. Functions/hash/产物校验失败都会以非零状态阻止部署。
6. Playwright 配置和 workflow 同时保存 HTML、JUnit、trace、截图与 `test-results`。
7. Preview 标识包含 PR 编号，生产部署只依赖已通过的 immutable artifact。
8. `trellis-check` 子代理复核通过；所有实际运行的命令和未验证边界被记录。

## 非目标

- 本轮不统一 `src/` 与 `web/` Agent，不实现 TripPlan schema/provenance，不修复全部 Page Map/Full E2E，不做结构化编辑器或跨设备分享。
- 不修改云端 WAF、Access、账单、供应商密钥、GitHub branch protection 或 Cloudflare 项目状态。
- 不提交、推送、部署或创建 PR。

## 开放问题

- pi 包是否已有可公开安装的固定版本，需要以 registry/仓库证据确认；若不可用，采用固定 Git commit 或仓库内 vendor tarball，优先避免引入长期复制分叉。
- GitHub Actions 是否支持在当前权限模型下可靠检测 secrets，需要按官方表达式约束选用 job/step gate。
