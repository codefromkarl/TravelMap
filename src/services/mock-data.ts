/**
 * 共享 Mock 景点数据 — attraction-service 和 multi-source-service 的唯一数据源
 *
 * 新增城市只需在此文件添加，两个 Service 自动获得降级数据。
 */

import type { Attraction } from "../types/trip.js";

export interface MockAttractionParams {
  city: string;
  preferences?: string[];
  keywords?: string;
}

const MOCK_DATA: Record<string, Attraction[]> = {
  北京: [
    {
      name: "故宫博物院",
      nameZh: "故宫博物院",
      nameEn: "The Palace Museum",
      address: "北京市东城区景山前街4号",
      location: { latitude: 39.9163, longitude: 116.3972 },
      visitDuration: 180,
      description: "中国明清两代的皇家宫殿，世界上现存规模最大、保存最完整的木质结构古建筑群",
      category: "博物馆",
      ticketPrice: 60,
      reservationRequired: true,
      reservationTips: "需提前在官网预约，旺季建议提前7天",
    },
    {
      name: "天坛公园",
      nameZh: "天坛公园",
      nameEn: "Temple of Heaven",
      address: "北京市东城区天坛内东里7号",
      location: { latitude: 39.8822, longitude: 116.4066 },
      visitDuration: 120,
      description: "明清两朝帝王祭天祈谷的场所，世界文化遗产",
      category: "历史遗迹",
      ticketPrice: 34,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "颐和园",
      nameZh: "颐和园",
      nameEn: "Summer Palace",
      address: "北京市海淀区新建宫门路19号",
      location: { latitude: 39.9999, longitude: 116.2755 },
      visitDuration: 180,
      description: "中国古典园林之首，清代皇家园林",
      category: "公园",
      ticketPrice: 30,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "八达岭长城",
      nameZh: "八达岭长城",
      nameEn: "Badaling Great Wall",
      address: "北京市延庆区G6京藏高速58号出口",
      location: { latitude: 40.3539, longitude: 116.0064 },
      visitDuration: 240,
      description: "万里长城最具代表性的段落，世界文化遗产",
      category: "历史遗迹",
      ticketPrice: 40,
      reservationRequired: true,
      reservationTips: "建议提前在网上购票",
    },
    {
      name: "天安门广场",
      nameZh: "天安门广场",
      nameEn: "Tiananmen Square",
      address: "北京市东城区",
      location: { latitude: 39.9054, longitude: 116.3976 },
      visitDuration: 60,
      description: "世界上最大的城市广场之一，中国的象征",
      category: "地标",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    },
  ],
  上海: [
    {
      name: "外滩",
      nameZh: "外滩",
      nameEn: "The Bund",
      address: "上海市黄浦区中山东一路",
      location: { latitude: 31.2397, longitude: 121.4918 },
      visitDuration: 90,
      description: "上海地标，可观赏浦东天际线和欧式建筑群",
      category: "地标",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "豫园",
      nameZh: "豫园",
      nameEn: "Yu Garden",
      address: "上海市黄浦区安仁街137号",
      location: { latitude: 31.2272, longitude: 121.4929 },
      visitDuration: 120,
      description: "明代私家园林，江南古典园林代表",
      category: "园林",
      ticketPrice: 40,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "东方明珠塔",
      nameZh: "东方明珠塔",
      nameEn: "Oriental Pearl Tower",
      address: "上海市浦东新区世纪大道1号",
      location: { latitude: 31.2397, longitude: 121.4998 },
      visitDuration: 90,
      description: "上海标志性建筑，可俯瞰全城",
      category: "地标",
      ticketPrice: 199,
      reservationRequired: false,
      reservationTips: "",
    },
  ],
  西安: [
    {
      name: "秦始皇兵马俑博物馆",
      nameZh: "秦始皇兵马俑博物馆",
      nameEn: "Museum of Terracotta Warriors",
      address: "西安市临潼区秦陵北路",
      location: { latitude: 34.3843, longitude: 109.2785 },
      visitDuration: 240,
      description: "世界第八大奇迹，秦始皇陵的陪葬坑",
      category: "博物馆",
      ticketPrice: 120,
      reservationRequired: true,
      reservationTips: "需提前在官方微信公众号预约",
    },
    {
      name: "西安城墙",
      nameZh: "西安城墙",
      nameEn: "Xi'an City Wall",
      address: "西安市碑林区南大街",
      location: { latitude: 34.2632, longitude: 108.9416 },
      visitDuration: 120,
      description: "中国现存最完整的古代城墙，可骑行或步行环城",
      category: "历史遗迹",
      ticketPrice: 54,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "钟楼",
      nameZh: "钟楼",
      nameEn: "Bell Tower",
      address: "西安市碑林区东西南北四条大街交汇处",
      location: { latitude: 34.2614, longitude: 108.9425 },
      visitDuration: 60,
      description: "西安标志性建筑，始建于明洪武年间",
      category: "历史遗迹",
      ticketPrice: 30,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "大雁塔",
      nameZh: "大雁塔",
      nameEn: "Giant Wild Goose Pagoda",
      address: "西安市雁塔区雁塔南路",
      location: { latitude: 34.2187, longitude: 108.9637 },
      visitDuration: 120,
      description: "唐代佛塔，玄奘法师为保存佛经而建",
      category: "历史遗迹",
      ticketPrice: 40,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "大唐不夜城",
      nameZh: "大唐不夜城",
      nameEn: "Great Tang All Day Mall",
      address: "西安市雁塔区慈恩路",
      location: { latitude: 34.2177, longitude: 108.9645 },
      visitDuration: 150,
      description: "以盛唐文化为背景的步行街，夜间灯光秀精彩",
      category: "商业街",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    },
  ],
  成都: [
    {
      name: "大熊猫繁育研究基地",
      nameZh: "大熊猫繁育研究基地",
      nameEn: "Chengdu Research Base of Giant Panda Breeding",
      address: "成都市成华区熊猫大道1375号",
      location: { latitude: 30.7325, longitude: 104.1437 },
      visitDuration: 180,
      description: "近距离观赏大熊猫的最佳去处",
      category: "自然风光",
      ticketPrice: 55,
      reservationRequired: true,
      reservationTips: "需提前在官方微信预约",
    },
    {
      name: "宽窄巷子",
      nameZh: "宽窄巷子",
      nameEn: "Kuanzhai Alley",
      address: "成都市青羊区长顺上街",
      location: { latitude: 30.6698, longitude: 104.0528 },
      visitDuration: 120,
      description: "清朝古街，成都文化名片",
      category: "历史街区",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "武侯祠",
      nameZh: "武侯祠",
      nameEn: "Wuhou Shrine",
      address: "成都市武侯区武侯祠大街231号",
      location: { latitude: 30.6447, longitude: 104.0467 },
      visitDuration: 120,
      description: "纪念诸葛亮的祠堂，三国文化圣地",
      category: "历史遗迹",
      ticketPrice: 50,
      reservationRequired: false,
      reservationTips: "",
    },
  ],
  杭州: [
    {
      name: "西湖",
      nameZh: "西湖",
      nameEn: "West Lake",
      address: "杭州市西湖区",
      location: { latitude: 30.2592, longitude: 120.1489 },
      visitDuration: 240,
      description: "世界文化遗产，杭州的灵魂所在",
      category: "自然风光",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    },
    {
      name: "灵隐寺",
      nameZh: "灵隐寺",
      nameEn: "Lingyin Temple",
      address: "杭州市西湖区灵隐路法云弄1号",
      location: { latitude: 30.2488, longitude: 120.1014 },
      visitDuration: 150,
      description: "江南著名古刹，始建于东晋",
      category: "宗教场所",
      ticketPrice: 75,
      reservationRequired: false,
      reservationTips: "",
    },
  ],
};

