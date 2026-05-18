/**
 * System Prompt — 静态内容验证
 */

import { describe, expect, it } from "vitest";
import {
  getLanguageInstruction,
  LANGUAGE_INSTRUCTIONS,
  SYSTEM_PROMPT,
} from "../../../agent/prompts.js";

describe("SYSTEM_PROMPT", () => {
  it("应包含角色定位", () => {
    expect(SYSTEM_PROMPT).toContain("旅途星辰");
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

describe("LANGUAGE_INSTRUCTIONS", () => {
  it("应包含中英日三种语言", () => {
    expect(Object.keys(LANGUAGE_INSTRUCTIONS)).toEqual(["zh", "en", "ja"]);
  });
});
