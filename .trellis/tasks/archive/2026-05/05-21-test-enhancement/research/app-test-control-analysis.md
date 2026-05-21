# app-test-control 测试实践分析

## 项目概览

**定位**：AI 驱动的移动 App 自动化测试平台（MCP-native）

**核心特点**：
- 让 MCP-aware AI 客户端在 Android/iOS 设备上自动执行测试
- 4 种测试模式：DevTest、QA、Minimize、Smart-QA
- MCP 协议跨客户端通用

---

## 可吸收的实践

### 1. 测试报告可视化 ⭐⭐⭐

**app-test-control 做法**：
- 单文件 HTML 交互式报告
- 本地看板服务 (`npm run sessions`)
- 支持截图预览、历史对比

**我们当前**：
- 纯 terminal 输出
- CI artifact（Playwright report）

**吸收价值**：
- AI E2E 测试结果可视化
- 历史测试结果浏览
- 截图 + 步骤 + 耗时一目了然

---

### 2. Impact-based Testing ⭐⭐⭐

**app-test-control 做法**：
- `git diff` → 推断改了哪个页面 → 只跑相关测试
- DevTest 模式的核心能力

**我们当前**：
- 改了代码 → 跑全量 test:unit（或手动指定文件）

**吸收价值**：
- CI PR 阶段加速
- 智能选择测试文件
- 支持依赖链分析

---

### 3. Delta-Debug 精简复现路径 ⭐⭐

**app-test-control 做法**：
- Minimize 模式：12 步崩溃 → 自动精简成 3 步
- ddmin 二分算法
- 自动重启 App + Replay 部分步骤组合

**我们当前**：
- AI E2E 失败 → 手动分析日志

**吸收价值**：
- 自动精简复现步骤
- 用于 bug 报告
- 减少调试时间

---

### 4. 状态图探索 + 防死循环 ⭐⭐

**app-test-control 做法**：
- QA 模式用状态图避免死循环
- 优先探索未访问节点
- 页面指纹（fingerprint）去重

**我们当前**：
- E2E 测试是固定脚本
- 无探索能力

**吸收价值**：
- 自动遍历页面功能
- 发现未覆盖的功能点
- 防止重复探索

---

### 5. Failure Signature 去重 ⭐⭐

**app-test-control 做法**：
- crash signature 提取 + 去重分析
- 7 次 crash → 去重 → 3 个独立 bug
- 结构化存储

**我们当前**：
- 测试失败直接报
- 无去重机制

**吸收价值**：
- 减少 CI 噪音
- 同一问题只报一次
- 记录发生次数

---

### 6. PRD 对齐测试（Smart-QA）⭐

**app-test-control 做法**：
- 读 PRD → 自动跑业务流 → 比对预期
- code-analyzer 静态推断业务流
- 列出测试流供用户确认

**我们当前**：
- 有 evaluation 测试
- 手动编写断言

**吸收价值**：
- AI 自动生成测试用例
- 比对实际输出与预期
- 发现 PRD 不一致

---

## 技术实现参考

### HTML 报告
- 单文件 HTML，内嵌 CSS/JS/Base64 图片
- 参考：`mcp-servers/report-mcp/src/html-report.ts`

### 状态图
- 页面状态节点 + 操作边
- 参考：`mcp-servers/report-mcp/src/graph.ts`

### Delta-Debug
- ddmin 算法实现
- 参考：`mcp-servers/analyzer-mcp/src/analyze.ts`

### Crash Signature
- 堆栈摘要 + 去重
- 参考：`mcp-servers/analyzer-mcp/src/signature.ts`

---

## 差异分析

| 维度 | app-test-control | TravelAgent |
|---|---|---|
| 测试对象 | 移动端 App | Web 应用 + AI Agent |
| 测试框架 | MCP + mobile-mcp | Vitest + MSW + Playwright |
| 核心能力 | 设备控制 + UI 交互 | HTTP mock + 浏览器自动化 |
| 报告方式 | HTML + 本地看板 | Terminal + CI artifact |

**结论**：虽然测试对象不同，但测试方法论（报告可视化、影响范围测试、去重、精简）是通用的。
