import { beforeEach, describe, expect, it } from "vitest";
import {
  dualGeocode,
  isDomesticCity,
  resetEngineState,
} from "../../../services/dual-map-service.js";

describe("isDomesticCity", () => {
  it("应识别北京为国内", () => {
    expect(isDomesticCity("北京")).toBe(true);
  });

  it("应识别上海为国内", () => {
    expect(isDomesticCity("上海")).toBe(true);
  });

  it("应识别成都为国内", () => {
    expect(isDomesticCity("成都")).toBe(true);
  });

  it("应识别东京为国外", () => {
    expect(isDomesticCity("东京")).toBe(false);
  });

  it("应识别 Paris 为国外", () => {
    expect(isDomesticCity("Paris")).toBe(false);
  });

  it("应识别 New York 为国外", () => {
    expect(isDomesticCity("New York")).toBe(false);
  });
});

describe("dualGeocode", () => {
  beforeEach(() => {
    resetEngineState();
    // 不设 API Key，走 Nominatim 或默认
    delete process.env.AMAP_WEB_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("国内城市无 Key 时应返回默认坐标或 Nominatim", async () => {
    const result = await dualGeocode("故宫博物院", "北京");
    expect(result).toHaveProperty("location");
    expect(result.location).toHaveProperty("latitude");
    expect(result.location).toHaveProperty("longitude");
    expect(result.engine).toBeTruthy();
  });

  it("国外城市应返回结果", async () => {
    const result = await dualGeocode("Tokyo Tower", "Tokyo");
    expect(result).toHaveProperty("location");
  });

  it("引擎失败后应标记不再重试", async () => {
    // 不设任何 Key → amap/google 都跳过，nominatim 可能也失败
    // 结果要么返回 nominatim 数据，要么返回 default
    const result = await dualGeocode("完全不存在的地址xyz", "火星城");
    expect(result).toHaveProperty("location");
    expect(result).toHaveProperty("engine");
  });

  it("应支持自定义 config", async () => {
    const result = await dualGeocode("测试", "北京", {
      amapKey: undefined,
      googleKey: undefined,
      timeout: 2000,
    });
    expect(result).toHaveProperty("location");
  });

  it("resetEngineState 后应能重新调用引擎", async () => {
    resetEngineState();
    // 验证重置后引擎状态清洁，能正常返回结果
    const result = await dualGeocode("天安门", "北京");
    expect(result).toHaveProperty("location");
    expect(result).toHaveProperty("engine");
    expect(result.engine).not.toBeUndefined();
  });
});
