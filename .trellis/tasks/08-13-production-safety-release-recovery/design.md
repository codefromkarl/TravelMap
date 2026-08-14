# 技术设计

## 边界

本轮把交付链拆成四个可独立验证的边界：依赖解析、验证 CI、artifact 构建、部署/烟测。浏览器 Agent 与业务数据路径保持不变，避免安全修复与产品架构迁移耦合。

## 目标数据流

```text
checkout
  -> Node 22.19+ + immutable pi dependencies
  -> CI validation (lint/type/unit/integration/coverage/scoped E2E)
  -> allowlisted artifact builder
  -> artifact safety manifest/checksum
  -> preview(PR-isolated) or production deploy
  -> core smoke
```

## 依赖策略

优先级如下：

1. registry 中已发布且能从干净 checkout 安装的精确版本；
2. package-manager 支持的固定 Git commit/tarball，且 lockfile 记录不可变解析结果；
3. 作为最后手段，将经过构建的包 tarball 以可审计方式纳入仓库。

不接受浮动 branch/tag、继续依赖 `../pi`、或只在 CI 人工 checkout sibling repo 的方案。Node 下限与上游包一致，使用仓库版本文件和 workflow 单一常量减少漂移。

## Artifact allowlist

引入一个仓库内 builder/validator。它只复制运行时确需的 HTML、内容哈希后的 JS/CSS、静态资源、必要配置与编译后的 `_worker.js`。文件集合由显式规则产生，并在部署前扫描：

- 禁止 dotfiles、`.dev.vars*`、`.env*`、测试/报告、源配置和 source map（除非以后明确批准）；
- 禁止常见私钥/LLM key/JWT bearer 形态；
- 输出排序后的 manifest 和 SHA-256，作为 immutable artifact 的身份；
- 任一步骤失败均非零退出。

## Workflow 收敛

- `ci.yml`：复用一个 Node/npm setup contract；PR 跑快速验证与 page-map，main 加 full E2E；AI eval 用显式配置 gate。
- artifact job 只依赖所需验证 jobs，执行 builder 并上传命名稳定、内容不可变的 artifact。
- `deploy.yml` 使用 `workflow_run`（main production）和 PR 对应的安全触发方式（preview）消费 artifact。若 GitHub 事件模型无法安全复用 PR artifact，则 preview 保留在 CI workflow 的 gated job，但仍不得重复构建/测试。
- 部署脚本只接受已验证 artifact 路径，不再从工作区任意复制 `web/`。

## 兼容与迁移

- 本地 `npm run deploy[:preview]` 先构建 artifact，再调用部署命令，保持开发者入口。
- 现有页面路径和资源 URL 通过 builder 测试覆盖。
- `.dev.vars` 删除后提供无秘密字段清单；真实值只存在本机未跟踪文件或平台 secrets。

## 回滚点

- 依赖来源、CI workflow、artifact builder、deploy consumer 分开提交会最易回滚；本轮不提交，但 diff 仍按这些逻辑分区。
- 若 registry 包与当前 sibling checkout API 不兼容，停止在依赖边界，不用 `skipLibCheck` 或 path alias 掩盖。
- 若现有 E2E 失败属于产品既存缺陷，只记录明确失败，不修改断言来“做绿”。

## 运营限制

仓库修改无法撤销已泄漏的凭据，也无法证明云端已清除缓存。最终必须把“代码止血完成”和“密钥轮换/CDN/账单审计完成”分开报告。

## 浏览器门禁续作设计

把 92 个失败拆为三层，按根因由内向外验证：

1. 运行时 API 合同：固定版 Pi Agent 只允许使用真实公开方法，重试路径必须经过现有认证门禁且不能调用不存在的方法。
2. 共享测试前置：游客/onboarding、可选 `config.local.js` 与 mobile map/chat 初始状态由 fixture 显式建立，不在每条断言中重复猜测页面状态。
3. 产品契约：DOM、可见性、触摸尺寸和 panel 行为仍不满足时保留为真实失败，按 spec 修产品而不是删除断言。

每个根因只运行直接相关 spec 一次；失败后先读测试和当前实现，再修复并单次复验。完整套件只在六个受影响 spec 收敛后运行。