/** 生成通用 mock 景点（用于未收录的城市） */
/** 城市中心坐标（用于未收录城市的 genericMock fallback） */
const CITY_COORDS: Record<string, { latitude: number; longitude: number }> = {
  北京: { latitude: 39.9042, longitude: 116.4074 },
  上海: { latitude: 31.2304, longitude: 121.4737 },
  广州: { latitude: 23.1291, longitude: 113.2644 },
  深圳: { latitude: 22.5431, longitude: 114.0579 },
  成都: { latitude: 30.5728, longitude: 104.0668 },
  重庆: { latitude: 29.4316, longitude: 106.9123 },
  杭州: { latitude: 30.2741, longitude: 120.1551 },
  武汉: { latitude: 30.5928, longitude: 114.3055 },
  西安: { latitude: 34.3416, longitude: 108.9398 },
  南京: { latitude: 32.0603, longitude: 118.7969 },
  长沙: { latitude: 28.2282, longitude: 112.9388 },
  苏州: { latitude: 31.2990, longitude: 120.5853 },
  天津: { latitude: 39.3434, longitude: 117.3616 },
  郑州: { latitude: 34.7466, longitude: 113.6254 },
  青岛: { latitude: 36.0671, longitude: 120.3826 },
  大连: { latitude: 38.9140, longitude: 121.6147 },
  厦门: { latitude: 24.4798, longitude: 118.0894 },
  昆明: { latitude: 25.0389, longitude: 102.7183 },
  哈尔滨: { latitude: 45.8038, longitude: 126.5350 },
  沈阳: { latitude: 41.8057, longitude: 123.4315 },
  济南: { latitude: 36.6512, longitude: 117.1201 },
  福州: { latitude: 26.0745, longitude: 119.2965 },
  合肥: { latitude: 31.8206, longitude: 117.2272 },
  石家庄: { latitude: 38.0428, longitude: 114.5149 },
  太原: { latitude: 37.8706, longitude: 112.5489 },
  南昌: { latitude: 28.6820, longitude: 115.8579 },
  贵阳: { latitude: 26.6470, longitude: 106.6302 },
  南宁: { latitude: 22.8170, longitude: 108.3665 },
  兰州: { latitude: 36.0611, longitude: 103.8343 },
  乌鲁木齐: { latitude: 43.8256, longitude: 87.6168 },
  拉萨: { latitude: 29.6500, longitude: 91.1000 },
  呼和浩特: { latitude: 40.8424, longitude: 111.7490 },
  银川: { latitude: 38.4872, longitude: 106.2309 },
  西宁: { latitude: 36.6171, longitude: 101.7782 },
  海口: { latitude: 20.0174, longitude: 110.3492 },
  三亚: { latitude: 18.2528, longitude: 109.5120 },
  珠海: { latitude: 22.2710, longitude: 113.5767 },
  东莞: { latitude: 23.0430, longitude: 113.7633 },
  佛山: { latitude: 23.0218, longitude: 113.1219 },
  无锡: { latitude: 31.4912, longitude: 120.3119 },
  常州: { latitude: 31.8113, longitude: 119.9743 },
  宁波: { latitude: 29.8683, longitude: 121.5440 },
  温州: { latitude: 28.0000, longitude: 120.6722 },
};

