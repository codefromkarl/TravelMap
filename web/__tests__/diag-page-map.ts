import { test } from "@playwright/test";

test("诊断页面地图加载", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    console.log(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    console.log("[PAGE ERROR]", err.message);
    errors.push(err.message);
  });

  await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);

  const info = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    hasApp: !!document.getElementById("app"),
    hasPageMap: !!document.getElementById("page-map"),
    hasMapLeaflet: !!document.getElementById("page-map-leaflet"),
    hasChat: !!document.getElementById("chat"),
    chatHasAgent: !!(document.getElementById("chat") as any)?.agent,
    bodyHtml: document.body.innerHTML.substring(0, 2000),
    scripts: Array.from(document.querySelectorAll("script")).map((s) => ({
      src: (s as HTMLScriptElement).src,
      type: s.getAttribute("type"),
    })),
    modules: Object.keys((window as any)).filter(
      (k) => k.startsWith("_") || k === "L" || k === "process"
    ),
  }));

  console.log("=== 页面诊断 ===");
  console.log(JSON.stringify(info, null, 2));
  console.log("=== 控制台错误 ===");
  errors.forEach((e) => console.log(e));
});
