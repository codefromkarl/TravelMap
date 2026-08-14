/**
 * LLM provider fallback chain helpers.
 *
 * Pure, side-effect-free functions used by /api/chat to build an ordered
 * failover list without any I/O. The provider allowlist below must stay in
 * sync with the PROVIDERS table in ../api/chat.js.
 */

export const LEGAL_PROVIDERS = Object.freeze([
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "openrouter",
  "sensenova",
]);

/**
 * Parse env.LLM_FALLBACK_PROVIDERS (comma-separated, e.g. "deepseek,openrouter")
 * into an ordered list of legal fallback providers.
 *
 * - Trims whitespace and drops empty entries.
 * - Validates every entry against the provider allowlist; a single unknown
 *   provider invalidates the whole chain (fail-closed -> []).
 * - Deduplicates while preserving first-seen order.
 * - Excludes the primary provider (env.LLM_PROVIDER) from the chain.
 *
 * @param {unknown} env
 * @returns {string[]}
 */
export function parseFallbackChain(env) {
  const primary = String(env?.LLM_PROVIDER || "").toLowerCase();
  const raw = typeof env?.LLM_FALLBACK_PROVIDERS === "string"
    ? env.LLM_FALLBACK_PROVIDERS
    : "";
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return [];

  const names = tokens.map((token) => token.toLowerCase());
  if (names.some((name) => !LEGAL_PROVIDERS.includes(name))) return [];

  const chain = [];
  const seen = new Set();
  if (primary) seen.add(primary);
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    chain.push(name);
  }
  return chain;
}

/**
 * Resolve the model for a fallback provider.
 *
 * Prefers the per-provider override env["LLM_MODEL_" + PROVIDER_NAME_UPPER]
 * (e.g. LLM_MODEL_DEEPSEEK), otherwise falls back to env.LLM_MODEL.
 *
 * @param {string} providerName
 * @param {unknown} env
 * @returns {string}
 */
export function resolveFallbackModel(providerName, env) {
  const key = `LLM_MODEL_${String(providerName || "").toUpperCase()}`;
  const override = typeof env?.[key] === "string" ? env[key].trim() : "";
  if (override) return override;
  return typeof env?.LLM_MODEL === "string" ? env.LLM_MODEL.trim() : "";
}
