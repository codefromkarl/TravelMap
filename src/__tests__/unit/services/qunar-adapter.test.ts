/**
 * 去哪儿 Adapter 单元测试
 *
 * Mock HTML 响应，验证景点数据解析和服务项过滤。
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchQunar } from "../../../services/free-sources/qunar-adapter.js";
import { server } from "../../mocks/server.js";

describe("searchQunar", () => {
  it("__INITIAL_STATE__ JSON 正确解析", async () => {
    server.use(
      http.get("https://piao.qunar.com/ticket/list.htm", () => {
        const html = `<html><body>
<script>window.__INITIAL_STATE__ = {"sightList":[{"sightName":"故宫博物院","address":"景山前街4号","qunarPrice":60,"score":4.9,"commentCount":12000,"needBooking":true,"sightId":100}]};</script>
</body></html>`;
        return new HttpResponse(html, { headers: { "Content-Type": "text/html" } });
      }),
    );

    const results = await searchQunar({ city: "北京" });
    expect(results.length).toBeGreaterThan(0);

    const gugong = results.find((r) => r.nameZh === "故宫博物院");
    expect(gugong).toBeDefined();
    expect(gugong!.ticketPrice).toBe(60);
    expect(gugong!.rating).toBe(4.9);
    expect(gugong!.reservationRequired).toBe(true);
    expect(gugong!.bookingUrl).toContain("piao.qunar.com");
  });

  it("JSON-LD 结构化数据正确解析", async () => {
    server.use(
      http.get("https://piao.qunar.com/ticket/list.htm", () => {
        const html = `<html><body>
<script type="application/ld+json">{"@type":"Product","name":"天坛公园","offers":{"price":"15"},"aggregateRating":{"ratingValue":"4.7","reviewCount":"5000"}}</script>
</body></html>`;
        return new HttpResponse(html, { headers: { "Content-Type": "text/html" } });
      }),
    );

    const results = await searchQunar({ city: "北京" });
    const tiantan = results.find((r) => r.nameZh === "天坛公园");
    expect(tiantan).toBeDefined();
    expect(tiantan!.ticketPrice).toBe(15);
    expect(tiantan!.rating).toBe(4.7);
  });

  it("过滤服务项（代订/包车/一日游）", async () => {
    server.use(
      http.get("https://piao.qunar.com/ticket/list.htm", () => {
        const html = `<html><body>
<script>window.__INITIAL_STATE__ = {"sightList":[
  {"sightName":"故宫博物院","qunarPrice":60,"score":4.9,"sightId":1},
  {"sightName":"北京代订门票","qunarPrice":50,"score":4.0,"sightId":2},
  {"sightName":"包车一日游","qunarPrice":300,"score":3.5,"sightId":3},
  {"sightName":"接送机服务","qunarPrice":200,"score":3.0,"sightId":4}
]};</script>
</body></html>`;
        return new HttpResponse(html, { headers: { "Content-Type": "text/html" } });
      }),
    );

    const results = await searchQunar({ city: "北京" });
    const names = results.map((r) => r.nameZh);
    expect(names).toContain("故宫博物院");
    expect(names).not.toContain("北京代订门票");
    expect(names).not.toContain("包车一日游");
    expect(names).not.toContain("接送机服务");
  });

  it("HTTP 请求失败时返回空数组", async () => {
    server.use(
      http.get(
        "https://piao.qunar.com/ticket/list.htm",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const results = await searchQunar({ city: "北京" });
    expect(results).toEqual([]);
  });

  it("去重：同名景点只保留一个", async () => {
    server.use(
      http.get("https://piao.qunar.com/ticket/list.htm", () => {
        const html = `<html><body>
<script>window.__INITIAL_STATE__ = {"sightList":[
  {"sightName":"故宫","qunarPrice":60,"score":4.9,"sightId":1},
  {"sightName":"故宫","qunarPrice":55,"score":4.8,"sightId":2}
]};</script>
</body></html>`;
        return new HttpResponse(html, { headers: { "Content-Type": "text/html" } });
      }),
    );

    const results = await searchQunar({ city: "北京" });
    const gugongCount = results.filter((r) => r.nameZh === "故宫").length;
    expect(gugongCount).toBe(1);
  });

  it("空 HTML 返回空数组", async () => {
    server.use(
      http.get("https://piao.qunar.com/ticket/list.htm", () => {
        const html = "<html><body></body></html>";
        return new HttpResponse(html, { headers: { "Content-Type": "text/html" } });
      }),
    );

    const results = await searchQunar({ city: "北京" });
    expect(results).toEqual([]);
  });
});
