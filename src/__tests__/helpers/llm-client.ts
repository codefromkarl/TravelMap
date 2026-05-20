/**
 * 轻量级 OpenAI 兼容 LLM 客户端
 *
 * 绕过 pi-ai 的 Model 注册表，直接调用本地 Docker 的 OpenAI 兼容 API。
 * 使用 node:http 而非 fetch，确保不受代理环境变量影响。
 *
 * 使用方式：
 *   OPENAI_BASE_URL=http://127.0.0.1:8317/v1 \
 *   OPENAI_API_KEY=sk-xxx \
 *   AI_MODEL=ds \
 *   npm run test:ai-e2e
 */

import http from "node:http";

// ─── 类型定义 ──────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// ─── 配置 ──────────────────────────────────────────────────

export function getLlmConfig(): LlmConfig {
  return {
    baseUrl: process.env.OPENAI_BASE_URL || "http://127.0.0.1:8317/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.AI_MODEL || "ds",
  };
}

/** 提取响应文本 */
export function getContent(r: ChatCompletionResponse): string {
  return r.choices?.[0]?.message?.content ?? "";
}

// ─── HTTP 请求封装（绕过代理） ─────────────────────────────

function httpPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = http.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(120_000, () => {
      req.destroy(new Error("Request timeout (120s)"));
    });
    req.write(body);
    req.end();
  });
}

// ─── Chat Completion ──────────────────────────────────────

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; model?: string; retries?: number },
): Promise<ChatCompletionResponse> {
  const config = getLlmConfig();
  const url = `${config.baseUrl}/chat/completions`;
  const maxRetries = options?.retries ?? 2;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const responseBody = await httpPost(
        url,
        JSON.stringify({
          model: options?.model || config.model,
          messages,
          max_tokens: options?.maxTokens ?? 2048,
          temperature: options?.temperature ?? 0.3,
        }),
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
      );

      const result = JSON.parse(responseBody) as ChatCompletionResponse;

      // 检查内容非空
      const content = result.choices?.[0]?.message?.content;
      if (content && content.trim().length > 0) {
        return result;
      }

      // 内容为空，可能是 API 偶发问题
      if (attempt < maxRetries) {
        console.warn(`[llm-client] Empty response, retrying (${attempt + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, 2000)); // 等待 2s 后重试
        continue;
      }

      return result; // 最后一次也返回空结果
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        console.warn(
          `[llm-client] Request failed, retrying (${attempt + 1}/${maxRetries}): ${lastError.message}`,
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  throw lastError ?? new Error("All retries exhausted");
}

// ─── 连接测试 ──────────────────────────────────────────────

export async function testLlmConnection(): Promise<{
  available: boolean;
  model: string;
  baseUrl: string;
  error?: string;
}> {
  const config = getLlmConfig();
  try {
    const result = await chatCompletion([{ role: "user", content: "hi" }], { maxTokens: 5 });
    return { available: true, model: result.model, baseUrl: config.baseUrl };
  } catch (err) {
    return {
      available: false,
      model: config.model,
      baseUrl: config.baseUrl,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
