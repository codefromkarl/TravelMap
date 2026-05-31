/**
 * Tool 工厂 — 消除工具定义中的样板代码
 *
 * 用法:
 *   export const searchWeatherTool = defineTool({
 *     name: "search_weather",
 *     costTier: "cheap",
 *     label: "天气查询",
 *     description: "...",
 *     parameters: Type.Object({ ... }),
 *     execute: async (params) => { ... },
 *     format: (result, params) => `## ${params.city}天气...`,
 *     errorHint: (params) => `建议根据季节给出穿衣建议`,
 *   });
 *
 * 自动处理:
 *   - try/catch + 错误格式化
 *   - 返回值结构 { content: [{ type: "text", text }], details }
 *   - costTier 注册（通过 registerToolMetadata）
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { registerToolMetadata } from "../services/cost-tracker.js";

// ─── 类型定义 ──────────────────────────────────────────────

type CostTier = "cheap" | "strong";

/** defineTool 的配置对象 */
export interface ToolDef<P extends Record<string, unknown>, R> {
  /** 工具名（Agent 调用时的标识） */
  name: string;
  /** 费用层级 */
  costTier?: CostTier;
  /** 工具显示名 */
  label: string;
  /** 工具描述（给 LLM 看） */
  description: string;
  /** TypeBox 参数 schema */
  parameters: AgentTool["parameters"];
  /** 执行函数 — 只需返回结果，错误由工厂捕获 */
  execute: (params: P) => Promise<R>;
  /** 格式化函数 — 将结果转为 markdown 文本 */
  format: (result: R, params: P) => string;
  /** 错误提示 — 出错时给 LLM 的降级建议 */
  errorHint?: (params: P) => string;
  /** 自定义 details 字段 — 默认返回 { ...params, ...result } */
  details?: (result: R, params: P) => Record<string, unknown>;
}

// ─── 工厂函数 ──────────────────────────────────────────────

/**
 * 从配置对象创建 AgentTool
 *
 * 消除每个工具文件中重复的:
 *   - params 类型断言
 *   - try/catch 错误处理
 *   - { content: [{ type: "text" as const, text }] } 返回结构
 *   - error message 格式化
 */
export function defineTool<P extends Record<string, unknown>, R>(
  def: ToolDef<P, R>,
): AgentTool & { costTier?: CostTier } {
  // 注册 costTier 元数据
  if (def.costTier) {
    registerToolMetadata(def.name, def.costTier);
  }

  return {
    name: def.name,
    costTier: def.costTier,
    label: def.label,
    description: def.description,
    parameters: def.parameters,
    execute: async (_toolCallId: string, rawParams: unknown) => {
      const params = rawParams as P;

      try {
        const result = await def.execute(params);
        const text = def.format(result, params);

        return {
          content: [{ type: "text" as const, text }],
          details: def.details ? def.details(result, params) : { ...params, ...result },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const hint = def.errorHint?.(params) ?? `建议基于常识给出参考信息`;
        const toolLabel = def.label;

        return {
          content: [
            {
              type: "text" as const,
              text: `${toolLabel}遇到问题：${msg}。${hint}`,
            },
          ],
          details: { ...params, error: msg },
        };
      }
    },
  };
}
