/**
 * 语义维度评估器
 *
 * 评估维度：
 *   - 逻辑连贯性：行程安排是否合理，有无矛盾
 *   - 需求相关性：是否满足用户的具体需求
 *
 * 设计原则：
 *   - 使用 LLM-as-Judge 进行语义评估（独立评审，不与生成模型共享上下文）
 *   - 评估 Prompt 标准化，避免偏见
 *   - 返回结构化结果，支持归因分析
 */

import type { CheckResult, DimensionResult, EvalContext } from "../dimensions.js";
import { requestJudge } from "../judge.js";

// ─── 语义评估 Prompt ───────────────────────────────────────

const COHERENCE_JUDGE_PROMPT = `你是一个旅行规划质量评审专家。请评估以下旅行计划的逻辑连贯性。

**评估标准（每项 0-10 分）**：
1. 景点顺序合理性：同一天的景点地理位置是否相近，路线是否顺畅
2. 时间安排合理性：每天的行程是否在 3-12 小时内，有无过紧或过松
3. 衔接自然性：餐饮、住宿、交通是否与景点安排自然衔接
4. 整体逻辑性：多天行程是否有整体规划逻辑（如由远及近、主题分组等）

**用户需求**：
{input}

**Agent 输出**：
{output}

**评分校准规则**：
- 只依据用户需求和 Agent 输出中的可见证据评分，不要臆测未出现的信息。
- 6 分为最低可接受；8 分代表可直接执行且基本无明显缺口；10 分只给证据充分、细节完整的输出。
- 如果输出缺少地理邻近性、时间跨度、交通衔接等证据，对应检查项不得高于 6 分。
- 问题和建议必须引用具体缺口，避免泛泛而谈。

请返回严格 JSON 格式：
{
  "coherence_score": <0-10>,
  "checks": [
    {"name": "景点顺序", "score": <0-10>, "detail": "<评价>"},
    {"name": "时间安排", "score": <0-10>, "detail": "<评价>"},
    {"name": "衔接自然", "score": <0-10>, "detail": "<评价>"},
    {"name": "整体逻辑", "score": <0-10>, "detail": "<评价>"}
  ],
  "issues": ["<问题1>", "<问题2>"],
  "suggestions": ["<建议1>", "<建议2>"]
}`;

const RELEVANCE_JUDGE_PROMPT = `你是一个旅行规划质量评审专家。请评估以下旅行计划是否满足用户的特定需求。

**评估标准（每项 0-10 分）**：
1. 主题契合度：是否符合用户指定的主题（如美食、亲子、文化等）
2. 预算匹配度：是否在用户指定的预算范围内
3. 人群适配度：是否考虑了同行人员的特殊需求（如老人、儿童）
4. 时间匹配度：天数是否符合用户要求

**用户需求**：
{input}

**Agent 输出**：
{output}

**评分校准规则**：
- 只依据用户需求和 Agent 输出中的可见证据评分，不要臆测未出现的信息。
- 6 分为最低可接受；8 分代表明确回应用户需求；10 分只给主题、预算、人群和天数均证据充分的输出。
- 用户明确提出的偏好未被回应时，对应检查项不得高于 5 分。
- 问题和建议必须引用具体未满足的需求点。

请返回严格 JSON 格式：
{
  "relevance_score": <0-10>,
  "checks": [
    {"name": "主题契合", "score": <0-10>, "detail": "<评价>"},
    {"name": "预算匹配", "score": <0-10>, "detail": "<评价>"},
    {"name": "人群适配", "score": <0-10>, "detail": "<评价>"},
    {"name": "时间匹配", "score": <0-10>, "detail": "<评价>"}
  ],
  "issues": ["<问题1>", "<问题2>"],
  "suggestions": ["<建议1>", "<建议2>"]
}`;

// ─── 语义连贯性评估 ─────────────────────────────────────────

