# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: page-startup.spec.ts >> L1 — JS 模块加载与初始化 >> JS 模块加载完成：loading 提示消失
- Location: web/__tests__/page-startup.spec.ts:211:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: JS 未在 30s 内完成加载，#loading 未被移除

expect(locator).toHaveCount(expected) failed

Locator:  locator('#loading')
Expected: 0
Received: 1

Call log:
  - JS 未在 30s 内完成加载，#loading 未被移除 with timeout 30000ms
  - waiting for locator('#loading')
    61 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - heading "🌍 旅途星辰" [level=1] [ref=e4]
    - generic [ref=e5]: AI 旅行规划助手
  - generic [ref=e7]: 正在初始化...
```

# Test source

```ts
  117 |     const analysis = await page.evaluate(() => {
  118 |       // 从 importmap 收集所有映射的裸标识符
  119 |       const mapScript = document.querySelector('script[type="importmap"]');
  120 |       const map = mapScript ? JSON.parse(mapScript.textContent || "{}") : { imports: {} };
  121 |       const mappedKeys = new Set(Object.keys(map.imports || {}));
  122 | 
  123 |       // 扫描所有 module script 中的 import 语句
  124 |       const moduleScripts = document.querySelectorAll('script[type="module"]');
  125 |       const bareImports: string[] = [];
  126 |       const missingMappings: string[] = [];
  127 | 
  128 |       // 匹配 import ... from "xxx" 和 import "xxx"
  129 |       const importRe = /(?:import\s+.*?\s+from\s+|import\s+)["']([^"']+)["']/g;
  130 | 
  131 |       moduleScripts.forEach((script) => {
  132 |         const code = script.textContent || "";
  133 |         let match: RegExpExecArray | null;
  134 |         while ((match = importRe.exec(code)) !== null) {
  135 |           const spec = match[1];
  136 |           // 只关注裸标识符（非 URL、非相对路径）
  137 |           if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("http")) {
  138 |             bareImports.push(spec);
  139 |             // 检查 importmap 中是否有精确匹配或前缀包名匹配
  140 |             if (!mappedKeys.has(spec)) {
  141 |               // 对于 @scope/pkg/subpath，也检查 @scope/pkg 是否映射
  142 |               const pkgRoot = spec.split("/").slice(0, 2).join("/");
  143 |               if (!mappedKeys.has(pkgRoot)) {
  144 |                 missingMappings.push(spec);
  145 |               }
  146 |             }
  147 |           }
  148 |         }
  149 |       });
  150 | 
  151 |       // 同时检查 <link> 标签引用的 CSS（不应该在 importmap 中）
  152 |       const linkHrefs: string[] = [];
  153 |       document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
  154 |         linkHrefs.push(link.getAttribute("href") || "");
  155 |       });
  156 | 
  157 |       return {
  158 |         bareImports: [...new Set(bareImports)],
  159 |         missingMappings: [...new Set(missingMappings)],
  160 |         mappedKeys: [...mappedKeys],
  161 |         linkHrefs,
  162 |       };
  163 |     });
  164 | 
  165 |     // 关键断言：裸标识符必须全部有映射
  166 |     expect(
  167 |       analysis.missingMappings,
  168 |       `以下裸标识符在 importmap 中没有映射: ${analysis.missingMappings.join(", ")}`,
  169 |     ).toEqual([]);
  170 | 
  171 |     // 同时报告发现的所有裸标识符，便于 review
  172 |     console.log("[L0] importmap 映射:", analysis.mappedKeys);
  173 |     console.log("[L0] 页面裸标识符 import:", analysis.bareImports);
  174 |     console.log("[L0] <link> CSS:", analysis.linkHrefs);
  175 |   });
  176 | 
  177 |   test("不应对 CSS 文件使用 importmap 映射（CSS 不能作为 JS module 加载）", async ({ page }) => {
  178 |     await page.goto("index.html");
  179 | 
  180 |     const cssInImportMap = await page.evaluate(() => {
  181 |       const mapScript = document.querySelector('script[type="importmap"]');
  182 |       const map = mapScript ? JSON.parse(mapScript.textContent || "{}") : { imports: {} };
  183 |       return Object.keys(map.imports || {}).filter((key) => key.endsWith(".css"));
  184 |     });
  185 | 
  186 |     expect(
  187 |       cssInImportMap,
  188 |       `importmap 中不应包含 .css 映射: ${cssInImportMap.join(", ")}`,
  189 |     ).toEqual([]);
  190 |   });
  191 | 
  192 |   test("初始无 JS 错误", async ({ page }) => {
  193 |     const errors = collectErrors(page);
  194 |     await page.goto("index.html");
  195 |     await page.waitForTimeout(500);
  196 | 
  197 |     const critical = errors.getCriticalErrors();
  198 |     expect(
  199 |       critical,
  200 |       `页面加载时出现非预期 JS 错误:\n${critical.join("\n")}`,
  201 |     ).toEqual([]);
  202 |   });
  203 | });
  204 | 
  205 | // ─── L1: JS 模块加载与初始化（需要网络） ──────────────────────
  206 | 
  207 | test.describe("L1 — JS 模块加载与初始化", () => {
  208 |   // L1 测试需要能访问 esm.sh，标记 @network
  209 |   test.skip(({ browserName }) => browserName !== "chromium", "L1 只在 Chromium 下运行");
  210 | 
  211 |   test("JS 模块加载完成：loading 提示消失", async ({ page }) => {
  212 |     const errors = collectErrors(page);
  213 |     await page.goto("index.html");
  214 | 
  215 |     // JS 执行成功后会 remove #loading，给充足超时等 esm.sh 加载
  216 |     const loading = page.locator("#loading");
> 217 |     await expect(loading, "JS 未在 30s 内完成加载，#loading 未被移除").toHaveCount(0, {
      |                                                            ^ Error: JS 未在 30s 内完成加载，#loading 未被移除
  218 |       timeout: 30_000,
  219 |     });
  220 | 
  221 |     // loading 消失后检查是否有 JS 错误
  222 |     const critical = errors.getCriticalErrors();
  223 |     expect(
  224 |       critical,
  225 |       `JS 加载完成但有错误:\n${critical.join("\n")}`,
  226 |     ).toEqual([]);
  227 |   });
  228 | 
  229 |   test("ChatPanel 组件渲染完成（shadowRoot 已挂载）", async ({ page }) => {
  230 |     await page.goto("index.html");
  231 | 
  232 |     // 等待 JS 加载完成
  233 |     await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });
  234 | 
  235 |     const shadowReady = await page.evaluate(() => {
  236 |       const panel = document.querySelector("chat-panel");
  237 |       return {
  238 |         exists: !!panel,
  239 |         hasShadowRoot: !!panel?.shadowRoot,
  240 |         shadowChildCount: panel?.shadowRoot?.childElementCount ?? 0,
  241 |       };
  242 |     });
  243 | 
  244 |     expect(shadowReady.exists, "chat-panel 元素不存在").toBe(true);
  245 |     expect(shadowReady.hasShadowRoot, "chat-panel 的 shadowRoot 未挂载").toBe(true);
  246 |     expect(shadowReady.shadowChildCount, "chat-panel shadowRoot 为空").toBeGreaterThan(0);
  247 |   });
  248 | 
  249 |   test("无 module 加载失败的 console error", async ({ page }) => {
  250 |     const errors = collectErrors(page);
  251 |     await page.goto("index.html");
  252 | 
  253 |     await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });
  254 | 
  255 |     // 专门检测模块加载类错误
  256 |     const moduleErrors = [...errors.pageErrors, ...errors.consoleErrors].filter(
  257 |       (e) =>
  258 |         e.includes("Failed to resolve module specifier") ||
  259 |         e.includes("Expected a JavaScript") ||
  260 |         e.includes("MIME type") ||
  261 |         e.includes("Failed to load module script"),
  262 |     );
  263 | 
  264 |     expect(
  265 |       moduleErrors,
  266 |       `模块加载错误:\n${moduleErrors.join("\n")}`,
  267 |     ).toEqual([]);
  268 |   });
  269 | 
  270 |   test("Agent 实例已创建（window 上可检测到 Agent 状态）", async ({ page }) => {
  271 |     await page.goto("index.html");
  272 |     await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });
  273 | 
  274 |     // 验证 agent 初始化 — ChatPanel 的 setAgent 应该已经调用
  275 |     const agentState = await page.evaluate(() => {
  276 |       const panel = document.querySelector("chat-panel");
  277 |       if (!panel?.shadowRoot) return { ready: false, reason: "no shadowRoot" };
  278 | 
  279 |       // ChatPanel 渲染后应该有内部结构（输入框、消息列表等）
  280 |       const shadow = panel.shadowRoot;
  281 |       return {
  282 |         ready: true,
  283 |         hasInput: shadow.querySelectorAll("input, textarea, [contenteditable]").length > 0,
  284 |         innerHTML: shadow.innerHTML.substring(0, 200),
  285 |       };
  286 |     });
  287 | 
  288 |     expect(agentState.ready, agentState.reason || "Agent 未初始化").toBe(true);
  289 |   });
  290 | });
  291 | 
  292 | // ─── L2: 用户可交互（完整流程） ──────────────────────────────
  293 | 
  294 | test.describe("L2 — 用户可交互", () => {
  295 |   test.skip(({ browserName }) => browserName !== "chromium", "L2 只在 Chromium 下运行");
  296 | 
  297 |   test("用户可以看到聊天输入区域", async ({ page }) => {
  298 |     await page.goto("index.html");
  299 |     await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });
  300 | 
  301 |     // ChatPanel 中应有可输入的元素
  302 |     const inputReady = await page.evaluate(() => {
  303 |       const panel = document.querySelector("chat-panel");
  304 |       if (!panel?.shadowRoot) return false;
  305 | 
  306 |       const shadow = panel.shadowRoot;
  307 |       const input =
  308 |         shadow.querySelector("textarea") ||
  309 |         shadow.querySelector("input[type='text']") ||
  310 |         shadow.querySelector("[contenteditable='true']");
  311 | 
  312 |       return !!input;
  313 |     });
  314 | 
  315 |     expect(inputReady, "ChatPanel 中未找到输入元素").toBe(true);
  316 |   });
  317 | });
```