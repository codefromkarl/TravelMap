/**
 * System Prompt — 静态内容验证
 */

import { describe, expect, it } from "vitest";
import {
  getLanguageInstruction,
  getPhasePrompt,
  LANGUAGE_INSTRUCTIONS,
  PLANNING_PROMPT,
  SEARCH_PROMPT,
  STEERING_PROMPT,
  SYSTEM_PROMPT,
} from "../../../agent/prompts.js";

describe("SYSTEM_PROMPT", () => {
  it("应包含角色定位", () => {
    expect(SYSTEM_PROMPT).toContain("旅图");
    expect(SYSTEM_PROMPT).toContain("旅行管家");
  });

  it("应包含工作流程", () => {
    expect(SYSTEM_PROMPT).toContain("景点搜索");
    expect(SYSTEM_PROMPT).toContain("天气查询");
    expect(SYSTEM_PROMPT).toContain("酒店推荐");
    expect(SYSTEM_PROMPT).toContain("行程编排");
  });

  it("应包含输出格式要求", () => {
    expect(SYSTEM_PROMPT).toContain("JSON");
  });

  it("应包含重要规则", () => {
    expect(SYSTEM_PROMPT).toContain("地理位置");
    expect(SYSTEM_PROMPT).toContain("2-3 个景点");
    expect(SYSTEM_PROMPT).toContain("三餐");
  });

  it("应支持多城市规划", () => {
    expect(SYSTEM_PROMPT).toContain("多城市");
    expect(SYSTEM_PROMPT).toContain("城际");
  });

  it("应包含语言控制占位符", () => {
    expect(SYSTEM_PROMPT).toContain("{{LANGUAGE_INSTRUCTION}}");
  });
});

describe("getLanguageInstruction", () => {
  it("中文/undefined 返回空字符串", () => {
    expect(getLanguageInstruction()).toBe("");
    expect(getLanguageInstruction("zh")).toBe("");
    expect(getLanguageInstruction(undefined)).toBe("");
  });

  it("英文返回英文指令", () => {
    const instruction = getLanguageInstruction("en");
    expect(instruction).toContain("English");
    expect(instruction).toContain("original");
  });

  it("日文返回日文指令", () => {
    const instruction = getLanguageInstruction("ja");
    expect(instruction).toContain("日本語");
    expect(instruction).toContain("観光");
  });

  it("未知语言返回空字符串", () => {
    expect(getLanguageInstruction("fr")).toBe("");
  });
});

describe("分阶段 Prompt", () => {
  describe("SEARCH_PROMPT", () => {
    it("应包含角色定位", () => {
      expect(SEARCH_PROMPT).toContain("旅图");
    });

    it("应提示搜索结果已预加载", () => {
      expect(SEARCH_PROMPT).toContain("系统已自动搜索");
    });

    it("长度应明显小于 PLANNING_PROMPT", () => {
      expect(SEARCH_PROMPT.length).toBeLessThan(PLANNING_PROMPT.length * 0.4);
    });

    it("应包含 JSON 输出要求", () => {
      expect(SEARCH_PROMPT).toContain("JSON");
    });
  });

  describe("PLANNING_PROMPT", () => {
    it("应等同于 SYSTEM_PROMPT（向后兼容）", () => {
      expect(PLANNING_PROMPT).toBe(SYSTEM_PROMPT);
    });

    it("应包含完整工作流程", () => {
      expect(PLANNING_PROMPT).toContain("景点搜索");
      expect(PLANNING_PROMPT).toContain("天气查询");
      expect(PLANNING_PROMPT).toContain("行程编排");
    });
  });

  describe("STEERING_PROMPT", () => {
    it("应包含微调规则", () => {
      expect(STEERING_PROMPT).toContain("最小化修改");
      expect(STEERING_PROMPT).toContain("只修改用户指定的天数");
    });

    it("长度应明显小于 PLANNING_PROMPT", () => {
      expect(STEERING_PROMPT.length).toBeLessThan(PLANNING_PROMPT.length * 0.3);
    });
  });

  describe("getPhasePrompt", () => {
    it("search 阶段应返回 SEARCH_PROMPT", () => {
      const prompt = getPhasePrompt("search");
      expect(prompt).toContain("旅图");
      expect(prompt).toContain("系统已自动搜索");
    });

    it("planning 阶段应返回 PLANNING_PROMPT", () => {
      const prompt = getPhasePrompt("planning");
      expect(prompt).toContain("工作流程");
      expect(prompt).toContain("景点搜索");
    });

    it("steering 阶段应返回 STEERING_PROMPT", () => {
      const prompt = getPhasePrompt("steering");
      expect(prompt).toContain("最小化修改");
    });

    it("应支持语言注入", () => {
      const prompt = getPhasePrompt("search", "en");
      expect(prompt).toContain("English");
    });
  });
});

describe("LANGUAGE_INSTRUCTIONS", () => {
  it("应包含中英日三种语言", () => {
    expect(Object.keys(LANGUAGE_INSTRUCTIONS)).toEqual(["zh", "en", "ja"]);
  });
});
