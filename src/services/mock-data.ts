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
};

/** 生成通用 mock 景点（用于未收录的城市） */
function genericMock(city: string): Attraction[] {
  return [
    {
      name: `${city}中心公园`,
      nameZh: `${city}中心公园`,
      nameEn: `${city} Central Park`,
      address: `${city}市中心`,
      location: { latitude: 31.23, longitude: 121.47 },
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
