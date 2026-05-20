/**
 * Wikivoyage Adapter 单元测试
 *
 * Mock Wikivoyage API，验证 wikitext 解析（{{see}} 模板 + 列表项）。
 *
 * 注意：不在 beforeAll 中 server.use()，因为 setup.ts 的 afterEach 会 resetHandlers。
 * 每个 it() 内部自行注册 handler。
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchWikivoyage } from "../../../services/free-sources/wikivoyage-adapter.js";
import { server } from "../../mocks/server.js";

const WIKITEXT_FULL = `==景点==
{{see | name=故宫博物院 | address=景山前街4号 | lat=39.9163 | long=116.3972 | content=明清皇家宫殿，世界文化遗产}}
{{see | name=天坛公园 | address=天坛内东里7号 | lat=39.8822 | long=116.4066 | content=明清祭天建筑群}}
* '''颐和园''' — 皇家园林，以昆明湖万寿山为基址
* [[长城]] — 万里长城，世界七大奇迹之一
`;

function mockParse(wikitext: string) {
  server.use(
    http.get("https://zh.wikivoyage.org/w/api.php", ({ request }) => {
      const url = new URL(request.url);
      const action = url.searchParams.get("action");
      if (action === "parse") {
        return HttpResponse.json({ parse: { wikitext: { "*": wikitext } } });
      }
      if (action === "query") {
        return HttpResponse.json({ query: { pages: { "1": { extract: "城市介绍" } } } });
      }
      return HttpResponse.json({});
    }),
  );
}

describe("searchWikivoyage", () => {
  it("{{see}} 模板正确提取", async () => {
    mockParse(WIKITEXT_FULL);
    const results = await searchWikivoyage({ city: "北京" });

    const gugong = results.find((r) => r.nameZh === "故宫博物院");
    expect(gugong).toBeDefined();
    expect(gugong!.source).toBe("wikivoyage");
    expect(gugong!.address).toContain("景山前街");
    expect(gugong!.location).toBeDefined();
    expect(gugong!.location!.latitude).toBeCloseTo(39.9163, 2);
    expect(gugong!.description).toContain("皇家宫殿");
  });

  it("列表项提取（[[景点名]] — 描述）", async () => {
    mockParse(WIKITEXT_FULL);
    const results = await searchWikivoyage({ city: "北京" });

    const changcheng = results.find((r) => r.nameZh === "长城");
    expect(changcheng).toBeDefined();
    expect(changcheng!.description).toContain("万里长城");
  });

  it("粗体列表项提取（'''景点名''' — 描述）", async () => {
    mockParse(WIKITEXT_FULL);
    const results = await searchWikivoyage({ city: "北京" });

    const yiheyuan = results.find((r) => r.nameZh === "颐和园");
    expect(yiheyuan).toBeDefined();
    expect(yiheyuan!.description).toContain("皇家园林");
  });

  it("API 返回 error 时返回空数组", async () => {
    server.use(
      http.get("https://zh.wikivoyage.org/w/api.php", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("action") === "parse") {
          return HttpResponse.json({ error: { code: "nosuchpage" } });
        }
        return HttpResponse.json({});
      }),
    );

    const results = await searchWikivoyage({ city: "不存在的城市" });
    expect(results).toEqual([]);
  });

  it("wikitext 无景点段落时从全局 {{see}} 提取", async () => {
    mockParse(`==交通==
一些交通信息
{{see | name=西湖 | address=西湖区 | lat=30.25 | long=120.15 | content=杭州著名景点}}
`);

    const results = await searchWikivoyage({ city: "杭州" });
    const xihu = results.find((r) => r.nameZh === "西湖");
    expect(xihu).toBeDefined();
    expect(xihu!.location!.latitude).toBeCloseTo(30.25, 1);
  });

  it("非景点段落项被过滤", async () => {
    mockParse(`==景点==
* '''故宫博物院''' — 皇家宫殿
* 电话咨询 — 12345
`);

    const results = await searchWikivoyage({ city: "北京" });
    const names = results.map((r) => r.nameZh);
    expect(names).toContain("故宫博物院");
    expect(names).not.toContain("电话咨询");
  });

  it("API 500 错误时返回空数组不抛异常", async () => {
    server.use(
      http.get(
        "https://zh.wikivoyage.org/w/api.php",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const results = await searchWikivoyage({ city: "北京" });
    expect(results).toEqual([]);
  });
});
