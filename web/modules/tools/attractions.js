import { Type } from "@earendil-works/pi-ai";
import { CITY_CENTERS } from '../context.js?v=3';

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
        { name: "千岛湖", nameZh: "千岛湖", address: "淳安县", ticketPrice: 150, visitDuration: 300, description: "天下第一秀水", location: { latitude: 29.6086, longitude: 118.9574 } },
      ],
      "成都": [
        { name: "大熊猫繁育研究基地", nameZh: "大熊猫繁育研究基地", address: "成华区熊猫大道1375号", ticketPrice: 55, visitDuration: 180, description: "国宝大熊猫家园", location: { latitude: 30.7341, longitude: 104.1462 } },
        { name: "宽窄巷子", nameZh: "宽窄巷子", address: "青羊区长顺上街", ticketPrice: 0, visitDuration: 120, description: "清代古街，成都名片", location: { latitude: 30.6700, longitude: 104.0528 } },
        { name: "武侯祠", nameZh: "武侯祠", address: "武侯区武侯祠大街231号", ticketPrice: 50, visitDuration: 120, description: "三国文化圣地", location: { latitude: 30.6446, longitude: 104.0482 } },
      ],
      "重庆": [
        { name: "洪崖洞", nameZh: "洪崖洞", address: "渝中区嘉陵江滨江路", ticketPrice: 0, visitDuration: 120, description: "山城地标，吊脚楼群", location: { latitude: 29.5638, longitude: 106.5756 } },
        { name: "磁器口古镇", nameZh: "磁器口古镇", address: "沙坪坝区磁器口", ticketPrice: 0, visitDuration: 150, description: "千年古镇", location: { latitude: 29.5872, longitude: 106.4542 } },
        { name: "长江索道", nameZh: "长江索道", address: "渝中区新华路", ticketPrice: 20, visitDuration: 30, description: "山城空中走廊", location: { latitude: 29.5567, longitude: 106.5800 } },
      ],
      "南京": [
        { name: "中山陵", nameZh: "中山陵", address: "玄武区石象路7号", ticketPrice: 0, visitDuration: 150, description: "孙中山先生陵墓", location: { latitude: 32.0584, longitude: 118.8486 } },
        { name: "夫子庙", nameZh: "夫子庙", address: "秦淮区贡院西街53号", ticketPrice: 30, visitDuration: 120, description: "秦淮风光带核心", location: { latitude: 32.0235, longitude: 118.7880 } },
        { name: "明孝陵", nameZh: "明孝陵", address: "玄武区钟山风景区", ticketPrice: 70, visitDuration: 120, description: "明太祖朱元璋陵墓", location: { latitude: 32.0537, longitude: 118.8484 } },
      ],
      "苏州": [
        { name: "拙政园", nameZh: "拙政园", address: "姑苏区东北街178号", ticketPrice: 70, visitDuration: 120, description: "中国四大名园之首", location: { latitude: 31.3253, longitude: 120.6315 } },
        { name: "虎丘", nameZh: "虎丘", address: "姑苏区虎丘山门内8号", ticketPrice: 60, visitDuration: 90, description: "吴中第一名胜", location: { latitude: 31.3175, longitude: 120.5729 } },
        { name: "平江路", nameZh: "平江路", address: "姑苏区平江路", ticketPrice: 0, visitDuration: 90, description: "千年古街", location: { latitude: 31.3197, longitude: 120.6373 } },
      ],
      "广州": [
        { name: "广州塔", nameZh: "广州塔", address: "海珠区阅江西路222号", ticketPrice: 150, visitDuration: 120, description: "小蛮腰，广州地标", location: { latitude: 23.1066, longitude: 113.3245 } },
        { name: "陈家祠", nameZh: "陈家祠", address: "荔湾区中山七路恩龙里34号", ticketPrice: 10, visitDuration: 90, description: "岭南建筑艺术明珠", location: { latitude: 23.1290, longitude: 113.2449 } },
        { name: "沙面", nameZh: "沙面", address: "荔湾区沙面岛", ticketPrice: 0, visitDuration: 90, description: "欧陆风情小岛", location: { latitude: 23.1096, longitude: 113.2376 } },
      ],
      "深圳": [
        { name: "世界之窗", nameZh: "世界之窗", address: "南山区深南大道9037号", ticketPrice: 200, visitDuration: 300, description: "世界微缩景观", location: { latitude: 22.5348, longitude: 113.9728 } },
        { name: "大梅沙海滨公园", nameZh: "大梅沙海滨公园", address: "盐田区大梅沙", ticketPrice: 0, visitDuration: 180, description: "深圳最美海滩", location: { latitude: 22.5976, longitude: 114.3205 } },
      ],
      "厦门": [
        { name: "鼓浪屿", nameZh: "鼓浪屿", address: "思明区鼓浪屿", ticketPrice: 0, visitDuration: 300, description: "海上花园，万国建筑", location: { latitude: 24.4437, longitude: 118.0648 } },
        { name: "南普陀寺", nameZh: "南普陀寺", address: "思明区思明南路515号", ticketPrice: 0, visitDuration: 90, description: "闽南佛教圣地", location: { latitude: 24.4405, longitude: 118.0959 } },
        { name: "曾厝垵", nameZh: "曾厝垵", address: "思明区曾厝垵", ticketPrice: 0, visitDuration: 120, description: "文艺渔村", location: { latitude: 24.4328, longitude: 118.1104 } },
      ],
      "武汉": [
        { name: "黄鹤楼", nameZh: "黄鹤楼", address: "武昌区蛇山西山坡特1号", ticketPrice: 70, visitDuration: 90, description: "天下江山第一楼", location: { latitude: 30.5434, longitude: 114.3013 } },
        { name: "户部巷", nameZh: "户部巷", address: "武昌区自由路", ticketPrice: 0, visitDuration: 60, description: "汉味小吃第一巷", location: { latitude: 30.5427, longitude: 114.2974 } },
        { name: "东湖", nameZh: "东湖", address: "武昌区东湖路", ticketPrice: 0, visitDuration: 180, description: "中国最大城中湖", location: { latitude: 30.5617, longitude: 114.3720 } },
      ],
      "长沙": [
        { name: "岳麓山", nameZh: "岳麓山", address: "岳麓区登高路58号", ticketPrice: 0, visitDuration: 180, description: "南岳衡山72峰尾峰", location: { latitude: 28.1841, longitude: 112.9327 } },
        { name: "橘子洲", nameZh: "橘子洲", address: "岳麓区橘子洲头", ticketPrice: 0, visitDuration: 120, description: "毛泽东青年雕塑", location: { latitude: 28.1765, longitude: 112.9524 } },
        { name: "太平老街", nameZh: "太平老街", address: "天心区太平街", ticketPrice: 0, visitDuration: 90, description: "千年古街", location: { latitude: 28.1978, longitude: 112.9707 } },
      ],
      "青岛": [
        { name: "栈桥", nameZh: "栈桥", address: "市南区太平路12号", ticketPrice: 0, visitDuration: 60, description: "青岛地标", location: { latitude: 36.0615, longitude: 120.3259 } },
        { name: "八大关", nameZh: "八大关", address: "市南区八大关", ticketPrice: 0, visitDuration: 120, description: "万国建筑博览会", location: { latitude: 36.0557, longitude: 120.3482 } },
        { name: "崂山", nameZh: "崂山", address: "崂山区崂山景区", ticketPrice: 90, visitDuration: 300, description: "海上第一名山", location: { latitude: 36.1670, longitude: 120.6319 } },
      ],
      "大连": [
        { name: "星海广场", nameZh: "星海广场", address: "沙河口区中山路", ticketPrice: 0, visitDuration: 90, description: "亚洲最大城市广场", location: { latitude: 38.8734, longitude: 121.5834 } },
        { name: "老虎滩海洋公园", nameZh: "老虎滩海洋公园", address: "中山区滨海中路9号", ticketPrice: 210, visitDuration: 240, description: "国家5A级景区", location: { latitude: 38.8792, longitude: 121.6882 } },
      ],
      "昆明": [
        { name: "滇池", nameZh: "滇池", address: "西山区滇池路", ticketPrice: 0, visitDuration: 120, description: "高原明珠", location: { latitude: 24.9327, longitude: 102.6810 } },
        { name: "石林", nameZh: "石林", address: "石林县", ticketPrice: 130, visitDuration: 240, description: "天下第一奇观", location: { latitude: 24.7736, longitude: 103.3279 } },
        { name: "翠湖公园", nameZh: "翠湖公园", address: "五华区翠湖南路67号", ticketPrice: 0, visitDuration: 60, description: "昆明城市名片", location: { latitude: 25.0467, longitude: 102.7065 } },
      ],
      "三亚": [
        { name: "亚龙湾", nameZh: "亚龙湾", address: "吉阳区亚龙湾", ticketPrice: 0, visitDuration: 240, description: "天下第一湾", location: { latitude: 18.1863, longitude: 109.6284 } },
        { name: "天涯海角", nameZh: "天涯海角", address: "天涯区天涯镇", ticketPrice: 68, visitDuration: 120, description: "浪漫地标", location: { latitude: 18.2988, longitude: 109.3540 } },
        { name: "南山寺", nameZh: "南山寺", address: "崖州区南山", ticketPrice: 129, visitDuration: 180, description: "108米海上观音", location: { latitude: 18.2975, longitude: 109.2078 } },
      ],
      "桂林": [
        { name: "漓江", nameZh: "漓江", address: "桂林至阳朔段", ticketPrice: 210, visitDuration: 300, description: "桂林山水甲天下", location: { latitude: 25.2744, longitude: 110.2990 } },
        { name: "象鼻山", nameZh: "象鼻山", address: "象山区滨江路", ticketPrice: 55, visitDuration: 60, description: "桂林城徽", location: { latitude: 25.2637, longitude: 110.2928 } },
        { name: "阳朔西街", nameZh: "阳朔西街", address: "阳朔县西街", ticketPrice: 0, visitDuration: 120, description: "地球村", location: { latitude: 24.7777, longitude: 110.4966 } },
      ],
      "拉萨": [
        { name: "布达拉宫", nameZh: "布达拉宫", address: "城关区北京中路35号", ticketPrice: 200, visitDuration: 180, description: "世界屋脊上的明珠", location: { latitude: 29.6575, longitude: 91.1172 } },
        { name: "大昭寺", nameZh: "大昭寺", address: "城关区八角街", ticketPrice: 85, visitDuration: 120, description: "藏传佛教圣地", location: { latitude: 29.6525, longitude: 91.1318 } },
        { name: "八廓街", nameZh: "八廓街", address: "城关区八廓街", ticketPrice: 0, visitDuration: 90, description: "千年转经路", location: { latitude: 29.6522, longitude: 91.1310 } },
      ],
      "哈尔滨": [
        { name: "圣索菲亚教堂", nameZh: "圣索菲亚教堂", address: "道里区透笼街88号", ticketPrice: 15, visitDuration: 60, description: "远东最大东正教堂", location: { latitude: 45.7732, longitude: 126.6277 } },
        { name: "中央大街", nameZh: "中央大街", address: "道里区中央大街", ticketPrice: 0, visitDuration: 120, description: "亚洲最长步行街", location: { latitude: 45.7748, longitude: 126.6170 } },
        { name: "冰雪大世界", nameZh: "冰雪大世界", address: "松北区", ticketPrice: 298, visitDuration: 240, description: "冰雪奇观", location: { latitude: 45.7890, longitude: 126.5782 } },
      ],
      "天津": [
        { name: "五大道", nameZh: "五大道", address: "和平区重庆道83号", ticketPrice: 0, visitDuration: 120, description: "万国建筑博览会", location: { latitude: 39.1127, longitude: 117.1964 } },
        { name: "天津之眼", nameZh: "天津之眼", address: "河北区三岔河口", ticketPrice: 70, visitDuration: 30, description: "桥上摩天轮", location: { latitude: 39.1516, longitude: 117.1751 } },
        { name: "古文化街", nameZh: "古文化街", address: "南开区通北路", ticketPrice: 0, visitDuration: 90, description: "津门故里", location: { latitude: 39.1425, longitude: 117.1769 } },
      ],
      "洛阳": [
        { name: "龙门石窟", nameZh: "龙门石窟", address: "洛龙区龙门镇", ticketPrice: 90, visitDuration: 180, description: "世界文化遗产", location: { latitude: 34.5631, longitude: 112.4739 } },
        { name: "白马寺", nameZh: "白马寺", address: "洛白马寺镇", ticketPrice: 35, visitDuration: 120, description: "中国第一古刹", location: { latitude: 34.5832, longitude: 112.5828 } },
      ],
      "丽江": [
        { name: "丽江古城", nameZh: "丽江古城", address: "古城区", ticketPrice: 0, visitDuration: 240, description: "世界文化遗产", location: { latitude: 26.8721, longitude: 100.2299 } },
        { name: "玉龙雪山", nameZh: "玉龙雪山", address: "玉龙县", ticketPrice: 100, visitDuration: 300, description: "纳西族神山", location: { latitude: 27.0030, longitude: 100.1735 } },
      ],
      "黄山": [
        { name: "黄山风景区", nameZh: "黄山风景区", address: "黄山区", ticketPrice: 190, visitDuration: 480, description: "天下第一奇山", location: { latitude: 30.1379, longitude: 118.1694 } },
      ],
      "张家界": [
        { name: "张家界国家森林公园", nameZh: "张家界国家森林公园", address: "武陵源区", ticketPrice: 225, visitDuration: 480, description: "阿凡达取景地", location: { latitude: 29.3249, longitude: 110.4342 } },
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