import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateSemantic } from "../../../evaluation/dimensions/semantic.js";
import { requestJudge } from "../../../evaluation/judge.js";
import { judgeAssessment } from "../../mocks/mock-llm.js";

vi.mock("../../../evaluation/judge.js", () => ({ requestJudge: vi.fn() }));
const judgeMock = vi.mocked(requestJudge);
beforeEach(() => {
  judgeMock.mockReset();
  judgeMock.mockImplementation(async (prompt) => ({
    status: "evaluated",
    text: JSON.stringify(
      judgeAssessment(prompt.includes("逻辑连贯性") ? "coherence" : "relevance"),
    ),
    provider: "openai",
    model: "gpt-4o-mini",
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("truthful semantic assessment", () => {
  it("returns a complete assessment with eight visible checks", async () => {
    const result = await evaluateSemantic("杭州亲子旅行", "西湖；每日8小时；预算¥2000；亲子游");
    expect(result.status).toBe("evaluated");
    expect(result.passed).toBe(true);
    expect(result.score).toBeCloseTo(0.8);
    expect(result.checks).toHaveLength(8);
    expect(result.judge).toEqual({ provider: "openai", model: "gpt-4o-mini" });
  });
  it("retains actual failures and suggestions", async () => {
    judgeMock.mockImplementation(async (prompt) => ({
      status: "evaluated",
      text: JSON.stringify(
        judgeAssessment(prompt.includes("逻辑连贯性") ? "coherence" : "relevance", 4),
      ),
      provider: "openai",
      model: "gpt-4o-mini",
    }));
    const result = await evaluateSemantic("budget request", "missing budget");
    expect(result.status).toBe("evaluated");
    expect(result.passed).toBe(false);
    expect(result.score).toBeCloseTo(0.4);
    expect(result.suggestions).toContain("Add concrete itinerary evidence");
  });
  it.each(["skipped", "error"] as const)(
    "marks unavailable Judge as %s without successful placeholder checks",
    async (status) => {
      judgeMock.mockResolvedValue({
        status,
        code: status === "skipped" ? "JUDGE_CREDENTIAL_UNAVAILABLE" : "JUDGE_UPSTREAM_ERROR",
      });
      const result = await evaluateSemantic("input", "output");
      expect(result.status).toBe(status);
      expect(result.passed).toBe(false);
      expect(result.checks).toEqual([]);
      expect(result.score).toBe(0);
      expect(result.failureReason).toBe("语义评估未完成");
    },
  );
  it("retains successful partial evidence while refusing a complete pass", async () => {
    judgeMock.mockResolvedValueOnce({
      status: "evaluated",
      text: JSON.stringify(judgeAssessment("coherence")),
      provider: "openai",
      model: "gpt-4o-mini",
    });
    judgeMock.mockResolvedValueOnce({ status: "error", code: "JUDGE_UPSTREAM_ERROR" });
    const result = await evaluateSemantic("input", "output");
    expect(result.status).toBe("error");
    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(4);
    expect(result.score).toBeCloseTo(0.8);
  });
  it("accepts a complete JSON code block", async () => {
    judgeMock.mockImplementation(async (prompt) => ({
      status: "evaluated",
      text: `\`\`\`json\n${JSON.stringify(judgeAssessment(prompt.includes("逻辑连贯性") ? "coherence" : "relevance"))}\n\`\`\``,
      provider: "openai",
      model: "gpt-4o-mini",
    }));
    expect((await evaluateSemantic("input", "output")).status).toBe("evaluated");
  });
  it.each([
    "not-json",
    "",
    "[]",
    "null",
    "{}",
    JSON.stringify({ coherence_score: 8, checks: [], issues: [], suggestions: [] }),
    JSON.stringify({ ...judgeAssessment("coherence"), coherence_score: "8" }),
    JSON.stringify({
      ...judgeAssessment("coherence"),
      checks: [{ name: "one", score: 8, detail: "partial criteria" }],
    }),
    JSON.stringify({
      ...judgeAssessment("coherence"),
      checks: Array.from({ length: 4 }, () => ({ name: "duplicate", score: 8, detail: "detail" })),
    }),
    JSON.stringify({
      ...judgeAssessment("coherence"),
      checks: judgeAssessment("coherence").checks.map((check) => ({ ...check, score: 11 })),
    }),
    JSON.stringify({
      ...judgeAssessment("coherence"),
      checks: judgeAssessment("coherence").checks.map((check) => ({ ...check, detail: "" })),
    }),
    JSON.stringify({ ...judgeAssessment("coherence"), suggestions: "not an array" }),
  ])("rejects malformed or empty assessment %#", async (text) => {
    judgeMock.mockResolvedValue({
      status: "evaluated",
      text,
      provider: "openai",
      model: "gpt-4o-mini",
    });
    const result = await evaluateSemantic("input", "output");
    expect(result.status).toBe("error");
    expect(result.passed).toBe(false);
    expect(result.checks).toEqual([]);
    expect(result.errorCode).toMatch(/^JUDGE_INVALID_(SCHEMA|JSON)$/);
  });
});
