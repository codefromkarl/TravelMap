import { defineConfig } from "@playwright/test";
import baseConfig, { LEGACY_E2E_SPECS } from "./playwright.config";

/**
 * Non-blocking migration lane for pre-map-shell browser suites.
 *
 * These specs intentionally remain runnable and visible while their stale DOM,
 * external-provider, and random-interaction assumptions are migrated to current
 * production contracts. The release config owns the blocking suite.
 */
export default defineConfig({
  ...baseConfig,
  testMatch: LEGACY_E2E_SPECS,
  testIgnore: ["**/unit/**"],
  retries: 0,
});