export async function evaluateSemantic(
  input: string,
  output: string,
  _context?: EvalContext,
): Promise<DimensionResult> {
  const checks: CheckResult[] = [];

  // 1. 逻辑连贯性评估（LLM Judge）
  const coherenceResult = await evaluateCoherence(input, output);
  checks.push(...coherenceResult.checks);

  // 2. 需求相关性评估（LLM Judge）
  const relevanceResult = await evaluateRelevance(input, output);
  checks.push(...relevanceResult.checks);

  const availableChecks = checks;
  const status =
    coherenceResult.status === "error" || relevanceResult.status === "error"
      ? "error"
      : coherenceResult.status === "skipped" || relevanceResult.status === "skipped"
        ? "skipped"
        : "evaluated";
  const totalScore = availableChecks.length
    ? availableChecks.reduce((sum, c) => sum + c.score, 0) / availableChecks.length
    : 0;
  const allPassed =
    status === "evaluated" && availableChecks.length > 0 && availableChecks.every((c) => c.passed);
  const unavailable = [coherenceResult, relevanceResult].find(
    (result) => result.status !== "evaluated",
  );
  return {
    dimensionId: "semantic",
    status,
    score: totalScore,
    passed: allPassed,
    checks: availableChecks,
    errorCode: unavailable?.errorCode,
    judge: coherenceResult.judge || relevanceResult.judge,
    failureReason:
      status !== "evaluated" ? "语义评估未完成" : allPassed ? undefined : "语义评估未通过",
    suggestions: [...coherenceResult.suggestions, ...relevanceResult.suggestions],
  };
}

// ─── LLM Judge 调用 ────────────────────────────────────────

interface JudgeResult {
  status: "evaluated" | "skipped" | "error";
  errorCode?: string;
  judge?: { provider?: string; model?: string };
  score: number;
  checks: CheckResult[];
  suggestions: string[];
}

async function evaluateCoherence(input: string, output: string): Promise<JudgeResult> {
  const prompt = COHERENCE_JUDGE_PROMPT.replace("{input}", input).replace(
    "{output}",
    output.slice(0, 3000),
  );

  return callJudge(prompt, "coherence");
}

async function evaluateRelevance(input: string, output: string): Promise<JudgeResult> {
  const prompt = RELEVANCE_JUDGE_PROMPT.replace("{input}", input).replace(
    "{output}",
    output.slice(0, 3000),
  );

  return callJudge(prompt, "relevance");
}

/** Strict JSON from the Judge is evidence only after the complete schema is validated. */
async function callJudge(prompt: string, judgeType: string): Promise<JudgeResult> {
  const response = await requestJudge(prompt);
  const judge = { provider: response.provider, model: response.model };
  const unavailable = (status: "skipped" | "error", errorCode: string): JudgeResult => ({
    status,
    errorCode,
    judge,
    score: 0,
    checks: [],
    suggestions: [],
  });
  if (response.status !== "evaluated") return unavailable(response.status, response.code);
  try {
    const raw = response.text
      .trim()
      .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, "$1")
      .trim();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return unavailable("error", "JUDGE_INVALID_SCHEMA");
    const value = parsed as Record<string, unknown>;
    const finiteScore = (score: unknown): score is number =>
      typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 10;
    const strings = (items: unknown): items is string[] =>
      Array.isArray(items) && items.every((item) => typeof item === "string");
    if (
      !finiteScore(value[`${judgeType}_score`]) ||
      !Array.isArray(value.checks) ||
      value.checks.length !== 4 ||
      !strings(value.issues) ||
      !strings(value.suggestions)
    )
      return unavailable("error", "JUDGE_INVALID_SCHEMA");
    const checks: CheckResult[] = [];
    for (const check of value.checks) {
      if (
        !check ||
        typeof check !== "object" ||
        Array.isArray(check) ||
        typeof check.name !== "string" ||
        !check.name.trim() ||
        typeof check.detail !== "string" ||
        !check.detail.trim() ||
        !finiteScore(check.score)
      )
        return unavailable("error", "JUDGE_INVALID_SCHEMA");
      checks.push({
        name: `${check.name} (LLM Judge)`,
        passed: check.score >= 6,
        score: check.score / 10,
        detail: check.detail,
      });
    }
    if (new Set(checks.map((check) => check.name)).size !== 4)
      return unavailable("error", "JUDGE_INVALID_SCHEMA");
    return {
      status: "evaluated",
      judge,
      score: value[`${judgeType}_score`] as number,
      checks,
      suggestions: value.suggestions,
    };
  } catch {
    return unavailable("error", "JUDGE_INVALID_JSON");
  }
}
