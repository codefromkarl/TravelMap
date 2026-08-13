import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CI_PATH = path.join(PROJECT_ROOT, ".github", "workflows", "ci.yml");
const DEPLOY_PATH = path.join(PROJECT_ROOT, ".github", "workflows", "deploy.yml");
const PLAYWRIGHT_PATH = path.join(PROJECT_ROOT, "playwright.config.ts");
const PACKAGE_PATH = path.join(PROJECT_ROOT, "package.json");
const NVMRC_PATH = path.join(PROJECT_ROOT, ".nvmrc");
const BIOME_PATH = path.join(PROJECT_ROOT, "biome.json");

const ciWorkflow = readFileSync(CI_PATH, "utf8");
const deployWorkflow = readFileSync(DEPLOY_PATH, "utf8");
const playwrightConfig = readFileSync(PLAYWRIGHT_PATH, "utf8");
const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
  engines?: { node?: string };
  scripts?: Record<string, string>;
};
const biomeJson = JSON.parse(readFileSync(BIOME_PATH, "utf8")) as {
  files?: { includes?: string[] };
};
const temporaryDirectories: string[] = [];

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

function extractJob(workflow: string, jobName: string): string {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  if (start === -1) throw new Error(`Workflow job not found: ${jobName}`);

  const remainder = workflow.slice(start + marker.length);
  const nextJob = remainder.search(/^ {2}[a-zA-Z0-9_-]+:\s*$/m);
  return nextJob === -1
    ? workflow.slice(start)
    : workflow.slice(start, start + marker.length + nextJob);
}

function extractStep(job: string, stepName: string): string {
  const marker = `      - name: ${stepName}\n`;
  const start = job.indexOf(marker);
  if (start === -1) throw new Error(`Workflow step not found: ${stepName}`);

  const remainder = job.slice(start + marker.length);
  const nextStep = remainder.search(/^ {6}- (?:name|uses):/m);
  return nextStep === -1 ? job.slice(start) : job.slice(start, start + marker.length + nextStep);
}

function extractRunBlocks(workflow: string): string[] {
  const lines = workflow.split("\n");
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[index]);
    if (!match) continue;

    const indentation = match[1].length;
    const scalar = match[2];
    if (!/^[>|]/.test(scalar)) {
      blocks.push(scalar);
      continue;
    }

    const content: string[] = [];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      const lineIndentation = line.match(/^\s*/)?.[0].length ?? 0;
      if (line.trim() && lineIndentation <= indentation) {
        index -= 1;
        break;
      }
      content.push(line.slice(Math.min(indentation + 2, line.length)));
    }
    blocks.push(scalar.startsWith(">") ? content.join(" ") : content.join("\n"));
  }

  return blocks;
}

function bashSyntaxCheck(script: string, label: string): void {
  const sanitized = script.replace(/\$\{\{[\s\S]*?\}\}/g, "GITHUB_EXPRESSION");
  const result = spawnSync("bash", ["-n"], {
    encoding: "utf8",
    input: sanitized,
  });
  if (result.status !== 0) {
    throw new Error(`${label} is not valid bash:\n${result.stderr}`);
  }
}

function executeBash(script: string, environment: NodeJS.ProcessEnv): void {
  const result = spawnSync("bash", ["-euo", "pipefail"], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: script,
  });
  if (result.status !== 0) {
    throw new Error(`Bash contract fixture failed:\n${result.stderr}`);
  }
}

