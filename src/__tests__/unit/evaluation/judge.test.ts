import {
  createAssistantMessageEventStream,
  getEnvApiKey,
  getModels,
  streamSimple,
} from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestJudge } from "../../../evaluation/judge.js";
import { judgeMessage, judgeStream } from "../../mocks/mock-llm.js";

vi.mock("@earendil-works/pi-ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-ai")>()),
  getEnvApiKey: vi.fn(),
  streamSimple: vi.fn(),
}));
const keyMock = vi.mocked(getEnvApiKey);
const streamMock = vi.mocked(streamSimple);
beforeEach(() => {
  vi.stubEnv("JUDGE_MODEL_PROVIDER", "");
  vi.stubEnv("JUDGE_MODEL_ID", "");
  for (const name of [
    "JUDGE_BASE_URL",
    "OPENAI_BASE_URL",
    "DEEPSEEK_BASE_URL",
    "ANTHROPIC_BASE_URL",
    "AI_MODEL",
  ])
    vi.stubEnv(name, "");
  keyMock.mockReset();
  streamMock.mockReset();
  keyMock.mockImplementation((provider) =>
    provider === "openai" ? "fake-openai-test-key" : undefined,
  );
  streamMock.mockImplementation(() => judgeStream('{"answer":1}'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("registered production Judge transport", () => {
  it("uses SDK model/context/options and terminal message text", async () => {
    const result = await requestJudge("Assess this visible itinerary");
    expect(result).toEqual({
      status: "evaluated",
      text: '{"answer":1}',
      provider: "openai",
      model: "gpt-4o-mini",
    });
    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", id: "gpt-4o-mini" }),
      {
        messages: [
          expect.objectContaining({
            role: "user",
            content: [{ type: "text", text: "Assess this visible itinerary" }],
          }),
        ],
      },
      expect.objectContaining({
        apiKey: "fake-openai-test-key",
        signal: expect.any(AbortSignal),
        maxTokens: 2048,
        temperature: 0,
      }),
    );
  });
  it("does not claim assessment when no provider key exists", async () => {
    keyMock.mockReturnValue(undefined);
    expect(await requestJudge("input")).toEqual({
      status: "skipped",
      code: "JUDGE_CREDENTIAL_UNAVAILABLE",
    });
    expect(streamMock).not.toHaveBeenCalled();
  });
  it("matches defaults to the provider's actually registered model", async () => {
    keyMock.mockImplementation((provider) =>
      provider === "deepseek" ? "fake-deepseek-key" : undefined,
    );
    const result = await requestJudge("input");
    expect(result.status).toBe("evaluated");
    expect(streamMock.mock.calls[0][0].provider).toBe("deepseek");
    expect(getModels("deepseek").map((model) => model.id)).toContain(
      streamMock.mock.calls[0][0].id,
    );
    expect(streamMock.mock.calls[0][0].id).not.toBe("gpt-4o-mini");
  });
  it("respects registered explicit Judge provider and model", async () => {
    vi.stubEnv("JUDGE_MODEL_PROVIDER", "anthropic");
    vi.stubEnv("JUDGE_MODEL_ID", "claude-sonnet-4-20250514");
    keyMock.mockImplementation((provider) =>
      provider === "anthropic" ? "fake-anthropic-key" : undefined,
    );
    expect(await requestJudge("input")).toMatchObject({
      status: "evaluated",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });
    expect(streamMock.mock.calls[0][2]?.apiKey).toBe("fake-anthropic-key");
  });
  it("preserves a trusted local OpenAI URL instead of silently using another paid provider", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:8080/v1");
    vi.stubEnv("AI_MODEL", "gpt-4o-mini");
    keyMock.mockImplementation((provider) =>
      provider === "openai"
        ? "fake-local-key"
        : provider === "deepseek"
          ? "fake-cloud-key"
          : undefined,
    );
    expect((await requestJudge("input")).status).toBe("evaluated");
    expect(streamMock.mock.calls[0][0]).toMatchObject({
      provider: "openai",
      id: "gpt-4o-mini",
      baseUrl: "http://127.0.0.1:8080/v1",
    });
    expect(streamMock.mock.calls[0][2]?.apiKey).toBe("fake-local-key");
  });
  it("honors a trusted Judge-specific override for a registered explicit model", async () => {
    vi.stubEnv("JUDGE_BASE_URL", "https://judge.example/v1/");
    vi.stubEnv("OPENAI_BASE_URL", "https://other.example/v1");
    expect((await requestJudge("input")).status).toBe("evaluated");
    expect(streamMock.mock.calls[0][0].baseUrl).toBe("https://judge.example/v1");
  });
  it("rejects unsupported local aliases instead of inventing a registered model", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:8080/v1");
    vi.stubEnv("AI_MODEL", "unregistered-local-alias");
    expect(await requestJudge("input")).toMatchObject({
      status: "error",
      code: "JUDGE_MODEL_NOT_REGISTERED",
    });
    expect(streamMock).not.toHaveBeenCalled();
  });
  it.each([
    "file:///etc/passwd",
    "https://user:secret@judge.example/v1",
    "https://judge.example/v1?key=secret",
    "not a url",
  ])("rejects unsafe override without leaking it %#", async (value) => {
    vi.stubEnv("JUDGE_BASE_URL", value);
    const result = await requestJudge("input");
    expect(result).toMatchObject({ status: "error", code: "JUDGE_INVALID_BASE_URL" });
    expect(JSON.stringify(result)).not.toContain(value);
    expect(streamMock).not.toHaveBeenCalled();
  });
  it("does not borrow another provider's key", async () => {
    vi.stubEnv("JUDGE_MODEL_PROVIDER", "anthropic");
    expect(await requestJudge("input")).toMatchObject({
      status: "skipped",
      code: "JUDGE_CREDENTIAL_UNAVAILABLE",
      provider: "anthropic",
    });
    expect(streamMock).not.toHaveBeenCalled();
  });
  it.each([
    ["unknown-provider", "gpt-4o-mini", "JUDGE_PROVIDER_NOT_REGISTERED"],
    ["deepseek", "gpt-4o-mini", "JUDGE_MODEL_NOT_REGISTERED"],
  ])("rejects unregistered or mismatched %s/%s", async (provider, model, code) => {
    vi.stubEnv("JUDGE_MODEL_PROVIDER", provider);
    vi.stubEnv("JUDGE_MODEL_ID", model);
    expect(await requestJudge("input")).toMatchObject({ status: "error", code });
    expect(streamMock).not.toHaveBeenCalled();
  });
  it("does not expose exceptions containing prompt or credential data", async () => {
    streamMock.mockImplementation(() => {
      throw new Error("fake-secret provider request body");
    });
    const result = await requestJudge("sensitive prompt");
    expect(result).toEqual({ status: "error", code: "JUDGE_UPSTREAM_ERROR" });
    expect(JSON.stringify(result)).not.toContain("fake-secret");
  });
  it("handles real SDK error events, not nonexistent error.message content", async () => {
    const stream = createAssistantMessageEventStream();
    stream.push({
      type: "error",
      reason: "error",
      error: judgeMessage("", { stopReason: "error", errorMessage: "fake-secret" }),
    });
    streamMock.mockReturnValue(stream);
    expect(await requestJudge("input")).toMatchObject({
      status: "error",
      code: "JUDGE_UPSTREAM_ERROR",
    });
  });
  it.each(["", " ", "x".repeat(64001)])(
    "rejects empty or oversized final evidence %#",
    async (text) => {
      streamMock.mockImplementation(() => judgeStream(text));
      expect(await requestJudge("input")).toMatchObject({
        status: "error",
        code: "JUDGE_INVALID_REPLY",
      });
    },
  );
  it("does not accept a truncated reply", async () => {
    streamMock.mockImplementation(() => judgeStream('{"answer":1}', "length"));
    expect(await requestJudge("input")).toMatchObject({
      status: "error",
      code: "JUDGE_INCOMPLETE_REPLY",
    });
  });
  it("does not accept a stream ending without a done event", async () => {
    const stream = createAssistantMessageEventStream();
    stream.end(judgeMessage("unfinished"));
    streamMock.mockReturnValue(stream);
    expect(await requestJudge("input")).toMatchObject({
      status: "error",
      code: "JUDGE_INCOMPLETE_REPLY",
    });
  });
  it("bounds stalled Judge requests even when an SDK fails to honor abort", async () => {
    vi.useFakeTimers();
    streamMock.mockReturnValue(createAssistantMessageEventStream());
    const result = requestJudge("input");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toEqual({ status: "error", code: "JUDGE_TIMEOUT" });
    expect(streamMock.mock.calls[0][2]?.signal?.aborted).toBe(true);
  });
});
