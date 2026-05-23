#!/usr/bin/env node
import {
  getDefaultOptions,
  parseIdleExplorerArgs,
  runIdleExplorerLoop,
} from "../services/trellis-idle-explorer.js";

async function main(): Promise<void> {
  try {
    const cliOptions = parseIdleExplorerArgs(process.argv.slice(2));
    const options = getDefaultOptions(process.cwd(), cliOptions);
    await runIdleExplorerLoop(options);
  } catch (error) {
    console.error(
      `[idle-explorer] error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

void main();
