/**
 * XhsRouter — 单元测试
 */

import { describe, expect, it } from "vitest";
import { XhsRouter } from "../../../services/xhs/router.js";
import { createEnvStub } from "../../helpers/env.js";

const env = createEnvStub();

describe("XhsRouter", () => {
  it("默认策略为 priority", () => {
    env.unset("XHS_ROUTER_STRATEGY");
    const router = new XhsRouter();
    expect(router.getStrategy()).toBe("priority");
  });

  it("默认 provider 顺序", () => {
    const router = new XhsRouter();
    const order = router.getProviderOrder();
    expect(order).toContain("rnote");
    expect(order).toContain("justoneapi");
    expect(order).toContain("tikhub");
    expect(order).toContain("crawler");
  });

  it("无配置时无可用 provider", () => {
    env.unset("XHS_API_TOKEN");
    env.unset("XHS_RNOTE_TOKEN");
    env.unset("XHS_TIKHUB_TOKEN");
    env.unset("XHS_CRAWLER_BASE");
    const router = new XhsRouter();
    router.refresh();
    expect(router.hasAvailableProvider()).toBe(false);
  });

  it("getProviderStatus 返回配置状态", () => {
    const router = new XhsRouter();
    const status = router.getProviderStatus();
    expect(status.length).toBeGreaterThan(0);
    for (const s of status) {
      expect(s).toHaveProperty("provider");
      expect(s).toHaveProperty("configured");
    }
  });

  it("refresh 更新策略", () => {
    env.set("XHS_ROUTER_STRATEGY", "cost");
    const router = new XhsRouter();
    router.refresh();
    expect(router.getStrategy()).toBe("cost");
    env.unset("XHS_ROUTER_STRATEGY");
  });
});
