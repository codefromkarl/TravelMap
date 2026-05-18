/**
 * System Prompt — 静态内容验证
 */

import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../../../agent/prompts.js";

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
});
