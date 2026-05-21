import { Type } from "@earendil-works/pi-ai";
import { CITY_CENTERS } from '../context.js';

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
      "西安": [
        { name: "秦始皇兵马俑博物馆", nameZh: "秦始皇兵马俑博物馆", address: "临潼区秦陵北路", ticketPrice: 120, visitDuration: 240, description: "世界第八大奇迹", location: { latitude: 34.3848, longitude: 109.2734 } },
        { name: "西安城墙", nameZh: "西安城墙", address: "碑林区南大街", ticketPrice: 54, visitDuration: 120, description: "中国现存最完整的古城墙", location: { latitude: 34.2658, longitude: 108.9541 } },
        { name: "大雁塔", nameZh: "大雁塔", address: "雁塔区雁塔南路", ticketPrice: 40, visitDuration: 90, description: "唐代著名佛塔", location: { latitude: 34.2189, longitude: 108.9641 } },
        { name: "陕西历史博物馆", nameZh: "陕西历史博物馆", address: "雁塔区小寨东路91号", ticketPrice: 0, visitDuration: 180, description: "中国第一座大型现代化国家级博物馆", location: { latitude: 34.2317, longitude: 108.9426 } },
        { name: "钟楼", nameZh: "钟楼", address: "碑林区东西南北四条大街交汇处", ticketPrice: 30, visitDuration: 60, description: "西安标志性建筑", location: { latitude: 34.2658, longitude: 108.9413 } },
        { name: "鼓楼", nameZh: "鼓楼", address: "碑林区西大街", ticketPrice: 30, visitDuration: 60, description: "明清建筑", location: { latitude: 34.2636, longitude: 108.9400 } },
        { name: "回民街", nameZh: "回民街", address: "碑林区北院门", ticketPrice: 0, visitDuration: 120, description: "西安著名美食街", location: { latitude: 34.2672, longitude: 108.9386 } },
        { name: "大唐不夜城", nameZh: "大唐不夜城", address: "雁塔区慈恩路", ticketPrice: 0, visitDuration: 120, description: "盛唐文化主题步行街", location: { latitude: 34.2175, longitude: 108.9636 } },
        { name: "华清宫", nameZh: "华清宫", address: "临潼区华清路38号", ticketPrice: 120, visitDuration: 120, description: "唐代皇家温泉行宫", location: { latitude: 34.3622, longitude: 109.2984 } },
      ],
    };
    const cityCenter = CITY_CENTERS[city];
    const fallbackLat = cityCenter ? cityCenter[0] : 35.86;
    const fallbackLng = cityCenter ? cityCenter[1] : 104.20;
    const attractions = mockData[city] || [
      { name: `${city}博物馆`, nameZh: `${city}博物馆`, address: `${city}市中心`, ticketPrice: 0, visitDuration: 180, description: `${city}代表性博物馆`, location: { latitude: fallbackLat + 0.01, longitude: fallbackLng + 0.01 } },
      { name: `${city}老街`, nameZh: `${city}老街`, address: `${city}老城区`, ticketPrice: 0, visitDuration: 120, description: `${city}历史街区`, location: { latitude: fallbackLat - 0.01, longitude: fallbackLng + 0.005 } },
      { name: `${city}公园`, nameZh: `${city}公园`, address: `${city}市中心`, ticketPrice: 0, visitDuration: 90, description: `${city}主要城市公园`, location: { latitude: fallbackLat + 0.005, longitude: fallbackLng - 0.01 } },
    ];
    return {
      content: [{ type: "text", text: `## ${city}景点搜索结果\n\n${attractions.map((a, i) => `${i+1}. **${a.name}** — ¥${a.ticketPrice}\n   ${a.description} | 建议${a.visitDuration}分钟`).join("\n\n")}` }],
      details: { city, attractions },
    };
  },
};