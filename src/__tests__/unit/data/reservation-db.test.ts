import { describe, expect, it } from "vitest";
import {
  fuzzyLookupReservation,
  getAllReservationEntries,
  getReservationUrlMap,
  lookupReservation,
} from "../../../data/reservation-db.js";

describe("reservation-db", () => {
  describe("lookupReservation — 精确查询", () => {
    it("精确匹配景点名", () => {
      const entry = lookupReservation("故宫博物院");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toBe("https://www.dpm.org.cn/visit/ticket.html");
      expect(entry!.advanceDays).toBe(7);
      expect(entry!.releaseTime).toBe("20:00");
    });

    it("不存在的景点返回 undefined", () => {
      expect(lookupReservation("不存在的景点")).toBeUndefined();
    });

    it("所有条目都有必要字段", () => {
      const all = getAllReservationEntries();
      for (const [name, entry] of Object.entries(all)) {
        expect(entry.officialUrl, `${name} 缺少 officialUrl`).toBeTruthy();
        expect(entry.platform, `${name} 缺少 platform`).toBeTruthy();
        expect(entry.tips, `${name} 缺少 tips`).toBeTruthy();
        expect(typeof entry.advanceDays, `${name} advanceDays 应为数字`).toBe("number");
      }
    });
  });

  describe("fuzzyLookupReservation — 模糊查询", () => {
    it("别名匹配：故宫 → 故宫博物院", () => {
      const entry = fuzzyLookupReservation("故宫");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("dpm.org.cn");
    });

    it("别名匹配：兵马俑 → 秦始皇兵马俑", () => {
      const entry = fuzzyLookupReservation("兵马俑");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("bmy.com.cn");
    });

    it("别名匹配：迪士尼 → 上海迪士尼乐园", () => {
      const entry = fuzzyLookupReservation("迪士尼");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("shanghaidisneyresort");
    });

    it("别名匹配：熊猫基地 → 成都大熊猫繁育研究基地", () => {
      const entry = fuzzyLookupReservation("熊猫基地");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("panda.org.cn");
    });

    it("别名匹配：小蛮腰 → 广州塔", () => {
      const entry = fuzzyLookupReservation("小蛮腰");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("cantontower");
    });

    it("别名匹配：紫禁城 → 故宫博物院", () => {
      const entry = fuzzyLookupReservation("紫禁城");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("dpm.org.cn");
    });

    it("别名匹配：国博 → 国家博物馆", () => {
      const entry = fuzzyLookupReservation("国博");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("chnmuseum");
    });

    it("去后缀匹配：颐和园风景区 → 颐和园", () => {
      const entry = fuzzyLookupReservation("颐和园风景区");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("summerpalace");
    });

    it("去后缀匹配：灵隐寺公园 → 灵隐寺", () => {
      const entry = fuzzyLookupReservation("灵隐寺公园");
      expect(entry).toBeDefined();
    });

    it("包含匹配：八达岭长城 → 八达岭长城", () => {
      const entry = fuzzyLookupReservation("八达岭长城景区");
      expect(entry).toBeDefined();
      expect(entry!.officialUrl).toContain("badaling");
    });

    it("不存在的景点返回 undefined", () => {
      expect(fuzzyLookupReservation("一个完全不存在的地方xyz")).toBeUndefined();
    });
  });

  describe("getReservationUrlMap — URL 映射", () => {
    it("返回所有景点的 URL 映射", () => {
      const map = getReservationUrlMap();
      expect(Object.keys(map).length).toBeGreaterThanOrEqual(50);
      expect(map["故宫博物院"]).toBe("https://www.dpm.org.cn/visit/ticket.html");
      expect(map["布达拉宫"]).toBe("https://www.potalapalace.cn/");
    });

    it("映射中每个值都是有效 URL", () => {
      const map = getReservationUrlMap();
      for (const [name, url] of Object.entries(map)) {
        expect(url, `${name} 的 URL 应以 http 开头`).toMatch(/^https?:\/\//);
      }
    });
  });

  describe("覆盖范围验证", () => {
    it("覆盖北京核心景点", () => {
      const beijingCore = [
        "故宫博物院",
        "国家博物馆",
        "八达岭长城",
        "颐和园",
        "天坛公园",
        "恭王府",
        "雍和宫",
      ];
      for (const name of beijingCore) {
        expect(lookupReservation(name), `缺少北京景点: ${name}`).toBeDefined();
      }
    });

    it("覆盖西安核心景点", () => {
      const xianCore = ["秦始皇帝陵博物院", "陕西历史博物馆", "华清宫", "西安城墙"];
      for (const name of xianCore) {
        expect(lookupReservation(name), `缺少西安景点: ${name}`).toBeDefined();
      }
    });

    it("覆盖一线城市+热门目的地", () => {
      const hotCities = [
        "上海迪士尼乐园",   // 上海
        "成都大熊猫繁育研究基地", // 成都
        "布达拉宫",         // 拉萨
        "莫高窟",           // 敦煌
        "九寨沟",           // 四川
        "黄山",             // 安徽
      ];
      for (const name of hotCities) {
        expect(lookupReservation(name), `缺少热门景点: ${name}`).toBeDefined();
      }
    });

    it("总数 >= 50 条", () => {
      const all = getAllReservationEntries();
      expect(Object.keys(all).length).toBeGreaterThanOrEqual(50);
    });
  });
});
