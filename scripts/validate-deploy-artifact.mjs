#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_SCHEMA_VERSION = 1;
export const SITE_DIR_NAME = "site";
export const MANIFEST_FILE_NAME = "manifest.json";

export const ALLOWED_TOP_LEVEL_FILES = Object.freeze([
  "_headers",
  "favicon.svg",
  "help.html",
  "index.html",
  "llms.txt",
  "og-image.svg",
  "pi-bundle.js",
  "pi-web-ui.css",
  "privacy.html",
  "robots.txt",
  "sitemap.xml",
  "terms.html",
]);

const ALLOWED_ROOT_FILES = new Set([...ALLOWED_TOP_LEVEL_FILES, "_worker.js"]);
const FORBIDDEN_SEGMENTS = new Set([
  "__tests__",
  "coverage",
  "playwright-report",
  "test-results",
]);
const FORBIDDEN_SECRET_EXTENSIONS = new Set([".jks", ".key", ".p12", ".pem", ".pfx"]);
const OPTIONAL_MISSING_REFERENCES = new Map([
  // This module deliberately catches a failed local-only config import in production.
  ["modules/infra/config.js", new Set(["config.local.js"])],
]);

const SECRET_PATTERNS = Object.freeze([
  ["SECRET_PRIVATE_KEY", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/i],
  ["SECRET_OPENAI_ANTHROPIC_TOKEN", /\bsk-(?:ant-[a-z0-9-]*-)?[a-z0-9_-]{20,}\b/i],
  ["SECRET_GOOGLE_API_KEY", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["SECRET_AWS_ACCESS_KEY", /\bAKIA[0-9A-Z]{16}\b/],
  ["SECRET_GITHUB_TOKEN", /\bgh[pousr]_[0-9A-Za-z]{20,}\b/],
  ["SECRET_SLACK_TOKEN", /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ["SECRET_JWT", /\beyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/],
  ["SECRET_BEARER_TOKEN", /\bBearer\s+[0-9A-Za-z._~+/-]{24,}\b/i],
]);

const SOURCE_MAP_PATTERNS = Object.freeze([
  ["SOURCE_MAP_REFERENCE", /sourceMappingURL\s*=/i],
  ["SOURCE_MAP_INLINE", /data:application\/json[^,]*;base64,/i],
  ["SOURCE_MAP_SOURCES_CONTENT", /["']sourcesContent["']\s*:/i],
]);

const WORKER_MULTIPART_PATTERNS = Object.freeze([
  ["WORKER_MULTIPART_BOUNDARY", /^--+(?:formdata|form-data-boundary)-[0-9A-Za-z_-]+/im],
  ["WORKER_MULTIPART_CONTENT_DISPOSITION", /^Content-Disposition:\s*form-data\b/im],
  ["WORKER_MULTIPART_METADATA", /\bname=["']metadata["']/i],
]);

function comparePaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function fail(ruleId, relativePath) {
  throw new Error(`[${ruleId}] ${relativePath}`);
}

function toPosixRelative(relativePath) {
  return relativePath.split(path.sep).join(path.posix.sep);
}

function assertSafeRelativePath(relativePath, ruleId = "PATH_INVALID") {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath)
  ) {
    fail(ruleId, String(relativePath));
  }

  const normalized = path.posix.normalize(relativePath);
  if (normalized !== relativePath || normalized === ".." || normalized.startsWith("../")) {
    fail(ruleId, relativePath);
  }
}

function assertAllowedArtifactPath(relativePath) {
  assertSafeRelativePath(relativePath);
  const lowerPath = relativePath.toLowerCase();
  const segments = lowerPath.split("/");
  const basename = segments.at(-1);
  const extension = path.posix.extname(lowerPath);

  if (/^\.?(?:dev\.vars|env)(?:\..*)?$/.test(basename)) {
    fail("PATH_ENV_FILE", relativePath);
  }
  if (segments.some((segment) => segment.startsWith("."))) {
    fail("PATH_DOTFILE", relativePath);
  }
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    fail("PATH_TEST_OR_REPORT", relativePath);
  }
  if (basename === "config.local.js") {
    fail("PATH_LOCAL_CONFIG", relativePath);
  }
  if (extension === ".map") {
    fail("PATH_SOURCE_MAP", relativePath);
  }
  if (FORBIDDEN_SECRET_EXTENSIONS.has(extension)) {
    fail("PATH_SECRET_CONTAINER", relativePath);
  }

  if (!relativePath.includes("/")) {
    if (!ALLOWED_ROOT_FILES.has(relativePath)) {
      fail("PATH_NOT_ALLOWLISTED", relativePath);
    }
    return;
  }

  if (relativePath.startsWith("modules/") && relativePath.endsWith(".js")) return;
  if (relativePath.startsWith("styles/") && relativePath.endsWith(".css")) return;
  fail("PATH_NOT_ALLOWLISTED", relativePath);
}

async function assertDirectory(directoryPath, displayPath) {
  let stats;
  try {
    stats = await lstat(directoryPath);
  } catch {
    fail("DIRECTORY_MISSING", displayPath);
  }
  if (stats.isSymbolicLink()) fail("PATH_SYMLINK", displayPath);
  if (!stats.isDirectory()) fail("PATH_NOT_DIRECTORY", displayPath);
}

async function assertRegularFile(filePath, displayPath) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch {
    fail("FILE_MISSING", displayPath);
  }
  if (stats.isSymbolicLink()) fail("PATH_SYMLINK", displayPath);
  if (!stats.isFile()) fail("PATH_NOT_REGULAR_FILE", displayPath);
  return stats;
}

async function listRegularFiles(rootDirectory) {
  const files = [];

  async function visit(currentDirectory, relativeDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    entries.sort((left, right) => comparePaths(left.name, right.name));

    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? path.posix.join(relativeDirectory, entry.name)
        : entry.name;
      const absolutePath = path.join(currentDirectory, entry.name);

      if (entry.isSymbolicLink()) fail("PATH_SYMLINK", relativePath);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) fail("PATH_NOT_REGULAR_FILE", relativePath);
      files.push(relativePath);
    }
  }

  await visit(rootDirectory, "");
  return files.sort(comparePaths);
}

