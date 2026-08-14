const esbuild = require("esbuild");

// 所有 Node.js named imports 的完整列表
// 来源: pi-agent-core + pi-ai 的 dist 文件
const STUBS = {
  "node:child_process": ["spawn", "spawnSync", "exec", "execSync", "fork", "execFile"],
  "node:crypto": ["randomUUID", "randomBytes", "createHash", "createCipheriv", "createDecipheriv", "pbkdf2Sync", "scryptSync"],
  "node:fs": ["constants", "createReadStream", "createWriteStream", "readFileSync", "copyFileSync", "existsSync", "mkdirSync", "writeFileSync", "readdirSync", "rmSync", "statSync", "realpathSync", "accessSync", "watch", "openSync", "closeSync", "readSync", "writeSync", "unlinkSync", "renameSync"],
  "node:fs/promises": ["access", "lstat", "mkdir", "mkdtemp", "readdir", "readFile", "realpath", "rm", "writeFile", "appendFile", "stat", "unlink", "open", "copyFile", "rename"],
  "node:os": ["tmpdir", "homedir", "platform", "cpus", "totalmem", "freemem", "hostname", "networkInterfaces", "type", "release", "arch", "EOL"],
  "node:path": ["isAbsolute", "join", "resolve", "dirname", "basename", "relative", "sep", "delimiter", "extname", "normalize", "parse", "format"],
  "node:readline": ["createInterface", "clearLine", "cursorTo", "moveCursor"],
  "node:events": ["EventEmitter"],
  "node:stream": ["Readable", "Writable", "Duplex", "Transform", "PassThrough", "pipeline", "finished"],
  "node:stream/promises": ["pipeline"],
  "node:module": ["createRequire"],
  "node:url": ["fileURLToPath", "pathToFileURL", "URL"],
  "node:string_decoder": ["StringDecoder"],
  "node:perf_hooks": ["performance"],
  "node:buffer": ["Buffer"],
  "node:async_hooks": ["createHook", "executionAsyncId"],
  "node:util": ["promisify", "callbackify", "inspect", "format", "types"],
  "node:http": ["request", "get", "createServer", "Agent", "IncomingMessage", "ServerResponse"],
  "node:https": ["request", "get", "createServer", "Agent"],
  "node:net": ["createConnection", "createServer", "Socket"],
  "node:tty": ["isatty", "ReadStream", "WriteStream"],
  "node:process": ["default"],
  "node:zlib": ["createGzip", "createGunzip", "createDeflate", "createInflate"],
  "process": ["default"],
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
        if (name === "default") {
          lines.push("export default {};");
        } else if (name === "constants") {
          lines.push("export const constants = { O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };");
        } else if (name === "sep") {
          lines.push("export const sep = '/';");
        } else if (name === "delimiter") {
          lines.push("export const delimiter = ':';");
        } else if (name === "EOL") {
          lines.push("export const EOL = '\\n';");
        } else if (["EventEmitter", "Readable", "Writable", "Duplex", "Transform", "PassThrough", "StringDecoder", "Buffer", "URL", "IncomingMessage", "ServerResponse", "Agent", "Socket"].includes(name)) {
          lines.push(`export const ${name} = class ${name} { constructor() {} on() {} emit() {} pipe() {} write() {} end() {} read() {} };`);
        } else if (name === "performance") {
          lines.push("export const performance = typeof globalThis !== 'undefined' ? globalThis.performance : { now: () => Date.now() };");
        } else {
          lines.push(`export const ${name} = () => ({});`);
        }
      }
      if (lines.length === 1) lines.push("export default {};");
      return { contents: lines.join("\n"), loader: "js" };
    });
  },
};

/** 构建 pi 运行时 bundle（浏览器 importmap 目标）。 */
async function buildPiBundle({ outfile = "web/pi-bundle.js", minify = true } = {}) {
  await esbuild.build({
    entryPoints: ["web/entry.ts"],
    bundle: true,
    format: "esm",
    outfile,
    platform: "browser",
    target: "es2022",
    plugins: [buildPlugin],
    minify,
    legalComments: "none",
    charset: "utf8",
    logLevel: "info",
    // 生产构建：压缩；可被 CI 以 --minify=false 复现调试
  });
  return outfile;
}

if (require.main === module) {
  const outfileArg = process.argv[2];
  if (outfileArg === "--minify=false") {
    buildPiBundle({ minify: false }).catch((e) => { console.error(e); process.exit(1); });
  } else {
    buildPiBundle({ outfile: outfileArg }).catch((e) => { console.error(e); process.exit(1); });
  }
}

module.exports = { buildPiBundle };
