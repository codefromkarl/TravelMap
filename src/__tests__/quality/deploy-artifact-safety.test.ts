import { spawnSync } from "node:child_process";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

type FunctionsBuilderInput = {
  outputDirectory: string;
};

type DeployManifest = {
  artifact_sha256: string;
  files: Array<{ path: string; size: number; sha256: string }>;
};

type BuildDeployArtifactOptions = {
  artifactDirectory: string;
  repoRoot: string;
  functionsBuilder?: (input: FunctionsBuilderInput) => Promise<void>;
};

const builderModuleUrl = new URL("../../../scripts/build-deploy-artifact.mjs", import.meta.url)
  .href;
const hashModuleUrl = new URL("../../../scripts/hash-assets.js", import.meta.url).href;
const validatorModuleUrl = new URL("../../../scripts/validate-deploy-artifact.mjs", import.meta.url)
  .href;

const { buildDeployArtifact } = (await import(builderModuleUrl)) as {
  buildDeployArtifact(options: BuildDeployArtifactOptions): Promise<DeployManifest>;
};
const { hashAssets } = (await import(hashModuleUrl)) as {
  hashAssets(deployDirectory: string): Promise<Array<{ assetPath: string; hashedPath: string }>>;
};
const { ALLOWED_TOP_LEVEL_FILES, validateDeployArtifact } = (await import(validatorModuleUrl)) as {
  ALLOWED_TOP_LEVEL_FILES: readonly string[];
  validateDeployArtifact(artifactDirectory: string): Promise<DeployManifest>;
};

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DEPLOY_SCRIPT = path.join(PROJECT_ROOT, "scripts", "deploy.sh");
const VALIDATOR_CLI = path.join(PROJECT_ROOT, "scripts", "validate-deploy-artifact.mjs");
const tempDirectories: string[] = [];

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function makeFixtureRepo(): Promise<string> {
  const repoRoot = await makeTempDirectory("travelmap-artifact-repo-");
  const webRoot = path.join(repoRoot, "web");
  await mkdir(webRoot, { recursive: true });

  for (const relativePath of ALLOWED_TOP_LEVEL_FILES as readonly string[]) {
    let content = `fixture:${relativePath}\n`;
    if (relativePath === "index.html") {
      content = `<!doctype html>
<html>
  <head>
    <link rel="icon" href="/favicon.svg">
    <link rel="stylesheet" href="./styles/main.css?v=fixture">
  </head>
  <body>
    <a href="/help.html">Help</a>
    <script type="module">import "./modules/app.js?v=fixture";</script>
  </body>
</html>
`;
    } else if (relativePath === "pi-bundle.js") {
      content = "export const bundled = true;\n";
    } else if (relativePath.endsWith(".css")) {
      content = "body { color: #123456; }\n";
    } else if (relativePath.endsWith(".svg")) {
      content = '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n';
    }
    await writeFixtureFile(webRoot, relativePath, content);
  }

  await writeFixtureFile(
    webRoot,
    "modules/app.js",
    'import "./dep.js";\nexport const app = true;\n',
  );
  await writeFixtureFile(webRoot, "modules/dep.js", "export const dep = true;\n");
  await writeFixtureFile(
    webRoot,
    "modules/infra/config.js",
    'try { await import("../../config.local.js"); } catch {}\n',
  );
  await writeFixtureFile(
    webRoot,
    "modules/__tests__/app.test.js",
    "throw new Error('not runtime');\n",
  );
  await writeFixtureFile(webRoot, "styles/main.css", "body { background: #ffffff; }\n");
  await writeFixtureFile(
    webRoot,
    "vendor/leaflet/leaflet.js",
    "/* fixture leaflet */ export const leaflet = true;\n",
  );
  await writeFixtureFile(
    webRoot,
    "vendor/leaflet/leaflet.css",
    "/* fixture leaflet css */ .leaflet-container { color: #123456; }\n",
  );
  await writeFixtureFile(webRoot, "functions/api/chat.js", "export function onRequest() {}\n");
  await writeFixtureFile(webRoot, "entry.ts", "throw new Error('development only');\n");
  await writeFixtureFile(webRoot, "unknown-top-level.txt", "must not deploy\n");
  return repoRoot;
}