function scanContent(relativePath, content) {
  if (content.includes("\0")) fail("CONTENT_BINARY", relativePath);

  if (relativePath === "_worker.js") {
    assertWorkerJavaScriptContent(relativePath, content);
  }

  for (const [ruleId, pattern] of SOURCE_MAP_PATTERNS) {
    if (pattern.test(content)) fail(ruleId, relativePath);
  }
  for (const [ruleId, pattern] of SECRET_PATTERNS) {
    if (pattern.test(content)) fail(ruleId, relativePath);
  }

  const assignmentPattern = /\b(api[_-]?key|client[_-]?secret|access[_-]?token|password)\b\s*[:=]\s*["'`]([^"'`\r\n]{12,})["'`]/gi;
  for (const match of content.matchAll(assignmentPattern)) {
    const assignmentName = match[1].replace(/[_-]/g, "").toLowerCase();
    const value = match[2].trim();
    const protocolIdentifier = value.replace(/[_-]/g, "").toLowerCase();
    if (protocolIdentifier === assignmentName) continue;
    if (/^(?:YOUR[_-]|example|placeholder|changeme|dummy|sample|test[_-])/i.test(value)) continue;
    fail("SECRET_NAMED_ASSIGNMENT", relativePath);
  }
}

export function assertWorkerJavaScriptContent(relativePath, content) {
  for (const [ruleId, pattern] of WORKER_MULTIPART_PATTERNS) {
    if (pattern.test(content)) fail(ruleId, relativePath);
  }
}

function extractLocalReferences(relativePath, content) {
  const references = new Set();
  const patterns = [];

  if (relativePath.endsWith(".html")) {
    patterns.push(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi);
  }
  if (relativePath.endsWith(".html") || relativePath.endsWith(".js")) {
    patterns.push(/\b(?:import|export)\s+(?:[^"'()]*?\s+from\s*)?["']([^"']+)["']/g);
    patterns.push(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);
  }
  if (relativePath.endsWith(".html") || relativePath.endsWith(".css")) {
    patterns.push(/\burl\(\s*["']?([^"')]+)["']?\s*\)/gi);
  }

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (relativePath.endsWith(".js") && isInsideJavaScriptComment(content, match.index)) continue;
      references.add(match[1]);
    }
  }
  return references;
}

function isInsideJavaScriptComment(content, offset) {
  const blockStart = content.lastIndexOf("/*", offset);
  const blockEnd = content.lastIndexOf("*/", offset);
  if (blockStart > blockEnd) return true;

  const lineStart = content.lastIndexOf("\n", offset - 1) + 1;
  const linePrefix = content.slice(lineStart, offset);
  let quote = null;

  for (let index = 0; index < linePrefix.length; index += 1) {
    const character = linePrefix[index];
    const nextCharacter = linePrefix[index + 1];
    if (quote !== null) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      return true;
    } else if (character === '"' || character === "'" || character === "`") {
      quote = character;
    }
  }
  return false;
}

