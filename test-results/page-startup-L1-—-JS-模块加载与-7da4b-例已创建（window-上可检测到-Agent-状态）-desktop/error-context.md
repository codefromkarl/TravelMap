# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: page-startup.spec.ts >> L1 — JS 模块加载与初始化 >> Agent 实例已创建（window 上可检测到 Agent 状态）
- Location: web/__tests__/page-startup.spec.ts:270:3

# Error details

```
Error: locator.waitFor: Target page, context or browser has been closed
Call log:
  - waiting for locator('#loading') to be hidden
    34 × locator resolved to visible <div id="loading">正在初始化...</div>

```

```
Error: write EPIPE
```