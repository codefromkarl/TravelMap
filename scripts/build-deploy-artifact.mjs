#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashAssets } from "./hash-assets.js";
import {
  ALLOWED_TOP_LEVEL_FILES,
  assertWorkerJavaScriptContent,
  createDeployManifest,
  SITE_DIR_NAME,
  validateDeployArtifact,
} from "./validate-deploy-artifact.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

function comparePaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function assertEmptyArtifactDirectory(artifactDirectory) {
  try {
    const stats = await lstat(artifactDirectory);
    if (stats.isSymbolicLink()) throw new Error("[ARTIFACT_SYMLINK] artifact");
    if (!stats.isDirectory()) throw new Error("[ARTIFACT_NOT_DIRECTORY] artifact");
    if ((await readdir(artifactDirectory)).length !== 0) {
      throw new Error("[ARTIFACT_NOT_EMPTY] artifact");
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await mkdir(artifactDirectory, { recursive: true });
      return;
    }
    throw error;
  }
}

async function copyRequiredFile(repoRoot, siteDirectory, relativePath) {
  const sourcePath = path.join(repoRoot, "web", relativePath);
  const stats = await lstat(sourcePath);
  if (stats.isSymbolicLink()) throw new Error(`[SOURCE_SYMLINK] web/${relativePath}`);
  if (!stats.isFile()) throw new Error(`[SOURCE_NOT_FILE] web/${relativePath}`);
  if (stats.size === 0) throw new Error(`[SOURCE_EMPTY] web/${relativePath}`);
  const destinationPath = path.join(siteDirectory, relativePath);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

async function copyAllowedTree(repoRoot, siteDirectory, relativeRoot, allowedExtensions) {
  const sourceRoot = path.join(repoRoot, "web", relativeRoot);
  const rootStats = await lstat(sourceRoot);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error(`[SOURCE_TREE_INVALID] web/${relativeRoot}`);
  }
  const extensionSet = new Set(
    (Array.isArray(allowedExtensions) ? allowedExtensions : [allowedExtensions]).map((extension) =>
      extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`,
    ),
  );

  async function visit(currentSource, currentRelative) {
    const entries = await readdir(currentSource, { withFileTypes: true });
    entries.sort((left, right) => comparePaths(left.name, right.name));

    for (const entry of entries) {
      const sourcePath = path.join(currentSource, entry.name);
      const relativePath = path.posix.join(currentRelative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`[SOURCE_SYMLINK] web/${relativePath}`);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === "__tests__") continue;
        await visit(sourcePath, relativePath);
        continue;
      }
      if (!entry.isFile()) throw new Error(`[SOURCE_NOT_FILE] web/${relativePath}`);
      if (!extensionSet.has(path.posix.extname(entry.name).toLowerCase())) continue;
      const destinationPath = path.join(siteDirectory, ...relativePath.split("/"));
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
    }
  }

  await visit(sourceRoot, relativeRoot);
}

async function defaultFunctionsBuilder({ repoRoot, functionsDirectory, outputDirectory }) {
  const wranglerBinary = path.join(repoRoot, "node_modules", ".bin", "wrangler");
  try {
    await access(wranglerBinary);
  } catch {
    throw new Error("[FUNCTIONS_WRANGLER_MISSING] node_modules/.bin/wrangler");
  }

  const result = spawnSync(
    wranglerBinary,
    [
      "pages",
      "functions",
      "build",
      functionsDirectory,
      `--outdir=${outputDirectory}`,
      "--sourcemap=false",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  if (result.error) throw new Error("[FUNCTIONS_BUILD_EXEC] web/functions");
  if (result.status !== 0) throw new Error("[FUNCTIONS_BUILD_FAILED] web/functions");
}

async function assertCompiledWorker(outputFile) {
  let stats;
  try {
    stats = await lstat(outputFile);
  } catch {
    throw new Error("[FUNCTIONS_OUTPUT_MISSING] site/_worker.js");
  }
  if (stats.isSymbolicLink()) throw new Error("[FUNCTIONS_OUTPUT_SYMLINK] site/_worker.js");
  if (!stats.isFile() || stats.size === 0) {
    throw new Error("[FUNCTIONS_OUTPUT_INVALID] site/_worker.js");
  }
  assertWorkerJavaScriptContent("_worker.js", await readFile(outputFile, "utf8"));
}

async function getCompiledWorker(functionsOutputDirectory) {
  const entries = await readdir(functionsOutputDirectory, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  const unexpectedEntry = entries.find((entry) => entry.name !== "index.js");
  if (unexpectedEntry) {
    throw new Error(`[FUNCTIONS_OUTPUT_UNEXPECTED] ${unexpectedEntry.name}`);
  }

  const entrypoint = entries.find((entry) => entry.name === "index.js");
  if (!entrypoint) throw new Error("[FUNCTIONS_OUTPUT_MISSING] index.js");
  if (entrypoint.isSymbolicLink()) throw new Error("[FUNCTIONS_OUTPUT_SYMLINK] index.js");
  if (!entrypoint.isFile()) throw new Error("[FUNCTIONS_OUTPUT_INVALID] index.js");

  const entrypointPath = path.join(functionsOutputDirectory, entrypoint.name);
  const stats = await lstat(entrypointPath);
  if (stats.isSymbolicLink()) throw new Error("[FUNCTIONS_OUTPUT_SYMLINK] index.js");
  if (!stats.isFile() || stats.size === 0) {
    throw new Error("[FUNCTIONS_OUTPUT_INVALID] index.js");
  }
  return entrypointPath;
}

export async function buildDeployArtifact({
  artifactDirectory,
  repoRoot = DEFAULT_REPO_ROOT,
  functionsBuilder = defaultFunctionsBuilder,
}) {
  const resolvedArtifactDirectory = path.resolve(artifactDirectory);
  const resolvedRepoRoot = path.resolve(repoRoot);
  await assertEmptyArtifactDirectory(resolvedArtifactDirectory);

  const siteDirectory = path.join(resolvedArtifactDirectory, SITE_DIR_NAME);
  await mkdir(siteDirectory);

  for (const relativePath of ALLOWED_TOP_LEVEL_FILES) {
    await copyRequiredFile(resolvedRepoRoot, siteDirectory, relativePath);
  }
  await copyAllowedTree(resolvedRepoRoot, siteDirectory, "modules", ".js");
  await copyAllowedTree(resolvedRepoRoot, siteDirectory, "styles", ".css");
  await copyAllowedTree(resolvedRepoRoot, siteDirectory, "vendor", [".js", ".css", ".png"]);
  await copyAllowedTree(resolvedRepoRoot, siteDirectory, "city", ".html");

  const functionsDirectory = path.join(resolvedRepoRoot, "web", "functions");
  const workerOutput = path.join(siteDirectory, "_worker.js");
  const functionsOutputDirectory = await mkdtemp(
    path.join(tmpdir(), "travelmap-functions-build-"),
  );
  try {
    await functionsBuilder({
      repoRoot: resolvedRepoRoot,
      functionsDirectory,
      outputDirectory: functionsOutputDirectory,
    });
    const compiledWorker = await getCompiledWorker(functionsOutputDirectory);
    assertWorkerJavaScriptContent("_worker.js", await readFile(compiledWorker, "utf8"));
    await copyFile(compiledWorker, workerOutput);
    await assertCompiledWorker(workerOutput);
  } finally {
    await rm(functionsOutputDirectory, { recursive: true, force: true });
  }

  await hashAssets(siteDirectory);
  await createDeployManifest(resolvedArtifactDirectory);
  return validateDeployArtifact(resolvedArtifactDirectory);
}

function isMainModule() {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function main() {
  if (process.argv.length !== 3) {
    console.error("Usage: node scripts/build-deploy-artifact.mjs <artifact-dir>");
    process.exitCode = 1;
    return;
  }

  try {
    const manifest = await buildDeployArtifact({ artifactDirectory: process.argv[2] });
    console.log(`artifact_sha256=${manifest.artifact_sha256} files=${manifest.files.length}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "[BUILD_FAILED] artifact");
    process.exitCode = 1;
  }
}

if (isMainModule()) await main();
