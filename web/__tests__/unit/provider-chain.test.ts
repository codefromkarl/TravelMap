/**
 * LLM provider fallback chain 单元测试
 *
 * 覆盖：解析逗号分隔列表、非法 provider 失败关闭、去重、排除主 provider、
 *       空输入、以及 fallback model 解析（provider 覆盖优先，否则回退 LLM_MODEL）
 */
import { describe, expect, it } from "vitest";
import {
  LEGAL_PROVIDERS,
  parseFallbackChain,
  resolveFallbackModel,
} from "../../functions/_lib/provider-chain.js";

describe("parseFallbackChain", () => {
  it("解析合法的逗号分隔 provider 列表并保持顺序", () => {
    expect(parseFallbackChain({ LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDERS: "deepseek,openrouter" }))
      .toEqual(["deepseek", "openrouter"]);
  });

  it("忽略空白并跳过空条目", () => {
    expect(parseFallbackChain({ LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDERS: " deepseek , , openrouter ," }))
      .toEqual(["deepseek", "openrouter"]);
  });

  it("去重并保留首次出现顺序", () => {
    expect(parseFallbackChain({ LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDERS: "deepseek,openrouter,deepseek" }))
      .toEqual(["deepseek", "openrouter"]);
  });

  it("排除主 provider 及其重复项", () => {
    expect(parseFallbackChain({ LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDERS: "openai,deepseek,openai,openrouter" }))
      .toEqual(["deepseek", "openrouter"]);
  });

  it("对任意非法 provider 失败关闭（返回空数组）", () => {
    expect(parseFallbackChain({ LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDERS: "deepseek,bogus" }))
      .toEqual([]);
  });

  it("大小写不敏感", () => {
    expect(parseFallbackChain({ LLM_PROVIDER: "OPENAI", LLM_FALLBACK_PROVIDERS: "DeepSeek,OpenRouter" }))
      .toEqual(["deepseek", "openrouter"]);
  });

  it("未配置或空字符串返回空数组", () => {
    expect(parseFallbackChain({ LLM_PROVIDER: "openai" })).toEqual([]);
    expect(parseFallbackChain({ LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDERS: "" })).toEqual([]);
    expect(parseFallbackChain({ LLM_PROVIDER: "openai", LLM_FALLBACK_PROVIDERS: " , , " })).toEqual([]);
    expect(parseFallbackChain(undefined)).toEqual([]);
  });

  it("仅主 provider 自身时返回空数组", () => {
    expect(parseFallbackChain({ LLM_PROVIDER: "deepseek", LLM_FALLBACK_PROVIDERS: "deepseek" }))
      .toEqual([]);
  });
});

describe("resolveFallbackModel", () => {
  it("优先使用 provider 专属覆盖 LLM_MODEL_<NAME>", () => {
    const env = { LLM_MODEL: "gpt-4o-mini", LLM_MODEL_DEEPSEEK: "deepseek-chat" };
    expect(resolveFallbackModel("deepseek", env)).toBe("deepseek-chat");
  });

  it("缺少覆盖时回退到 LLM_MODEL", () => {
    const env = { LLM_MODEL: "gpt-4o-mini" };
    expect(resolveFallbackModel("openrouter", env)).toBe("gpt-4o-mini");
  });

  it("覆盖为空字符串时回退到 LLM_MODEL", () => {
    const env = { LLM_MODEL: "gpt-4o-mini", LLM_MODEL_DEEPSEEK: "  " };
    expect(resolveFallbackModel("deepseek", env)).toBe("gpt-4o-mini");
  });

  it("缺少所有 model 时返回空字符串", () => {
    expect(resolveFallbackModel("google", {})).toBe("");
    expect(resolveFallbackModel("google", undefined)).toBe("");
  });

  it("provider 名大小写不影响覆盖查找（统一转大写）", () => {
    const env = { LLM_MODEL: "gpt-4o-mini", LLM_MODEL_DEEPSEEK: "deepseek-chat" };
    expect(resolveFallbackModel("DeepSeek", env)).toBe("deepseek-chat");
  });
});

describe("LEGAL_PROVIDERS", () => {
  it("覆盖六家 provider 且均为小写", () => {
    expect(LEGAL_PROVIDERS).toEqual([
      "openai",
      "anthropic",
      "google",
      "deepseek",
      "openrouter",
      "sensenova",
    ]);
  });
});
