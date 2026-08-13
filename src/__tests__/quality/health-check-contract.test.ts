import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const HEALTH_CHECK = path.join(PROJECT_ROOT, "scripts", "health-check.sh");
const servers: Server[] = [];

async function startFixtureServer(
  options: { authStatus?: number; chatStatus?: number; rootFailuresBeforeSuccess?: number } = {},
): Promise<{ baseURL: string; requests: string[] }> {
  const requests: string[] = [];
  let rootRequests = 0;
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === "/index.html") {
      response.writeHead(308, { Location: "/" });
      response.end();
      return;
    }
    if (request.url === "/") {
      rootRequests += 1;
      if (rootRequests <= (options.rootFailuresBeforeSuccess ?? 0)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<!doctype html>
<html>
  <head><link rel="stylesheet" href="./styles/main.1234abcd.css"></head>
  <body><script type="module">import "./modules/app.abcdef12.js";</script></body>
</html>`);
      return;
    }
    if (request.url === "/styles/main.1234abcd.css") {
      response.writeHead(200, { "Content-Type": "text/css" });
      response.end("body { color: #123456; }");
      return;
    }
    if (request.url === "/modules/app.abcdef12.js") {
      response.writeHead(200, { "Content-Type": "application/javascript" });
      response.end("export const ready = true;");
      return;
    }
    if (request.url === "/api/chat" && request.method === "OPTIONS") {
      response.writeHead(options.chatStatus ?? 204);
      response.end();
      return;
    }
    if (request.url === "/api/auth/status" && request.method === "OPTIONS") {
      response.writeHead(options.authStatus ?? 204);
      response.end();
      return;
    }
    response.writeHead(404);
    response.end();
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server has no TCP port");
  return { baseURL: `http://127.0.0.1:${address.port}`, requests };
}

async function runHealthCheck(
  baseURL: string,
  retryOptions: { attempts?: number; delaySeconds?: number } = {},
): Promise<{
  status: number | null;
  stderr: string;
  stdout: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [HEALTH_CHECK, baseURL], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        HEALTH_CHECK_MAX_ATTEMPTS: String(retryOptions.attempts ?? 1),
        HEALTH_CHECK_RETRY_DELAY_SECONDS: String(retryOptions.delaySeconds ?? 0),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stderr, stdout }));
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("blocking deployment health check", () => {
  it("uses the canonical root, checks referenced assets, and passes healthy Functions", async () => {
    const fixture = await startFixtureServer();
    const result = await runHealthCheck(fixture.baseURL);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("All blocking smoke checks passed");
    expect(fixture.requests).toContain("GET /");
    expect(fixture.requests).not.toContain("GET /index.html");
    expect(fixture.requests).toContain("GET /styles/main.1234abcd.css");
    expect(fixture.requests).toContain("GET /modules/app.abcdef12.js");
    expect(fixture.requests).toContain("OPTIONS /api/chat");
    expect(fixture.requests).toContain("OPTIONS /api/auth/status");
  });

  it("retries a transient root 404 during deployment propagation", async () => {
    const fixture = await startFixtureServer({ rootFailuresBeforeSuccess: 1 });
    const result = await runHealthCheck(fixture.baseURL, { attempts: 2 });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(fixture.requests.filter((request) => request === "GET /")).toHaveLength(3);
    expect(result.stderr).toContain("Index HTML HTTP 404 (attempt 1/2)");
    expect(result.stdout).toContain("All blocking smoke checks passed");
  });

  it.each([
    { label: "chat", options: { chatStatus: 404 }, expected: "Chat Function preflight" },
    { label: "auth", options: { authStatus: 503 }, expected: "Auth Function preflight" },
  ])("fails when the $label Function is unavailable", async ({ options, expected }) => {
    const fixture = await startFixtureServer(options);
    const result = await runHealthCheck(fixture.baseURL);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(expected);
    expect(result.stdout).toContain(
      `HTTP ${options.chatStatus ?? options.authStatus} after 1 attempt(s)`,
    );
    expect(result.stdout).toContain("blocking smoke check(s) failed");
    expect(result.stdout).not.toContain("All blocking smoke checks passed");
  });
});
