# Implementation Plan

1. 建立共享的 Function 安全辅助函数：同源检查、必需配置、认证与安全错误响应。
2. 重写 `/api/chat`：固定 provider/model/upstream，接入认证、KV 分钟限流与日额度、输入限制、超时和脱敏错误。
3. 恢复浏览器认证状态与 401 处理，确保生产请求仅走同源代理。
4. 移除当前树中的密钥文件和浏览器硬编码 Key，补充占位示例与 ignore。
5. 加固部署产物复制/扫描，使敏感文件检测 fail closed。
6. 收紧 JWT 缺失和 OAuth redirect 行为，防止认证链降级。
7. 更新并运行 scoped Vitest；运行部署产物静态安全检查。
8. 使用 `trellis-check` 复核 diff、数据流、错误路径和实际测试结果。