function resolveLocalReference(sourcePath, rawReference) {
  const trimmed = rawReference.trim();
  if (
    trimmed === "" ||
    trimmed === "/" ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return null;
  }

  const withoutSuffix = trimmed.split(/[?#]/, 1)[0];
  if (withoutSuffix === "" || withoutSuffix === "/" || withoutSuffix.startsWith("/api/")) {
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    fail("REFERENCE_ENCODING", sourcePath);
  }

  let resolved;
  if (decoded.startsWith("/")) {
    resolved = path.posix.normalize(decoded.slice(1));
  } else if (decoded.startsWith("./") || decoded.startsWith("../")) {
    resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), decoded));
  } else {
    // Bare package imports and route-like href values are not artifact file references.
    return null;
  }

  if (resolved === "." || resolved === "") return null;
  if (resolved === ".." || resolved.startsWith("../") || path.posix.isAbsolute(resolved)) {
    fail("REFERENCE_PATH_ESCAPE", sourcePath);
  }
  return resolved;
}

function validateReferenceClosure(contentsByPath) {
  const availablePaths = new Set(contentsByPath.keys());

  for (const [sourcePath, content] of contentsByPath) {
    for (const rawReference of extractLocalReferences(sourcePath, content)) {
      const resolved = resolveLocalReference(sourcePath, rawReference);
      if (resolved === null || availablePaths.has(resolved)) continue;
      if (OPTIONAL_MISSING_REFERENCES.get(sourcePath)?.has(resolved)) continue;
      fail("REFERENCE_MISSING", `${sourcePath} -> ${resolved}`);
    }
  }
}

