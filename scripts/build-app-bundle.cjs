const esbuild = require("esbuild");

// Node.js 内置模块 stub（与 build-bundle.cjs 相同的策略，防御性引入）
const STUBS = {
  "node:crypto": ["randomUUID", "createHash", "randomBytes"],
  "node:fs": ["readFileSync", "writeFileSync", "existsSync"],
  "node:path": ["join", "resolve", "dirname", "basename", "relative", "sep", "delimiter", "extname", "normalize"],
  "node:process": ["default"],
  "process": ["default"],
  "node:util": ["promisify"],
};

const buildPlugin = {
  name: "node-stubs",
  setup(build) {
    build.onResolve({ filter: /^(node:|process$)/ }, (args) => ({
      path: args.path,
      namespace: "node-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "node-stub" }, (args) => {
      const names = STUBS[args.path] || [];
      const lines = ["// Node.js stub for browser"];
      for (const name of names) {
        if (name === "default") lines.push("export default {};");
        else lines.push(`export const ${name} = () => ({});`);
      }
      if (lines.length === 1) lines.push("export default {};");
      return { contents: lines.join("\n"), loader: "js" };
    });
  },
};

// pi 生态包由 importmap 在运行时解析（pi-bundle.js），不打包进应用 bundle
const EXTERNAL = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-web-ui",
  "lit",
];

/** 构建应用 bundle（浏览器启动逻辑 + 业务模块）。 */
async function buildAppBundle({ outfile = "web/app.bundle.js", minify = true } = {}) {
  await esbuild.build({
    entryPoints: ["web/modules/app-entry.js"],
    bundle: true,
    format: "esm",
    outfile,
    platform: "browser",
    target: "es2022",
    external: EXTERNAL,
    plugins: [buildPlugin],
    minify,
    legalComments: "none",
    charset: "utf8",
    logLevel: "info",
  });
  return outfile;
}

if (require.main === module) {
  const outfileArg = process.argv[2];
  buildAppBundle({ outfile: outfileArg }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { buildAppBundle, EXTERNAL };