async function fakeFunctionsBuilder({ outputDirectory }: FunctionsBuilderInput): Promise<void> {
  await writeFile(
    path.join(outputDirectory, "index.js"),
    'export default { fetch() { return new Response("fixture"); } };\n',
    "utf8",
  );
}

async function buildFixtureArtifact(): Promise<{
  artifactDirectory: string;
  repoRoot: string;
}> {
  const repoRoot = await makeFixtureRepo();
  const artifactDirectory = path.join(
    await makeTempDirectory("travelmap-artifact-output-"),
    "artifact",
  );
  await buildDeployArtifact({
    artifactDirectory,
    repoRoot,
    functionsBuilder: fakeFunctionsBuilder,
  });
  return { artifactDirectory, repoRoot };
}

async function listFiles(root: string): Promise<string[]> {
  const result: string[] = [];

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? path.posix.join(relativeDirectory, entry.name)
        : entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relativePath);
      else result.push(relativePath);
    }
  }

  await visit(root, "");
  return result.sort();
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("deploy artifact allowlist and manifest", () => {
  it("copies only explicit runtime files and the compiled worker", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    const siteDirectory = path.join(artifactDirectory, "site");
    const files = await listFiles(siteDirectory);

    expect(files).toContain("_worker.js");
    expect(files).toContain("modules/app.js");
    expect(files).toContain("modules/dep.js");
    expect(files).toContain("styles/main.css");
    expect(files.some((file) => /^modules\/app\.[0-9a-f]{8}\.js$/.test(file))).toBe(true);
    expect(files.some((file) => /^styles\/main\.[0-9a-f]{8}\.css$/.test(file))).toBe(true);
    expect(files).not.toContain("entry.ts");
    expect(files).not.toContain("unknown-top-level.txt");
    expect(files).not.toContain("modules/__tests__/app.test.js");
    expect(files.some((file) => file.startsWith("functions/"))).toBe(false);
  });

  it("produces byte-stable manifests for identical inputs", async () => {
    const first = await buildFixtureArtifact();
    const second = await buildFixtureArtifact();

    const firstManifest = await readFile(
      path.join(first.artifactDirectory, "manifest.json"),
      "utf8",
    );
    const secondManifest = await readFile(
      path.join(second.artifactDirectory, "manifest.json"),
      "utf8",
    );
    expect(secondManifest).toBe(firstManifest);
  });

  it("fully revalidates a downloaded artifact copy", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    const downloadDirectory = path.join(
      await makeTempDirectory("travelmap-artifact-download-"),
      "download",
    );
    await cp(artifactDirectory, downloadDirectory, { recursive: true });

    const manifest = await validateDeployArtifact(downloadDirectory);
    expect(manifest.artifact_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files.map((file: { path: string }) => file.path)).toContain("_worker.js");
  });

  it("rejects non-empty artifact output directories", async () => {
    const repoRoot = await makeFixtureRepo();
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-artifact-nonempty-"),
      "artifact",
    );
    await mkdir(artifactDirectory);
    await writeFile(path.join(artifactDirectory, "stale.txt"), "stale\n", "utf8");

    await expect(
      buildDeployArtifact({ artifactDirectory, repoRoot, functionsBuilder: fakeFunctionsBuilder }),
    ).rejects.toThrow("[ARTIFACT_NOT_EMPTY]");
  });
});