function loadRuntimePlaywrightConfig(baseURL: string): {
  baseURL: string;
  hasWebServer: boolean;
} {
  const configUrl = pathToFileURL(PLAYWRIGHT_PATH).href;
  const script = `
    const config = (await import(process.env.PLAYWRIGHT_CONFIG_URL)).default;
    process.stdout.write(JSON.stringify({
      baseURL: config.use.baseURL,
      hasWebServer: Boolean(config.webServer),
    }));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        BASE_URL: baseURL,
        PLAYWRIGHT_CONFIG_URL: configUrl,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "Playwright config subprocess failed");
  }
  return JSON.parse(result.stdout) as { baseURL: string; hasWebServer: boolean };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("CI and release workflow contract", () => {
  it("keeps repository lint away from machine-local tool trees", () => {
    expect(biomeJson.files?.includes).toEqual(
      expect.arrayContaining(["!!**/.claude", "!!**/.agents"]),
    );
  });

  it("pins the project and both workflows to Node 22.19.0", () => {
    expect(readFileSync(NVMRC_PATH, "utf8").trim()).toBe("22.19.0");
    expect(packageJson.engines?.node).toBe(">=22.19.0");

    for (const workflow of [ciWorkflow, deployWorkflow]) {
      expect(workflow).not.toMatch(/node-version:\s*["']?(?:18|20|21)(?:\.|["'\s])/);
      expect(workflow).toContain("node-version-file: .nvmrc");
      expect(workflow).not.toContain("node-version:");
    }
  });

  it("keeps CI as the only validation workflow and deploy free of repeated tests", () => {
    expect(occurrences(ciWorkflow, "run: npm run lint")).toBe(1);
    expect(occurrences(ciWorkflow, "run: npm run typecheck")).toBe(1);
    expect(occurrences(ciWorkflow, "run: npm run test:coverage")).toBe(1);
    expect(ciWorkflow).toContain("name: Unit, Integration & Coverage");

    expect(deployWorkflow).not.toMatch(
      /npm run (?:lint|typecheck|test(?::|\b))|\b(?:vitest|playwright)\s+(?:run|test)\b/,
    );
    expect(ciWorkflow).not.toContain("bash scripts/deploy.sh");
  });

  it("runs PR-scoped and main full E2E as mutually exclusive branches", () => {
    const e2eJob = extractJob(ciWorkflow, "e2e");
    const prStep = extractStep(e2eJob, "Run PR-scoped Page Map E2E");
    const mainStep = extractStep(e2eJob, "Run full E2E on main");

    expect(prStep).toContain("if: github.event_name == 'pull_request'");
    expect(prStep).toContain("run: npm run test:e2e:pr");
    expect(mainStep).toContain("if: github.event_name == 'push'");
    expect(mainStep).toContain("run: npm run test:e2e:full");
    expect(packageJson.scripts?.["test:e2e:pr"]).toContain("web/__tests__/page-map.spec.ts");
    expect(packageJson.scripts?.["test:e2e:pr"]).toContain("--project=desktop");
    expect(packageJson.scripts?.["test:e2e:full"]).toBe(
      "playwright test --config playwright.config.ts",
    );
    expect(occurrences(ciWorkflow, "run: npm run test:e2e:pr")).toBe(1);
    expect(occurrences(ciWorkflow, "run: npm run test:e2e:full")).toBe(1);
    expect(e2eJob).not.toMatch(/--reporter(?:=|\s)/);
  });

  it("normalizes legacy file BASE_URL values to the local HTTP server", () => {
    expect(loadRuntimePlaywrightConfig("/tmp/travelmap/web")).toEqual({
      baseURL: "http://127.0.0.1:3456/",
      hasWebServer: true,
    });
    expect(loadRuntimePlaywrightConfig("file:///tmp/travelmap/web/")).toEqual({
      baseURL: "http://127.0.0.1:3456/",
      hasWebServer: true,
    });
    expect(loadRuntimePlaywrightConfig("https://example.test/travel")).toEqual({
      baseURL: "https://example.test/travel",
      hasWebServer: false,
    });
    expect(() => loadRuntimePlaywrightConfig("not-a-url")).toThrow("[PLAYWRIGHT_BASE_URL_INVALID]");
    expect(playwrightConfig).toContain("webServer: useLocalWebServer");
  });

  it("generates and always archives HTML, JUnit, traces, screenshots, and raw results", () => {
    expect(playwrightConfig).toContain('outputDir: "test-results"');
    expect(playwrightConfig).toContain('["list"]');
    expect(playwrightConfig).toContain(
      '["html", { outputFolder: "playwright-report", open: "never" }]',
    );
    expect(playwrightConfig).toContain('["junit", { outputFile: "test-results/junit.xml" }]');
    expect(playwrightConfig).toContain('screenshot: "only-on-failure"');
    expect(playwrightConfig).toContain('trace: "retain-on-failure"');

    const uploadStep = extractStep(
      extractJob(ciWorkflow, "e2e"),
      "Upload Playwright reports and raw results",
    );
    expect(uploadStep).toContain("if: always()");
    expect(uploadStep).toContain("playwright-report/");
    expect(uploadStep).toContain("test-results/");
    expect(uploadStep).toContain("if-no-files-found: error");
  });

  it("skips AI evaluation without a key and enables it when a provider is configured", () => {
    const aiJob = extractJob(ciWorkflow, "ai-eval");
    const detectStep = extractStep(aiJob, "Detect configured AI provider");
    const detectScript = extractRunBlocks(detectStep)[0];

    for (const apiKey of ["", "synthetic-provider-key"]) {
      const directory = mkdtempSync(path.join(tmpdir(), "travelmap-ai-gate-"));
      temporaryDirectories.push(directory);
      const outputPath = path.join(directory, "output");
      const summaryPath = path.join(directory, "summary");
      executeBash(detectScript, {
        ANTHROPIC_API_KEY: "",
        DEEPSEEK_API_KEY: "",
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        OPENAI_API_KEY: apiKey,
      });

      const enabled = apiKey ? "true" : "false";
      expect(readFileSync(outputPath, "utf8")).toContain(`enabled=${enabled}`);
      const summary = readFileSync(summaryPath, "utf8");
      expect(summary).toContain(apiKey ? "AI evaluation: enabled" : "AI evaluation: skipped");
      if (!apiKey) expect(summary).toContain("No supported AI provider secret is configured.");
    }

    const evalStep = extractStep(aiJob, "Run AI evaluation");
    expect(evalStep).toContain("if: steps.ai-config.outputs.enabled == 'true'");
    expect(evalStep).toContain("run: npm run eval:loop:ci");
    expect(evalStep).not.toContain("continue-on-error");
    expect(evalStep).not.toMatch(/\|\|\s*true|set\s+\+e/);
  });

  it("builds one immutable artifact only after every required CI validation", () => {
    const artifactJob = extractJob(ciWorkflow, "build-artifact");

    expect(artifactJob).toContain("needs: [static, tests, e2e, ai-eval]");
    for (const requiredJob of ["static", "tests", "e2e"]) {
      expect(artifactJob).toContain(`needs.${requiredJob}.result == 'success'`);
    }
    expect(artifactJob).toContain("github.event_name == 'pull_request'");
    expect(artifactJob).toContain("needs.ai-eval.result == 'skipped'");
    expect(artifactJob).toContain("github.event_name == 'push'");
    expect(artifactJob).toContain("needs.ai-eval.result == 'success'");
    expect(artifactJob).toContain("node scripts/build-deploy-artifact.mjs");
    expect(artifactJob).toContain("node scripts/validate-deploy-artifact.mjs");
    expect(artifactJob.indexOf("Build allowlisted deploy artifact")).toBeLessThan(
      artifactJob.indexOf("Upload immutable deploy artifact"),
    );
    expect(artifactJob).toContain(
      `\${{ env.DEPLOY_ARTIFACT_PREFIX }}-\${{ github.run_id }}-\${{ github.run_attempt }}`,
    );
    expect(artifactJob).toContain("if-no-files-found: error");
  });

  it("deploy consumes only the exact successful workflow_run artifact", () => {
    expect(deployWorkflow).toContain("workflow_run:");
    expect(deployWorkflow).toContain("workflows: [CI]");
    expect(deployWorkflow).toContain("types: [completed]");
    expect(deployWorkflow).not.toMatch(/^\s*(?:push|pull_request|pull_request_target):/m);
    expect(deployWorkflow).not.toContain("scripts/build-deploy-artifact.mjs");

    for (const jobName of ["production", "preview"]) {
      const job = extractJob(deployWorkflow, jobName);
      expect(job).toContain("github.event.workflow_run.conclusion == 'success'");
      expect(job).toContain(
        "github.event.workflow_run.head_repository.full_name == github.repository",
      );
      expect(job).toContain(
        `\${{ env.DEPLOY_ARTIFACT_PREFIX }}-\${{ github.event.workflow_run.id }}-\${{ github.event.workflow_run.run_attempt }}`,
      );
      expect(job).toContain(`run-id: \${{ github.event.workflow_run.id }}`);
      expect(job).toContain(`github-token: \${{ github.token }}`);
      expect(job).toContain("node scripts/validate-deploy-artifact.mjs");
    }
  });

  it("keeps workflow_run privileges minimal and checks out only trusted deployment code", () => {
    expect(deployWorkflow).toMatch(/^permissions: \{\}$/m);
    expect(deployWorkflow).not.toMatch(/permissions:\s+(?:write-all|read-all)/);
    expect(deployWorkflow).not.toContain("contents: write");
    expect(deployWorkflow).not.toContain("actions: write");

    for (const jobName of ["production", "preview"]) {
      const job = extractJob(deployWorkflow, jobName);
      expect(job).toContain("actions: read");
      expect(job).toContain("contents: read");
      const checkoutStep = extractStep(job, "Checkout trusted deployment code");
      expect(checkoutStep).toContain(`ref: \${{ github.sha }}`);
      expect(checkoutStep).toContain("persist-credentials: false");
      expect(checkoutStep).not.toContain("workflow_run.head_sha");
      expect(checkoutStep).not.toContain("pull_requests[0].head.sha");
    }
  });

  it("binds producer and consumer to complete source identity", () => {
    const artifactJob = extractJob(ciWorkflow, "build-artifact");
    const identityFields = [
      "workflow",
      "run_id",
      "run_attempt",
      "event",
      "repository",
      "ref",
      "sha",
      "branch",
      "pr_number",
      "pr_head_sha",
    ];

    for (const field of identityFields) expect(artifactJob).toContain(`${field}:`);
    expect(artifactJob).toContain('path.join(process.env.ARTIFACT_DIR, "source.json")');

    for (const jobName of ["production", "preview"]) {
      const job = extractJob(deployWorkflow, jobName);
      expect(job).toContain('path.join(process.env.ARTIFACT_DIR, "source.json")');
      expect(job).toContain("Artifact source identity does not match workflow_run metadata");
      expect(job).toContain(`EXPECTED_SOURCE_RUN_ID: \${{ github.event.workflow_run.id }}`);
      expect(job).toContain(
        `EXPECTED_SOURCE_RUN_ATTEMPT: \${{ github.event.workflow_run.run_attempt }}`,
      );
      expect(job).toContain(`EXPECTED_SOURCE_SHA: \${{ github.event.workflow_run.head_sha }}`);
    }
    expect(extractJob(deployWorkflow, "preview")).toContain(
      `EXPECTED_PR_HEAD_SHA: \${{ github.event.workflow_run.pull_requests[0].head.sha }}`,
    );
  });

  it("isolates previews as pr-N and smokes the exact deployment URL", () => {
    const previewJob = extractJob(deployWorkflow, "preview");
    expect(previewJob).toContain(
      `group: preview-pr-\${{ github.event.workflow_run.pull_requests[0].number }}`,
    );
    expect(previewJob).toContain(`--branch "pr-\${PR_NUMBER}"`);
    expect(previewJob).toContain(`url: \${{ steps.deploy.outputs.deployment_url }}`);

    for (const jobName of ["production", "preview"]) {
      const job = extractJob(deployWorkflow, jobName);
      expect(job).toContain(`DEPLOYMENT_URL: \${{ steps.deploy.outputs.deployment_url }}`);
      expect(job).toContain('bash scripts/health-check.sh "$DEPLOYMENT_URL"');
      expect(job).not.toMatch(/health-check\.sh\s+(?:production|preview|main)\b/);
      expect(occurrences(job, "scripts/health-check.sh")).toBe(1);
      expect(occurrences(job, "bash scripts/deploy.sh")).toBe(1);
    }
  });

  it("forbids pull_request_target and syntax-checks every workflow run block", () => {
    for (const [label, workflow] of [
      ["ci.yml", ciWorkflow],
      ["deploy.yml", deployWorkflow],
    ] as const) {
      expect(workflow).not.toContain("pull_request_target");
      const runBlocks = extractRunBlocks(workflow);
      expect(runBlocks.length).toBeGreaterThan(0);
      runBlocks.forEach((script, index) => {
        bashSyntaxCheck(script, `${label} run block ${index + 1}`);
      });
    }
  });
});
