import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const packageJson = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const playwrightWrapper = readFileSync(
  path.join(PROJECT_ROOT, "src", "__tests__", "cross-layer", "playwright-wrapper.test.ts"),
  "utf8",
);

describe("coverage architecture contract", () => {
  it("skips nested Playwright only for coverage and keeps direct cross-layer behavior explicit", () => {
    const coverageCommand = packageJson.scripts?.["test:coverage"];
    const crossLayerCommand = packageJson.scripts?.["test:cross-layer"];

    expect(playwrightWrapper).toContain('process.env.SKIP_PLAYWRIGHT === "true"');
    expect(playwrightWrapper).toContain("it.skipIf(skipPlaywright)");
    expect(coverageCommand).toBe("SKIP_PLAYWRIGHT=true vitest run --coverage");
    expect(crossLayerCommand).toBe("SKIP_PLAYWRIGHT=false vitest run --project cross-layer");
  });

  it("keeps coverage unfiltered so Vitest unit and integration failures remain blocking", () => {
    const coverageCommand = packageJson.scripts?.["test:coverage"] ?? "";

    expect(coverageCommand).toContain("vitest run --coverage");
    expect(coverageCommand).not.toContain("--project");
    expect(coverageCommand).not.toContain("--exclude");
    expect(coverageCommand).not.toMatch(/\|\|\s*true|;\s*exit\s+0|--passWithNoTests/);
  });
});
