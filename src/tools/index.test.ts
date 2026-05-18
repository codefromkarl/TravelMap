import { describe, expect, it } from "vitest";
import { createTools } from "./index.js";

describe("tools", () => {
  it("should create all tools", () => {
    const tools = createTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "search_attractions",
      "search_weather",
      "search_hotels",
      "geocode",
    ]);
  });

  it("each tool should have required fields", () => {
    for (const tool of createTools()) {
      expect(tool.name).toBeTruthy();
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeTypeOf("function");
    }
  });
});
