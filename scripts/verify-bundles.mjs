#!/usr/bin/env node
/**
 * Verify committed bundles match source and respect size caps.
 *
 * 1. Rebuilds pi-bundle.js and app.bundle.js from source (deterministic esbuild)
 * 2. Compares SHA-256 with the committed files in web/
 * 3. Enforces size caps so a dependency bump cannot silently balloon the bundle
 *
 * Exit code 0 = all good; 1 = drift or size violation.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SIZE_CAPS = {
  "web/pi-bundle.js": 6 * 1024 * 1024, // pi 运行时（minified）
  "web/app.bundle.js": 1 * 1024 * 1024, // 应用逻辑
};

const BUILDERS = [
  { label: "pi-bundle", build: () => require("./build-bundle.cjs").buildPiBundle, target: "web/pi-bundle.js" },
  { label: "app-bundle", build: () => require("./build-app-bundle.cjs").buildAppBundle, target: "web/app.bundle.js" },
];

const failures = [];

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const tmpDir = mkdtempSync(path.join(tmpdir(), "travelmap-bundle-verify-"));
try {
  for (const { label, build, target } of BUILDERS) {
    const committed = path.join(PROJECT_ROOT, target);
    const rebuilt = path.join(tmpDir, path.basename(target));
    const builder = build();
    await builder({ outfile: rebuilt });

    const committedHash = sha256(committed);
    const rebuiltHash = sha256(rebuilt);
    if (committedHash !== rebuiltHash) {
      failures.push(`${target}: committed bundle drifts from source (rebuilt sha256 ${rebuiltHash} != committed ${committedHash}); run: node scripts/build-bundle.cjs && node scripts/build-app-bundle.cjs`);
    }

    const size = readFileSync(committed).length;
    const cap = SIZE_CAPS[target];
    if (size > cap) {
      failures.push(`${target}: size ${(size / 1024 / 1024).toFixed(2)}MiB exceeds cap ${(cap / 1024 / 1024).toFixed(2)}MiB`);
    } else {
      console.log(`✓ ${target}: ${(size / 1024).toFixed(1)}KiB within cap`);
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("bundle verification passed");
}