describe("deploy artifact fail-closed build stages", () => {
  it("fails when the Functions builder fails and does not write a manifest", async () => {
    const repoRoot = await makeFixtureRepo();
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-functions-fail-"),
      "artifact",
    );

    await expect(
      buildDeployArtifact({
        artifactDirectory,
        repoRoot,
        functionsBuilder: async () => {
          throw new Error("fixture functions failure");
        },
      }),
    ).rejects.toThrow("fixture functions failure");
    await expect(access(path.join(artifactDirectory, "manifest.json"))).rejects.toThrow();
  });

  it("fails when the Functions builder returns without a worker", async () => {
    const repoRoot = await makeFixtureRepo();
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-functions-empty-"),
      "artifact",
    );

    await expect(
      buildDeployArtifact({ artifactDirectory, repoRoot, functionsBuilder: async () => {} }),
    ).rejects.toThrow("[FUNCTIONS_OUTPUT_MISSING]");
  });

  it("removes the fresh Functions build directory after a builder failure", async () => {
    const repoRoot = await makeFixtureRepo();
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-functions-cleanup-"),
      "artifact",
    );
    let functionsOutputDirectory = "";

    await expect(
      buildDeployArtifact({
        artifactDirectory,
        repoRoot,
        functionsBuilder: async ({ outputDirectory }) => {
          functionsOutputDirectory = outputDirectory;
          throw new Error("fixture functions failure");
        },
      }),
    ).rejects.toThrow("fixture functions failure");
    expect(functionsOutputDirectory).not.toBe("");
    await expect(access(functionsOutputDirectory)).rejects.toThrow();
  });

  it("rejects additional Functions build outputs instead of silently dropping modules", async () => {
    const repoRoot = await makeFixtureRepo();
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-functions-extra-"),
      "artifact",
    );

    await expect(
      buildDeployArtifact({
        artifactDirectory,
        repoRoot,
        functionsBuilder: async ({ outputDirectory }) => {
          await writeFile(path.join(outputDirectory, "index.js"), "export default {};\n", "utf8");
          await writeFile(path.join(outputDirectory, "extra.js"), "export const extra = true;\n");
        },
      }),
    ).rejects.toThrow("[FUNCTIONS_OUTPUT_UNEXPECTED] extra.js");
  });

  it("rejects an empty Functions entrypoint", async () => {
    const repoRoot = await makeFixtureRepo();
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-functions-empty-file-"),
      "artifact",
    );

    await expect(
      buildDeployArtifact({
        artifactDirectory,
        repoRoot,
        functionsBuilder: async ({ outputDirectory }) => {
          await writeFile(path.join(outputDirectory, "index.js"), "", "utf8");
        },
      }),
    ).rejects.toThrow("[FUNCTIONS_OUTPUT_INVALID] index.js");
  });

  it("rejects a symlinked Functions entrypoint", async () => {
    const repoRoot = await makeFixtureRepo();
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-functions-symlink-"),
      "artifact",
    );

    await expect(
      buildDeployArtifact({
        artifactDirectory,
        repoRoot,
        functionsBuilder: async ({ outputDirectory }) => {
          await symlink(
            path.join(repoRoot, "web", "pi-bundle.js"),
            path.join(outputDirectory, "index.js"),
          );
        },
      }),
    ).rejects.toThrow("[FUNCTIONS_OUTPUT_SYMLINK] index.js");
  });

  it("rejects multipart worker bundle content before writing a manifest", async () => {
    const repoRoot = await makeFixtureRepo();
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-functions-multipart-"),
      "artifact",
    );

    await expect(
      buildDeployArtifact({
        artifactDirectory,
        repoRoot,
        functionsBuilder: async ({ outputDirectory }) => {
          await writeFile(
            path.join(outputDirectory, "index.js"),
            '------formdata-undici-fixture\r\nContent-Disposition: form-data; name="metadata"\r\n',
          );
        },
      }),
    ).rejects.toThrow("[WORKER_MULTIPART_BOUNDARY] _worker.js");
    await expect(access(path.join(artifactDirectory, "manifest.json"))).rejects.toThrow();
  });

  it("builds normal JavaScript with the repository-pinned Wrangler", async () => {
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-real-functions-"),
      "artifact",
    );

    const manifest = await buildDeployArtifact({ artifactDirectory, repoRoot: PROJECT_ROOT });
    const workerPath = path.join(artifactDirectory, "site", "_worker.js");
    const worker = await readFile(workerPath, "utf8");
    const syntaxCheck = spawnSync(process.execPath, ["--check", workerPath], { encoding: "utf8" });

    expect(manifest.files.map((file) => file.path)).toContain("_worker.js");
    expect(worker).not.toContain("Content-Disposition: form-data");
    expect(worker).not.toContain('name="metadata"');
    expect(worker).toMatch(/\bexport\s*\{/);
    expect(syntaxCheck.status, syntaxCheck.stderr).toBe(0);
  });

  it("fails hashing before writes when an index reference is missing", async () => {
    const siteDirectory = await makeTempDirectory("travelmap-hash-missing-");
    await writeFile(
      path.join(siteDirectory, "index.html"),
      '<link rel="stylesheet" href="./styles/missing.css">\n',
      "utf8",
    );

    await expect(hashAssets(siteDirectory)).rejects.toThrow(
      "[HASH_MISSING_REFERENCE] styles/missing.css",
    );
    expect(await listFiles(siteDirectory)).toEqual(["index.html"]);
  });

  it("fails complete revalidation after an allowed file is changed", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    await writeFile(
      path.join(artifactDirectory, "site", "modules", "dep.js"),
      "export const dep = false;\n",
    );

    await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow(
      "[MANIFEST_FILE_MISMATCH]",
    );
  });

  it("fails reference closure when a local import is missing", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    await writeFile(
      path.join(artifactDirectory, "site", "modules", "dep.js"),
      'import "./missing.js";\n',
      "utf8",
    );

    await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow("[REFERENCE_MISSING]");
  });

  it("still checks dynamic imports that follow a URL string", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    await writeFile(
      path.join(artifactDirectory, "site", "modules", "dep.js"),
      'const endpoint = "https://example.invalid"; import("./missing.js");\n',
      "utf8",
    );

    await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow(
      "[REFERENCE_MISSING] modules/dep.js -> modules/missing.js",
    );
  });
});

