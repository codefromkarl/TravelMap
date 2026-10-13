/** Production Judge transport, independent of test discovery and generation context. */
import {
  type Api,
  getEnvApiKey,
  getModels,
  getProviders,
  type KnownProvider,
  type Model,
  streamSimple,
} from "@earendil-works/pi-ai";

export type JudgeReply =
  | { status: "evaluated"; text: string; provider: string; model: string }
  | { status: "skipped" | "error"; code: string; provider?: string; model?: string };

const DEFAULT_PROVIDERS: KnownProvider[] = ["deepseek", "openai", "anthropic"];
const PREFERRED_MODELS: Partial<Record<KnownProvider, string[]>> = {
  deepseek: ["deepseek-v4-flash", "deepseek-chat"],
  openai: ["gpt-4o-mini", "gpt-4.1-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-sonnet-4-0"],
};
const JUDGE_TIMEOUT_MS = 30_000;
const MAX_REPLY_CHARS = 64_000;

/** Judge selection stays within the installed SDK registry and the selected provider's key. */
function resolveJudge():
  | { status: "ready"; model: Model<Api>; apiKey: string }
  | Exclude<JudgeReply, { status: "evaluated" }> {
  const requestedProvider = process.env.JUDGE_MODEL_PROVIDER?.trim() || undefined;
  const requestedModel = process.env.JUDGE_MODEL_ID?.trim();
  const providers = getProviders();
  if (requestedProvider && !providers.includes(requestedProvider as KnownProvider)) {
    return { status: "error", code: "JUDGE_PROVIDER_NOT_REGISTERED" };
  }
  const provider =
    (requestedProvider as KnownProvider | undefined) ??
    (process.env.OPENAI_BASE_URL?.trim() && getEnvApiKey("openai") ? "openai" : undefined) ??
    DEFAULT_PROVIDERS.find((candidate) => getEnvApiKey(candidate));
  if (!provider) return { status: "skipped", code: "JUDGE_CREDENTIAL_UNAVAILABLE" };
  const models = getModels(provider);
  const preferred = PREFERRED_MODELS[provider] || [];
  const modelId =
    requestedModel ||
    (provider === "openai" && process.env.OPENAI_BASE_URL?.trim()
      ? process.env.AI_MODEL?.trim()
      : undefined);
  let model = modelId
    ? models.find((candidate) => candidate.id === modelId)
    : (preferred.map((id) => models.find((candidate) => candidate.id === id)).find(Boolean) ??
      models.find((candidate) => candidate.input.includes("text")));
  if (!model) return { status: "error", code: "JUDGE_MODEL_NOT_REGISTERED", provider };
  const providerBaseUrls: Partial<Record<KnownProvider, string | undefined>> = {
    openai: process.env.OPENAI_BASE_URL,
    deepseek: process.env.DEEPSEEK_BASE_URL,
    anthropic: process.env.ANTHROPIC_BASE_URL,
  };
  const baseUrl = process.env.JUDGE_BASE_URL?.trim() || providerBaseUrls[provider]?.trim();
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (
        !/^https?:$/.test(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        Array.from(baseUrl).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
      ) {
        return { status: "error", code: "JUDGE_INVALID_BASE_URL", provider, model: model.id };
      }
      model = { ...model, baseUrl: parsed.href.replace(/\/$/, "") };
    } catch {
      return { status: "error", code: "JUDGE_INVALID_BASE_URL", provider, model: model.id };
    }
  }
  const apiKey = getEnvApiKey(provider);
  if (!apiKey)
    return { status: "skipped", code: "JUDGE_CREDENTIAL_UNAVAILABLE", provider, model: model.id };
  return { status: "ready", model, apiKey };
}

/** A successful terminal SDK event is required; partial text is never assessment evidence. */
export async function requestJudge(prompt: string): Promise<JudgeReply> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const selected = resolveJudge();
    if (selected.status !== "ready") return selected;
    const { model, apiKey } = selected;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("deadline"));
      }, JUDGE_TIMEOUT_MS);
    });
    const consume = async (): Promise<JudgeReply> => {
      const response = streamSimple(
        model,
        {
          messages: [
            { role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() },
          ],
        },
        { apiKey, signal: controller.signal, maxTokens: 2048, temperature: 0 },
      );
      for await (const event of response) {
        if (event.type === "error")
          return {
            status: "error",
            code: "JUDGE_UPSTREAM_ERROR",
            provider: model.provider,
            model: model.id,
          };
        if (event.type !== "done") continue;
        if (event.reason !== "stop" || event.message.stopReason !== "stop") {
          return {
            status: "error",
            code: "JUDGE_INCOMPLETE_REPLY",
            provider: model.provider,
            model: model.id,
          };
        }
        const text = event.message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        if (!text.trim() || text.length > MAX_REPLY_CHARS)
          return {
            status: "error",
            code: "JUDGE_INVALID_REPLY",
            provider: model.provider,
            model: model.id,
          };
        return { status: "evaluated", text, provider: model.provider, model: model.id };
      }
      return {
        status: "error",
        code: "JUDGE_INCOMPLETE_REPLY",
        provider: model.provider,
        model: model.id,
      };
    };
    return await Promise.race([consume(), timeout]);
  } catch {
    // Do not log raw provider exceptions: they can contain credentials or prompts.
    return {
      status: "error",
      code: controller.signal.aborted ? "JUDGE_TIMEOUT" : "JUDGE_UPSTREAM_ERROR",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
