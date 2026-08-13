#!/usr/bin/env node

/**
 * Generate content-addressed copies for index.html references under modules/ and styles/.
 * The operation validates every reference before writing any output and fails closed.
 */

import { createHash } from "node:crypto";
import { copyFile, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REFERENCE_PATTERNS = Object.freeze([
  /((?:src|href)=["']\.\/)((?:modules|styles)\/[^"'?#]+\.(?:js|css))(?:\?[^"']*)?(["'])/g,
  /((?:import|from)\s+["']\.\/)(modules\/[^"'?#]+\.(?:js|css))(?:\?[^"']*)?(["'])/g,
]);

function assertContainedAssetPath(assetPath) {
  if (assetPath.includes("\0") || assetPath.includes("\\") || path.posix.isAbsolute(assetPath)) {
    throw new Error(`[HASH_PATH_INVALID] ${assetPath}`);
  }
  const normalized = path.posix.normalize(assetPath);
  if (
    normalized !== assetPath ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    !/^(?:modules\/[A-Za-z0-9._/-]+\.js|styles\/[A-Za-z0-9._/-]+\.css)$/.test(normalized)
  ) {
    throw new Error(`[HASH_PATH_INVALID] ${assetPath}`);
  }
  return normalized;
}

async function readRegularAsset(deployDirectory, assetPath) {
  const normalized = assertContainedAssetPath(assetPath);
  const absolutePath = path.resolve(deployDirectory, ...normalized.split("/"));
  const relativeToRoot = path.relative(deployDirectory, absolutePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`[HASH_PATH_ESCAPE] ${assetPath}`);
  }

  let stats;
  try {
    stats = await lstat(absolutePath);
  } catch {
    throw new Error(`[HASH_MISSING_REFERENCE] ${assetPath}`);
  }
  if (stats.isSymbolicLink()) throw new Error(`[HASH_SYMLINK] ${assetPath}`);
  if (!stats.isFile()) throw new Error(`[HASH_NOT_FILE] ${assetPath}`);
  return { absolutePath, content: await readFile(absolutePath) };
}

function collectReferences(html) {
  const references = new Set();
  for (const pattern of REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of html.matchAll(pattern)) references.add(assertContainedAssetPath(match[2]));
  }
  return [...references].sort();
}

function hashedAssetPath(assetPath, contentHash) {
  const extension = path.posix.extname(assetPath);
  const basename = assetPath.slice(0, -extension.length);
  const existingHash = basename.match(/\.([0-9a-f]{8})$/)?.[1];
  if (existingHash !== undefined) {
    if (existingHash !== contentHash.slice(0, 8)) {
      throw new Error(`[HASH_FILENAME_MISMATCH] ${assetPath}`);
    }
    return assetPath;
  }
  return `${basename}.${contentHash.slice(0, 8)}${extension}`;
}

export async function hashAssets(deployDirectory) {
  const resolvedDeployDirectory = path.resolve(deployDirectory);
  const indexPath = path.join(resolvedDeployDirectory, "index.html");
  let indexStats;
  try {
    indexStats = await lstat(indexPath);
  } catch {
    throw new Error("[HASH_INDEX_MISSING] index.html");
  }
  if (indexStats.isSymbolicLink()) throw new Error("[HASH_INDEX_SYMLINK] index.html");
  if (!indexStats.isFile()) throw new Error("[HASH_INDEX_NOT_FILE] index.html");

  const originalHtml = await readFile(indexPath, "utf8");
  const references = collectReferences(originalHtml);
  const replacements = new Map();
  const prepared = [];

  // Complete this read/validation pass before any writes.
  for (const assetPath of references) {
    const asset = await readRegularAsset(resolvedDeployDirectory, assetPath);
    const contentHash = createHash("sha256").update(asset.content).digest("hex");
    const hashedPath = hashedAssetPath(assetPath, contentHash);
    replacements.set(assetPath, hashedPath);
    prepared.push({ ...asset, assetPath, hashedPath, contentHash });
  }

  for (const asset of prepared) {
    const hashedAbsolutePath = path.resolve(resolvedDeployDirectory, ...asset.hashedPath.split("/"));
    if (asset.hashedPath !== asset.assetPath) {
      try {
        const existingStats = await lstat(hashedAbsolutePath);
        if (existingStats.isSymbolicLink() || !existingStats.isFile()) {
          throw new Error(`[HASH_OUTPUT_INVALID] ${asset.hashedPath}`);
        }
        const existingHash = createHash("sha256").update(await readFile(hashedAbsolutePath)).digest("hex");
        if (existingHash !== asset.contentHash) {
          throw new Error(`[HASH_OUTPUT_COLLISION] ${asset.hashedPath}`);
        }
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          await copyFile(asset.absolutePath, hashedAbsolutePath);
        } else {
          throw error;
        }
      }
    }

    const writtenHash = createHash("sha256").update(await readFile(hashedAbsolutePath)).digest("hex");
    if (writtenHash !== asset.contentHash) {
      throw new Error(`[HASH_OUTPUT_MISMATCH] ${asset.hashedPath}`);
    }
  }

  let rewrittenHtml = originalHtml;
  for (const pattern of REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    rewrittenHtml = rewrittenHtml.replace(pattern, (full, prefix, assetPath, suffix) => {
      const normalized = assertContainedAssetPath(assetPath);
      const replacement = replacements.get(normalized);
      if (replacement === undefined) throw new Error(`[HASH_INTERNAL_MISSING] ${normalized}`);
      return `${prefix}${replacement}${suffix}`;
    });
  }
  await writeFile(indexPath, rewrittenHtml, "utf8");

  return prepared.map(({ assetPath, hashedPath }) => ({ assetPath, hashedPath }));
}

function isMainModule() {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function main() {
  if (process.argv.length !== 3) {
    console.error("Usage: node scripts/hash-assets.js <deploy-dir>");
    process.exitCode = 1;
    return;
  }
  try {
    const generated = await hashAssets(process.argv[2]);
    console.log(`hashed_assets=${generated.length}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "[HASH_FAILED] index.html");
    process.exitCode = 1;
  }
}

if (isMainModule()) await main();