function genericMock(city: string): Attraction[] {
  const coords = CITY_COORDS[city] || { latitude: 31.23, longitude: 121.47 }; // 默认上海
  return [
    {
      name: `${city}中心公园`,
      nameZh: `${city}中心公园`,
      nameEn: `${city} Central Park`,
      address: `${city}市中心`,
      location: coords,
      visitDuration: 120,
      description: `${city}的主要城市公园，适合休闲游览`,
      category: "公园",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    },
  ];
}

/** 获取 mock 景点数据 */
export function getMockAttractions(params: MockAttractionParams): Attraction[] {
  return MOCK_DATA[params.city] ?? genericMock(params.city);
}

/** 获取 mock UGC 评价数据 */
export function getMockUGC(
  city: string,
  attractionName: string,
): Array<{ source: string; summary: string; rating: number; tips: string }> {
  const ugc: Record<
    string,
    Record<string, Array<{ source: string; summary: string; rating: number; tips: string }>>
  > = {
    北京: {
      故宫博物院: [
        {
          source: "xiaohongshu",
          summary: "拍照超级出片！红墙黄瓦绝美",
          rating: 4.9,
          tips: "建议工作日去，周末人超多。提前7天抢票！",
        },
      ],
      颐和园: [
        {
          source: "xiaohongshu",
          summary: "昆明湖畔散步太惬意了",
          rating: 4.7,
          tips: "坐船游湖是最佳体验，30元/人",
        },
      ],
      八达岭长城: [
        {
          source: "xiaohongshu",
          summary: "不到长城非好汉！但真的很累",
          rating: 4.5,
          tips: "穿舒适的运动鞋，带足水",
        },
      ],
    },
    上海: {
      外滩: [
        {
          source: "xiaohongshu",
          summary: "夜景绝美！一定要晚上去",
          rating: 4.8,
          tips: "7-9点灯光最漂亮，周末人山人海",
        },
      ],
      豫园: [
        {
          source: "xiaohongshu",
          summary: "小笼包发源地！南翔馒头店必吃",
          rating: 4.6,
          tips: "园内逛1小时足够，重点在周边小吃",
        },
      ],
    },
    西安: {
      秦始皇兵马俑博物馆: [
        {
          source: "xiaohongshu",
          summary: "震撼！亲眼看到才知道有多壮观",
          rating: 4.9,
          tips: "一定要请讲解，不然看不懂。建议早上去人少",
        },
      ],
      西安城墙: [
        {
          source: "xiaohongshu",
          summary: "骑自行车绕城墙一圈太爽了",
          rating: 4.7,
          tips: "租双人车90元/2小时，傍晚去可以看日落",
        },
      ],
      大唐不夜城: [
        {
          source: "xiaohongshu",
          summary: "不倒翁小姐姐真的好美！",
          rating: 4.6,
          tips: "晚上去才有氛围，周末人超级多",
        },
      ],
    },
  };

  return (
    ugc[city]?.[attractionName] ?? [
      {
        source: "local_knowledge",
        summary: `${attractionName}是${city}值得游览的地方`,
        rating: 4.0,
        tips: "建议提前查询开放时间和门票信息",
      },
    ]
  );
}