describe("deploy artifact path, secret, and source-map scan", () => {
  it("keeps every runtime .dev.vars variant out of the Git index", () => {
    const tracked = spawnSync("git", ["ls-files", "-z"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });
    expect(tracked.status, tracked.stderr).toBe(0);
    const forbiddenTrackedPaths = tracked.stdout
      .split("\0")
      .filter(
        (file) => /(^|\/)\.dev\.vars(?:\..*)?$/.test(file) && !file.endsWith(".dev.vars.example"),
      );
    expect(forbiddenTrackedPaths).toEqual([]);

    for (const candidate of [
      ".dev.vars",
      ".dev.vars.local",
      "web/.dev.vars",
      "web/.dev.vars.preview",
    ]) {
      const ignored = spawnSync("git", ["check-ignore", "--no-index", "--quiet", candidate], {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
      });
      expect(ignored.status, `${candidate} must remain ignored`).toBe(0);
    }
  });

  it.each([".dev.vars", ".env.production", "modules/.dev.vars.local", "modules/config.local.js"])(
    "rejects forbidden path %s",
    async (relativePath) => {
      const { artifactDirectory } = await buildFixtureArtifact();
      await writeFixtureFile(
        path.join(artifactDirectory, "site"),
        relativePath,
        "synthetic fixture\n",
      );

      await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow(
        /\[PATH_(?:ENV_FILE|LOCAL_CONFIG)\]/,
      );
    },
  );

  it("rejects source-map files", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    await writeFixtureFile(
      path.join(artifactDirectory, "site"),
      "modules/app.js.map",
      '{"version":3,"sourcesContent":[]}\n',
    );

    await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow("[PATH_SOURCE_MAP]");
  });

  it("rejects inline source-map markers in allowlisted files", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    await writeFile(
      path.join(artifactDirectory, "site", "modules", "dep.js"),
      "//# sourceMappingURL=dep.js.map\n",
      "utf8",
    );

    await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow(
      "[SOURCE_MAP_REFERENCE]",
    );
  });

  it.each([
    ["WORKER_MULTIPART_BOUNDARY", "------formdata-undici-fixture\nexport default {};\n"],
    ["WORKER_MULTIPART_CONTENT_DISPOSITION", "Content-Disposition: form-data\n"],
    ["WORKER_MULTIPART_METADATA", "const marker = 'name=\"metadata\"';\n"],
  ])("rejects %s markers in _worker.js", async (ruleId, workerContent) => {
    const { artifactDirectory } = await buildFixtureArtifact();
    await writeFile(path.join(artifactDirectory, "site", "_worker.js"), workerContent, "utf8");

    await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow(
      `[${ruleId}] _worker.js`,
    );
  });

  it("rejects synthetic token shapes without echoing the matched value", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    const syntheticToken = "sk-fixtureonly0123456789abcdefghijkl";
    const targetPath = path.join(artifactDirectory, "site", "modules", "dep.js");
    await writeFile(targetPath, `export const value = "${syntheticToken}";\n`, "utf8");

    const result = spawnSync(process.execPath, [VALIDATOR_CLI, artifactDirectory], {
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[SECRET_OPENAI_ANTHROPIC_TOKEN] modules/dep.js");
    expect(result.stderr).not.toContain(syntheticToken);
    expect(result.stdout).not.toContain(syntheticToken);
  });

  it("allows named protocol identifiers used by the pi bundle", async () => {
    const repoRoot = await makeFixtureRepo();
    await writeFixtureFile(
      path.join(repoRoot, "web"),
      "pi-bundle.js",
      `/** @typedef { import("./html_renderer").Renderer } Renderer */
export const schema = { clientSecret: "client_secret" };
`,
    );
    const artifactDirectory = path.join(
      await makeTempDirectory("travelmap-protocol-identifier-"),
      "artifact",
    );

    await expect(
      buildDeployArtifact({ artifactDirectory, repoRoot, functionsBuilder: fakeFunctionsBuilder }),
    ).resolves.toMatchObject({ artifact_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("still rejects long synthetic named secret assignments", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    const syntheticSecret = "fixtureClientSecretValue0123456789abcdef";
    await writeFile(
      path.join(artifactDirectory, "site", "pi-bundle.js"),
      `export const schema = { clientSecret: "${syntheticSecret}" };\n`,
      "utf8",
    );

    await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow(
      "[SECRET_NAMED_ASSIGNMENT] pi-bundle.js",
    );
  });

  it("rejects symlinks inside the site", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    await symlink("dep.js", path.join(artifactDirectory, "site", "modules", "linked.js"));

    await expect(validateDeployArtifact(artifactDirectory)).rejects.toThrow("[PATH_SYMLINK]");
  });
});

describe("deploy shell artifact contract", () => {
  const syntheticSourceSha = "0123456789abcdef0123456789abcdef01234567";

  async function makeFakeWrangler(): Promise<{ callsFile: string; executable: string }> {
    const fakeRoot = await makeTempDirectory("travelmap-fake-wrangler-");
    const executable = path.join(fakeRoot, "wrangler");
    const callsFile = path.join(fakeRoot, "calls.txt");
    await writeFile(
      executable,
      `#!/usr/bin/env bash
set -euo pipefail
: "\${CLOUDFLARE_API_TOKEN:?missing token}"
[[ "\${CLOUDFLARE_ACCOUNT_ID:-}" == "df7eff124c99996394244b7e94324ffc" ]]
printf '%s\\n' "$@" > "\${TRAVEL_FAKE_WRANGLER_CALLS:?}"
printf '%s\\n' "\${TRAVEL_FAKE_WRANGLER_OUTPUT:?}"
`,
      "utf8",
    );
    await chmod(executable, 0o755);
    return { callsFile, executable };
  }

  it.each([
    { args: [] as string[], branch: "main" },
    { args: ["preview"], branch: "preview" },
  ])("builds a temporary artifact before the $branch deployment", async ({ args, branch }) => {
    const { callsFile, executable } = await makeFakeWrangler();
    const fakeHome = await makeTempDirectory("travelmap-deploy-home-");
    const wranglerConfig = await makeTempDirectory("travelmap-wrangler-config-");

    const result = spawnSync("bash", [DEPLOY_SCRIPT, ...args], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: fakeHome,
        XDG_CONFIG_HOME: wranglerConfig,
        TRAVEL_DEPLOY_TEST_MODE: "1",
        TRAVEL_DEPLOY_TOKEN: "synthetic-deploy-token",
        DEPLOY_SOURCE_SHA: syntheticSourceSha,
        TRAVEL_FAKE_WRANGLER_CALLS: callsFile,
        TRAVEL_FAKE_WRANGLER_OUTPUT:
          "Deployment complete: https://fixture-hash.travel-agent.pages.dev",
        TRAVEL_TEST_WRANGLER_BIN: executable,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    const calls = (await readFile(callsFile, "utf8")).trim().split("\n");
    expect(calls.slice(0, 2)).toEqual(["pages", "deploy"]);
    expect(calls[2]).toMatch(/\/travelmap-deploy-artifact\.[^/]+\/site$/);
    expect(calls.slice(3)).toEqual([
      "--project-name=travel-agent",
      `--branch=${branch}`,
      `--commit-hash=${syntheticSourceSha}`,
    ]);
  });

  it("revalidates and deploys only artifact/site with an isolated PR branch", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    const { callsFile, executable } = await makeFakeWrangler();
    const githubOutput = path.join(await makeTempDirectory("travelmap-github-output-"), "output");
    const fakeHome = await makeTempDirectory("travelmap-deploy-home-");
    const deploymentUrl = "https://fixture-hash.travel-agent.pages.dev";

    const result = spawnSync(
      "bash",
      [DEPLOY_SCRIPT, "--artifact", artifactDirectory, "--branch", "pr-42"],
      {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: fakeHome,
          GITHUB_OUTPUT: githubOutput,
          TRAVEL_DEPLOY_TEST_MODE: "1",
          TRAVEL_DEPLOY_TOKEN: "synthetic-deploy-token",
          DEPLOY_SOURCE_SHA: syntheticSourceSha,
          TRAVEL_FAKE_WRANGLER_CALLS: callsFile,
          TRAVEL_FAKE_WRANGLER_OUTPUT: `Deployment complete: ${deploymentUrl}`,
          TRAVEL_TEST_WRANGLER_BIN: executable,
        },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect((await readFile(callsFile, "utf8")).trim().split("\n")).toEqual([
      "pages",
      "deploy",
      path.join(artifactDirectory, "site"),
      "--project-name=travel-agent",
      "--branch=pr-42",
      `--commit-hash=${syntheticSourceSha}`,
    ]);
    expect(await readFile(githubOutput, "utf8")).toBe(`deployment_url=${deploymentUrl}\n`);
  });

  it("refuses a GitHub Actions deploy without the validated source SHA", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    const { callsFile, executable } = await makeFakeWrangler();
    const fakeHome = await makeTempDirectory("travelmap-deploy-home-");

    const result = spawnSync(
      "bash",
      [DEPLOY_SCRIPT, "--artifact", artifactDirectory, "--branch", "main"],
      {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: fakeHome,
          GITHUB_ACTIONS: "true",
          TRAVEL_DEPLOY_TEST_MODE: "1",
          TRAVEL_DEPLOY_TOKEN: "synthetic-deploy-token",
          TRAVEL_FAKE_WRANGLER_CALLS: callsFile,
          TRAVEL_FAKE_WRANGLER_OUTPUT:
            "Deployment complete: https://fixture-hash.travel-agent.pages.dev",
          TRAVEL_TEST_WRANGLER_BIN: executable,
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DEPLOY_SOURCE_SHA");
    await expect(access(callsFile)).rejects.toThrow();
  });

  it("rejects a pages.dev lookalike from Wrangler output", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    const { callsFile, executable } = await makeFakeWrangler();
    const githubOutput = path.join(await makeTempDirectory("travelmap-invalid-output-"), "output");
    const fakeHome = await makeTempDirectory("travelmap-deploy-home-");

    const result = spawnSync(
      "bash",
      [DEPLOY_SCRIPT, "--artifact", artifactDirectory, "--branch", "preview"],
      {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: fakeHome,
          GITHUB_OUTPUT: githubOutput,
          TRAVEL_DEPLOY_TEST_MODE: "1",
          TRAVEL_DEPLOY_TOKEN: "synthetic-deploy-token",
          DEPLOY_SOURCE_SHA: syntheticSourceSha,
          TRAVEL_FAKE_WRANGLER_CALLS: callsFile,
          TRAVEL_FAKE_WRANGLER_OUTPUT:
            "Deployment complete: https://fixture.travel-agent.pages.dev.evil.example",
          TRAVEL_TEST_WRANGLER_BIN: executable,
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("非法 pages.dev URL");
    await expect(access(githubOutput)).rejects.toThrow();
  });

  it("rejects artifact deployment without a valid source SHA", async () => {
    const { artifactDirectory } = await buildFixtureArtifact();
    const { callsFile, executable } = await makeFakeWrangler();
    const fakeHome = await makeTempDirectory("travelmap-deploy-home-");

    const result = spawnSync(
      "bash",
      [DEPLOY_SCRIPT, "--artifact", artifactDirectory, "--branch", "preview"],
      {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: fakeHome,
          DEPLOY_SOURCE_SHA: "not-a-sha",
          TRAVEL_DEPLOY_TEST_MODE: "1",
          TRAVEL_DEPLOY_TOKEN: "synthetic-deploy-token",
          TRAVEL_FAKE_WRANGLER_CALLS: callsFile,
          TRAVEL_FAKE_WRANGLER_OUTPUT:
            "Deployment complete: https://fixture-hash.travel-agent.pages.dev",
          TRAVEL_TEST_WRANGLER_BIN: executable,
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("部署必须提供合法的 source SHA");
    await expect(access(callsFile)).rejects.toThrow();
  });
});