export function computeArtifactSha256(files) {
  const canonical = JSON.stringify({ schema_version: MANIFEST_SCHEMA_VERSION, files });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function inspectArtifactSite(siteDirectory) {
  await assertDirectory(siteDirectory, SITE_DIR_NAME);
  const relativePaths = await listRegularFiles(siteDirectory);
  if (relativePaths.length === 0) fail("SITE_EMPTY", SITE_DIR_NAME);

  const files = [];
  const contentsByPath = new Map();

  for (const relativePath of relativePaths) {
    assertAllowedArtifactPath(relativePath);
    const absolutePath = path.join(siteDirectory, ...relativePath.split("/"));
    const stats = await assertRegularFile(absolutePath, relativePath);
    const buffer = await readFile(absolutePath);
    const content = buffer.toString("utf8");
    scanContent(relativePath, content);
    contentsByPath.set(relativePath, content);
    files.push({
      path: relativePath,
      size: stats.size,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    });
  }

  for (const requiredPath of [...ALLOWED_TOP_LEVEL_FILES, "_worker.js"]) {
    if (!contentsByPath.has(requiredPath)) fail("REQUIRED_FILE_MISSING", requiredPath);
  }
  validateReferenceClosure(contentsByPath);
  return files;
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("MANIFEST_INVALID", MANIFEST_FILE_NAME);
  }
  const keys = Object.keys(manifest).sort(comparePaths);
  if (JSON.stringify(keys) !== JSON.stringify(["artifact_sha256", "files", "schema_version"])) {
    fail("MANIFEST_KEYS", MANIFEST_FILE_NAME);
  }
  if (manifest.schema_version !== MANIFEST_SCHEMA_VERSION || !Array.isArray(manifest.files)) {
    fail("MANIFEST_SCHEMA", MANIFEST_FILE_NAME);
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.artifact_sha256)) {
    fail("MANIFEST_ARTIFACT_SHA", MANIFEST_FILE_NAME);
  }

  let previousPath = null;
  for (const file of manifest.files) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      fail("MANIFEST_FILE_ENTRY", MANIFEST_FILE_NAME);
    }
    const fileKeys = Object.keys(file).sort(comparePaths);
    if (JSON.stringify(fileKeys) !== JSON.stringify(["path", "sha256", "size"])) {
      fail("MANIFEST_FILE_KEYS", MANIFEST_FILE_NAME);
    }
    assertSafeRelativePath(file.path, "MANIFEST_FILE_PATH");
    assertAllowedArtifactPath(file.path);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      fail("MANIFEST_FILE_VALUE", file.path);
    }
    if (previousPath !== null && comparePaths(previousPath, file.path) >= 0) {
      fail("MANIFEST_FILE_ORDER", file.path);
    }
    previousPath = file.path;
  }
}

export async function createDeployManifest(artifactDirectory) {
  await assertDirectory(artifactDirectory, "artifact");
  const siteDirectory = path.join(artifactDirectory, SITE_DIR_NAME);
  const files = await inspectArtifactSite(siteDirectory);
  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    artifact_sha256: computeArtifactSha256(files),
    files,
  };
  await writeFile(
    path.join(artifactDirectory, MANIFEST_FILE_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return manifest;
}

export async function validateDeployArtifact(artifactDirectory) {
  await assertDirectory(artifactDirectory, "artifact");
  const manifestPath = path.join(artifactDirectory, MANIFEST_FILE_NAME);
  const manifestStats = await assertRegularFile(manifestPath, MANIFEST_FILE_NAME);
  if (manifestStats.size > 5 * 1024 * 1024) fail("MANIFEST_TOO_LARGE", MANIFEST_FILE_NAME);

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    fail("MANIFEST_JSON", MANIFEST_FILE_NAME);
  }
  validateManifestShape(manifest);

  const actualFiles = await inspectArtifactSite(path.join(artifactDirectory, SITE_DIR_NAME));
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
    fail("MANIFEST_FILE_MISMATCH", MANIFEST_FILE_NAME);
  }
  const actualArtifactSha = computeArtifactSha256(actualFiles);
  if (actualArtifactSha !== manifest.artifact_sha256) {
    fail("MANIFEST_ARTIFACT_MISMATCH", MANIFEST_FILE_NAME);
  }
  return manifest;
}

function isMainModule() {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function main() {
  if (process.argv.length !== 3) {
    console.error("Usage: node scripts/validate-deploy-artifact.mjs <artifact-dir>");
    process.exitCode = 1;
    return;
  }
  try {
    const manifest = await validateDeployArtifact(path.resolve(process.argv[2]));
    console.log(`artifact_sha256=${manifest.artifact_sha256} files=${manifest.files.length}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "[VALIDATION_FAILED] artifact");
    process.exitCode = 1;
  }
}

if (isMainModule()) await main();
