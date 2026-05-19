import { Type } from "@earendil-works/pi-ai";

// ─── 景点搜索工具 ──────────────────────────────────────
export const searchAttractionsTool = {
  name: "search_attractions",
  label: "景点搜索",
  description: "搜索指定城市的景点信息",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    preferences: Type.Optional(Type.Array(Type.String())),
    keywords: Type.Optional(Type.String()),
  }),
  execute: async (_id, params) => {
    const { city } = params;
    const mockData = {
      "北京": [
        { name: "故宫博物院", nameZh: "故宫博物院", address: "东城区景山前街4号", ticketPrice: 60, visitDuration: 180, description: "明清皇家宫殿", location: { latitude: 39.9163, longitude: 116.3972 } },
        { name: "天坛公园", nameZh: "天坛公园", address: "东城区天坛内东里7号", ticketPrice: 34, visitDuration: 120, description: "明清帝王祭天场所", location: { latitude: 39.8822, longitude: 116.4066 } },
        { name: "颐和园", nameZh: "颐和园", address: "海淀区新建宫门路19号", ticketPrice: 30, visitDuration: 180, description: "清代皇家园林", location: { latitude: 39.9993, longitude: 116.2757 } },
      ],
      "上海": [
        { name: "外滩", nameZh: "外滩", address: "黄浦区中山东一路", ticketPrice: 0, visitDuration: 90, description: "上海地标", location: { latitude: 31.2397, longitude: 121.4998 } },
        { name: "豫园", nameZh: "豫园", address: "黄浦区安仁街137号", ticketPrice: 40, visitDuration: 120, description: "明代私家园林", location: { latitude: 31.2272, longitude: 121.4921 } },
        { name: "东方明珠", nameZh: "东方明珠", address: "浦东新区世纪大道1号", ticketPrice: 199, visitDuration: 90, description: "上海标志性建筑", location: { latitude: 31.2397, longitude: 121.4998 } },
      ],
      "杭州": [
        { name: "西湖", nameZh: "西湖", address: "杭州市西湖区", ticketPrice: 0, visitDuration: 240, description: "世界文化遗产，杭州名片", location: { latitude: 30.2485, longitude: 120.1466 } },
        { name: "灵隐寺", nameZh: "灵隐寺", address: "西湖区灵隐路法云弄1号", ticketPrice: 75, visitDuration: 150, description: "千年古刹", location: { latitude: 30.2406, longitude: 120.0984 } },
      ],
    };
    const attractions = mockData[city] || [
      { name: `${city}中心公园`, nameZh: `${city}中心公园`, address: `${city}市中心`, ticketPrice: 0, visitDuration: 120, description: `${city}主要城市公园`, location: { latitude: 31.23, longitude: 121.47 } },
    ];
    return {
      content: [{ type: "text", text: `## ${city}景点搜索结果\n\n${attractions.map((a, i) => `${i+1}. **${a.name}** — ¥${a.ticketPrice}\n   ${a.description} | 建议${a.visitDuration}分钟`).join("\n\n")}` }],
      details: { city, attractions },
    };
  },
};