/**
 * 景点官方路线静态数据
 *
 * 覆盖知名景区的经典游玩路线，作为 L1 数据源。
 * 新增景区只需在此文件添加。
 */

import type { AttractionRoute } from "../types/route.js";

// ─── 类型 ─────────────────────────────────────────────────

interface OfficialRouteData {
  /** 匹配的景点名（支持多个别名） */
  names: string[];
  /** 城市 */
  city: string;
  /** 路线列表 */
  routes: AttractionRoute[];
}

// ─── 西湖 ─────────────────────────────────────────────────

const WEST_LAKE_ROUTES: OfficialRouteData = {
  names: ["西湖", "西湖风景名胜区", "杭州西湖"],
  city: "杭州",
  routes: [
    {
      id: "westlake_classic",
      name: "西湖经典环湖线",
      description: "逆时针环湖经典路线，串联西湖十景精华，步行+游船结合，轻松不走回头路",
      duration: 360,
      waypoints: [
        {
          name: "断桥残雪",
          location: { latitude: 30.2598, longitude: 120.1557 },
          visitDuration: 20,
          isOptional: false,
          description: "西湖十景之首，白娘子与许仙相遇之地",
          supplyPoints: [
            {
              name: "北山街便利店",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
            {
              name: "断桥奶茶店",
              type: "cafe",
              description: "奶茶、咖啡",
              estimatedCost: 25,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "白堤",
          location: { latitude: 30.2587, longitude: 120.1524 },
          visitDuration: 30,
          isOptional: false,
          description: "白居易修筑的长堤，桃柳夹岸",
          supplyPoints: [],
        },
        {
          name: "孤山",
          location: { latitude: 30.2566, longitude: 120.1488 },
          visitDuration: 40,
          isOptional: false,
          description: "西泠印社、浙江博物馆、放鹤亭",
          supplyPoints: [
            {
              name: "西泠印社茶室",
              type: "cafe",
              description: "龙井茶、点心，可休息",
              estimatedCost: 40,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: true,
            },
            {
              name: "楼外楼",
              type: "restaurant",
              description: "百年老店，杭帮菜，人均较高",
              estimatedCost: 120,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "曲院风荷",
          location: { latitude: 30.2536, longitude: 120.1412 },
          visitDuration: 30,
          isOptional: true,
          description: "夏日赏荷胜地",
          supplyPoints: [
            {
              name: "岳湖楼附近星巴克",
              type: "cafe",
              description: "咖啡、简餐",
              estimatedCost: 35,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "苏堤春晓",
          location: { latitude: 30.2428, longitude: 120.1385 },
          visitDuration: 40,
          isOptional: false,
          description: "苏东坡修筑，六桥烟柳",
          supplyPoints: [
            {
              name: "苏堤南端小卖部",
              type: "shop",
              description: "饮料、冰棍",
              estimatedCost: 10,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "花港观鱼",
          location: { latitude: 30.2346, longitude: 120.1397 },
          visitDuration: 30,
          isOptional: false,
          description: "红鱼池赏锦鲤",
          supplyPoints: [
            {
              name: "花港公园小卖部",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 12,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
            {
              name: "花港休息亭",
              type: "rest_area",
              description: "有座椅，可休息",
              estimatedCost: 0,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: true,
            },
          ],
        },
        {
          name: "雷峰塔",
          location: { latitude: 30.2312, longitude: 120.1487 },
          visitDuration: 40,
          isOptional: false,
          description: "西湖标志性建筑，登塔俯瞰全湖",
          supplyPoints: [
            {
              name: "雷峰塔下餐饮区",
              type: "restaurant",
              description: "快餐、小吃",
              estimatedCost: 50,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
            {
              name: "雷峰塔便利店",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "柳浪闻莺",
          location: { latitude: 30.2401, longitude: 120.1573 },
          visitDuration: 20,
          isOptional: true,
          description: "柳叶飘飘，鸟鸣啾啾",
          supplyPoints: [
            {
              name: "钱王祠周边餐饮",
              type: "restaurant",
              description: "各类餐厅",
              estimatedCost: 60,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
      ],
      tags: ["经典", "环湖", "步行"],
      source: "official",
      sourceMeta: { url: "https://westlake.hangzhou.gov.cn" },
      difficulty: 2,
      supplyStrategy: {
        waterStations: 4,
        restAreas: 2,
        recommendedBreaks: [
          {
            afterWaypointIndex: 1,
            duration: 15,
            location: "孤山",
            availableSupply: "西泠印社茶室（龙井茶 ¥40）",
          },
          {
            afterWaypointIndex: 4,
            duration: 10,
            location: "花港观鱼",
            availableSupply: "公园小卖部+休息亭",
          },
        ],
        warnings: ["白堤段约30分钟步行无补给，建议提前准备饮用水"],
      },
    },
    {
      id: "westlake_north",
      name: "西湖北线精华",
      description: "轻松半日游，覆盖北线核心景点，适合初次游览或时间有限的游客",
      duration: 180,
      waypoints: [
        {
          name: "断桥残雪",
          location: { latitude: 30.2598, longitude: 120.1557 },
          visitDuration: 20,
          isOptional: false,
          description: "西湖十景之首",
          supplyPoints: [
            {
              name: "北山街便利店",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "平湖秋月",
          location: { latitude: 30.2578, longitude: 120.1512 },
          visitDuration: 20,
          isOptional: false,
          description: "赏月胜地",
          supplyPoints: [
            {
              name: "平湖秋月小卖部",
              type: "shop",
              description: "饮料、冰棍",
              estimatedCost: 12,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "孤山",
          location: { latitude: 30.2566, longitude: 120.1488 },
          visitDuration: 50,
          isOptional: false,
          description: "西泠印社、浙江博物馆",
          supplyPoints: [
            {
              name: "西泠印社茶室",
              type: "cafe",
              description: "龙井茶、点心，可休息",
              estimatedCost: 40,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: true,
            },
          ],
        },
        {
          name: "西泠桥",
          location: { latitude: 30.2553, longitude: 120.1453 },
          visitDuration: 15,
          isOptional: true,
          description: "苏小小墓",
          supplyPoints: [],
        },
        {
          name: "曲院风荷",
          location: { latitude: 30.2536, longitude: 120.1412 },
          visitDuration: 30,
          isOptional: false,
          description: "夏日赏荷胜地",
          supplyPoints: [
            {
              name: "岳湖楼附近星巴克",
              type: "cafe",
              description: "咖啡、简餐",
              estimatedCost: 35,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "岳王庙",
          location: { latitude: 30.2529, longitude: 120.1376 },
          visitDuration: 30,
          isOptional: true,
          description: "岳飞墓与岳王庙",
          supplyPoints: [
            {
              name: "岳王庙门口小卖部",
              type: "shop",
              description: "饮料、纪念品",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
      ],
      tags: ["经典", "轻松", "步行"],
      source: "official",
      sourceMeta: { url: "https://westlake.hangzhou.gov.cn" },
      difficulty: 1,
      supplyStrategy: {
        waterStations: 3,
        restAreas: 1,
        recommendedBreaks: [
          {
            afterWaypointIndex: 2,
            duration: 15,
            location: "孤山",
            availableSupply: "西泠印社茶室",
          },
        ],
        warnings: [],
      },
    },
    {
      id: "westlake_west",
      name: "西湖西线深度游",
      description: "小众路线，远离主流人群，体验西湖最宁静的山水和茶园风光",
      duration: 240,
      waypoints: [
        {
          name: "岳王庙",
          location: { latitude: 30.2529, longitude: 120.1376 },
          visitDuration: 30,
          isOptional: false,
          description: "岳飞纪念地",
          supplyPoints: [
            {
              name: "岳王庙门口便利店",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "郭庄",
          location: { latitude: 30.2478, longitude: 120.1345 },
          visitDuration: 30,
          isOptional: false,
          description: "西湖边小众园林之首，可品茶",
          supplyPoints: [
            {
              name: "郭庄茶室",
              type: "cafe",
              description: "园内品茶，环境清幽",
              estimatedCost: 50,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: true,
            },
          ],
        },
        {
          name: "茅家埠",
          location: { latitude: 30.2412, longitude: 120.1268 },
          visitDuration: 40,
          isOptional: false,
          description: "原生态水域，远离人群",
          supplyPoints: [],
        },
        {
          name: "龙井村",
          location: { latitude: 30.2231, longitude: 120.1212 },
          visitDuration: 50,
          isOptional: false,
          description: "龙井茶产地，品茶体验",
          supplyPoints: [
            {
              name: "龙井茶室",
              type: "cafe",
              description: "正宗龙井茶、茶点",
              estimatedCost: 60,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: true,
            },
            {
              name: "龙井农家菜",
              type: "restaurant",
              description: "本地农家菜",
              estimatedCost: 80,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "九溪烟树",
          location: { latitude: 30.2089, longitude: 120.1185 },
          visitDuration: 40,
          isOptional: true,
          description: "溪水潺潺，天然氧吧",
          supplyPoints: [
            {
              name: "九溪入口小卖部",
              type: "shop",
              description: "饮料、冰棍",
              estimatedCost: 10,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
      ],
      tags: ["小众", "深度", "轻松"],
      source: "official",
      sourceMeta: { url: "https://westlake.hangzhou.gov.cn" },
      difficulty: 2,
      supplyStrategy: {
        waterStations: 1,
        restAreas: 2,
        recommendedBreaks: [
          {
            afterWaypointIndex: 1,
            duration: 20,
            location: "郭庄",
            availableSupply: "郭庄茶室（品茶 ¥50）",
          },
          {
            afterWaypointIndex: 3,
            duration: 30,
            location: "龙井村",
            availableSupply: "龙井茶室+农家菜",
          },
        ],
        warnings: ["茅家埠段原生态，无商业补给，务必自带饮水"],
      },
    },
    {
      id: "westlake_south",
      name: "西湖南线休闲游",
      description: "适合亲子和休闲游客，景点集中、交通便利，可搭配游船",
      duration: 200,
      waypoints: [
        {
          name: "柳浪闻莺",
          location: { latitude: 30.2401, longitude: 120.1573 },
          visitDuration: 25,
          isOptional: false,
          description: "西湖边最知名的公园",
          supplyPoints: [
            {
              name: "钱王祠周边餐饮",
              type: "restaurant",
              description: "各类餐厅",
              estimatedCost: 60,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "雷峰塔",
          location: { latitude: 30.2312, longitude: 120.1487 },
          visitDuration: 40,
          isOptional: false,
          description: "登塔览湖全景",
          supplyPoints: [
            {
              name: "雷峰塔下餐饮区",
              type: "restaurant",
              description: "快餐、小吃",
              estimatedCost: 50,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
            {
              name: "雷峰塔便利店",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "太子湾公园",
          location: { latitude: 30.2276, longitude: 120.1435 },
          visitDuration: 40,
          isOptional: false,
          description: "郁金香和樱花胜地",
          supplyPoints: [
            {
              name: "太子湾入口小卖部",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 12,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
            {
              name: "太子湾草坪休息区",
              type: "rest_area",
              description: "大片草坪可野餐休息",
              estimatedCost: 0,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: true,
            },
          ],
        },
        {
          name: "花港观鱼",
          location: { latitude: 30.2346, longitude: 120.1397 },
          visitDuration: 25,
          isOptional: false,
          description: "红鱼池",
          supplyPoints: [
            {
              name: "花港公园小卖部",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 12,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "三潭印月",
          location: { latitude: 30.2375, longitude: 120.1453 },
          visitDuration: 50,
          isOptional: true,
          description: "需乘船前往，1元纸币背面风景",
          supplyPoints: [
            {
              name: "三潭印月岛小卖部",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
      ],
      tags: ["亲子", "休闲", "轻松", "游船"],
      source: "official",
      sourceMeta: { url: "https://westlake.hangzhou.gov.cn" },
      difficulty: 1,
      supplyStrategy: {
        waterStations: 4,
        restAreas: 2,
        recommendedBreaks: [
          {
            afterWaypointIndex: 1,
            duration: 15,
            location: "雷峰塔下",
            availableSupply: "餐饮区+便利店",
          },
          {
            afterWaypointIndex: 2,
            duration: 20,
            location: "太子湾草坪",
            availableSupply: "可野餐休息（免费）",
          },
        ],
        warnings: [],
      },
    },
  ],
};

// ─── 故宫 ─────────────────────────────────────────────────

const FORBIDDEN_CITY_ROUTES: OfficialRouteData = {
  names: ["故宫", "故宫博物院"],
  city: "北京",
  routes: [
    {
      id: "palace_classic",
      name: "故宫中轴线经典游",
      description: "沿中轴线从午门到神武门，覆盖三大殿和后三宫，最经典的游览路线",
      duration: 180,
      waypoints: [
        {
          name: "午门",
          location: { latitude: 39.9137, longitude: 116.3972 },
          visitDuration: 15,
          isOptional: false,
          description: "紫禁城正门",
          supplyPoints: [
            {
              name: "午门观众服务中心",
              type: "shop",
              description: "饮料、零食、文创",
              estimatedCost: 20,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "太和殿",
          location: { latitude: 39.9163, longitude: 116.3972 },
          visitDuration: 20,
          isOptional: false,
          description: "金銮殿，中国最大的木构宫殿",
          supplyPoints: [],
        },
        {
          name: "中和殿",
          location: { latitude: 39.9169, longitude: 116.3972 },
          visitDuration: 10,
          isOptional: false,
          description: "三大殿之一",
          supplyPoints: [],
        },
        {
          name: "保和殿",
          location: { latitude: 39.9175, longitude: 116.3972 },
          visitDuration: 10,
          isOptional: false,
          description: "殿试考场",
          supplyPoints: [],
        },
        {
          name: "乾清宫",
          location: { latitude: 39.9184, longitude: 116.3972 },
          visitDuration: 15,
          isOptional: false,
          description: "皇帝寝宫",
          supplyPoints: [],
        },
        {
          name: "御花园",
          location: { latitude: 39.9207, longitude: 116.3972 },
          visitDuration: 20,
          isOptional: false,
          description: "皇家园林",
          supplyPoints: [
            {
              name: "御花园商店",
              type: "shop",
              description: "饮料、雪糕、文创",
              estimatedCost: 25,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
            {
              name: "御花园休息长椅",
              type: "rest_area",
              description: "少量长椅可休息",
              estimatedCost: 0,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: true,
            },
          ],
        },
        {
          name: "神武门",
          location: { latitude: 39.9225, longitude: 116.3972 },
          visitDuration: 5,
          isOptional: false,
          description: "北门出口",
          supplyPoints: [
            {
              name: "神武门外餐饮街",
              type: "restaurant",
              description: "快餐、北京小吃",
              estimatedCost: 50,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
      ],
      tags: ["经典", "步行"],
      source: "official",
      sourceMeta: { url: "https://www.dpm.org.cn" },
      difficulty: 1,
      supplyStrategy: {
        waterStations: 0,
        restAreas: 1,
        recommendedBreaks: [
          { afterWaypointIndex: 5, duration: 15, location: "御花园", availableSupply: "商店+长椅" },
        ],
        warnings: [
          "故宫中轴线全程约90分钟无餐饮补给，仅有御花园一处商店，强烈建议自带饮水和简单食物",
        ],
      },
    },
    {
      id: "palace_east",
      name: "故宫东六宫深度游",
      description: "中轴线 + 东六宫 + 珍宝馆，适合想深入了解宫廷文化的游客",
      duration: 240,
      waypoints: [
        {
          name: "午门",
          location: { latitude: 39.9137, longitude: 116.3972 },
          visitDuration: 15,
          isOptional: false,
          supplyPoints: [
            {
              name: "午门观众服务中心",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 20,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "太和殿",
          location: { latitude: 39.9163, longitude: 116.3972 },
          visitDuration: 20,
          isOptional: false,
          description: "金銮殿",
          supplyPoints: [],
        },
        {
          name: "钟表馆",
          location: { latitude: 39.9172, longitude: 116.3992 },
          visitDuration: 30,
          isOptional: false,
          description: "皇家钟表收藏",
          supplyPoints: [
            {
              name: "奉先殿区域小店",
              type: "shop",
              description: "饮料、雪糕",
              estimatedCost: 20,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "珍宝馆",
          location: { latitude: 39.9192, longitude: 116.3992 },
          visitDuration: 40,
          isOptional: false,
          description: "皇家珍宝展（另收10元）",
          supplyPoints: [
            {
              name: "珍宝馆附近商店",
              type: "shop",
              description: "饮料、零食、文创",
              estimatedCost: 25,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "东六宫",
          location: { latitude: 39.9189, longitude: 116.3985 },
          visitDuration: 30,
          isOptional: false,
          description: "后宫嫔妃居所",
          supplyPoints: [],
        },
        {
          name: "御花园",
          location: { latitude: 39.9207, longitude: 116.3972 },
          visitDuration: 20,
          isOptional: false,
          supplyPoints: [
            {
              name: "御花园商店",
              type: "shop",
              description: "饮料、雪糕",
              estimatedCost: 25,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
            {
              name: "御花园休息长椅",
              type: "rest_area",
              description: "少量长椅",
              estimatedCost: 0,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: true,
            },
          ],
        },
        {
          name: "神武门",
          location: { latitude: 39.9225, longitude: 116.3972 },
          visitDuration: 5,
          isOptional: false,
          supplyPoints: [
            {
              name: "神武门外餐饮街",
              type: "restaurant",
              description: "快餐、北京小吃",
              estimatedCost: 50,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
      ],
      tags: ["深度", "文化", "步行"],
      source: "official",
      sourceMeta: { url: "https://www.dpm.org.cn" },
      difficulty: 2,
      supplyStrategy: {
        waterStations: 0,
        restAreas: 1,
        recommendedBreaks: [
          { afterWaypointIndex: 3, duration: 15, location: "珍宝馆附近", availableSupply: "商店" },
          { afterWaypointIndex: 5, duration: 15, location: "御花园", availableSupply: "商店+长椅" },
        ],
        warnings: ["故宫内部商业点稀少，钟表馆和珍宝馆附近有少量商店，建议自带补给"],
      },
    },
  ],
};

// ─── 颐和园 ──────────────────────────────────────────────

const SUMMER_PALACE_ROUTES: OfficialRouteData = {
  names: ["颐和园"],
  city: "北京",
  routes: [
    {
      id: "summer_palace_classic",
      name: "颐和园经典半日游",
      description: "东宫门入，沿长廊到石舫，登万寿山，从北宫门出",
      duration: 200,
      waypoints: [
        {
          name: "东宫门",
          location: { latitude: 39.9993, longitude: 116.2757 },
          visitDuration: 5,
          isOptional: false,
          description: "正门入口",
          supplyPoints: [
            {
              name: "东宫门商店",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "仁寿殿",
          location: { latitude: 39.9992, longitude: 116.2744 },
          visitDuration: 15,
          isOptional: false,
          description: "慈禧太后处理政务处",
          supplyPoints: [],
        },
        {
          name: "长廊",
          location: { latitude: 39.9978, longitude: 116.2716 },
          visitDuration: 25,
          isOptional: false,
          description: "728米彩绘长廊",
          supplyPoints: [
            {
              name: "长廊中段小卖部",
              type: "shop",
              description: "饮料、冰棍",
              estimatedCost: 12,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "排云殿",
          location: { latitude: 39.9971, longitude: 116.2724 },
          visitDuration: 20,
          isOptional: false,
          description: "万寿山前建筑群核心",
          supplyPoints: [
            {
              name: "排云殿附近小店",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 15,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "佛香阁",
          location: { latitude: 39.996, longitude: 116.2724 },
          visitDuration: 20,
          isOptional: false,
          description: "颐和园标志，登高望远",
          supplyPoints: [],
        },
        {
          name: "石舫",
          location: { latitude: 39.998, longitude: 116.2672 },
          visitDuration: 15,
          isOptional: false,
          description: "清晏舫，大型石雕",
          supplyPoints: [
            {
              name: "石舫附近餐厅",
              type: "restaurant",
              description: "简餐、面条",
              estimatedCost: 45,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
        {
          name: "十七孔桥",
          location: { latitude: 39.9932, longitude: 116.2678 },
          visitDuration: 15,
          isOptional: true,
          description: "需要绕行至南湖岛",
          supplyPoints: [
            {
              name: "南湖岛小卖部",
              type: "shop",
              description: "饮料、零食",
              estimatedCost: 12,
              locationAccuracy: "unknown",
              priceConfidence: "estimate",
              lastUpdated: "2025-05-18",
              isRecommended: false,
            },
          ],
        },
      ],
      tags: ["经典", "步行"],
      source: "official",
      sourceMeta: { url: "https://www.summerpalace-china.com" },
      difficulty: 2,
      supplyStrategy: {
        waterStations: 2,
        restAreas: 1,
        recommendedBreaks: [
          { afterWaypointIndex: 2, duration: 10, location: "长廊中段", availableSupply: "小卖部" },
          {
            afterWaypointIndex: 4,
            duration: 15,
            location: "石舫附近",
            availableSupply: "餐厅（简餐 ¥45）",
          },
        ],
        warnings: ["佛香阁需登万寿山，山顶无补给，建议在山下补足饮水"],
      },
    },
  ],
};

// ─── 注册表 ──────────────────────────────────────────────

const ALL_OFFICIAL_ROUTES: OfficialRouteData[] = [
  WEST_LAKE_ROUTES,
  FORBIDDEN_CITY_ROUTES,
  SUMMER_PALACE_ROUTES,
];

// ─── 查询 API ────────────────────────────────────────────

/** 根据景点名获取官方路线 */
export function getOfficialRoutes(attractionName: string, city: string): AttractionRoute[] {
  for (const data of ALL_OFFICIAL_ROUTES) {
    const matchesName = data.names.some(
      (n) => n === attractionName || attractionName.includes(n) || n.includes(attractionName),
    );
    const matchesCity = !data.city || data.city === city;
    if (matchesName && matchesCity) {
      return data.routes;
    }
  }
  return [];
}

/** 获取所有已收录的景区名称列表 */
export function getAvailableAttractionNames(): string[] {
  return ALL_OFFICIAL_ROUTES.flatMap((d) => d.names);
}

/** Mock 路线数据（用于未收录景区的降级） */
export function getMockRoutes(attractionName: string, _city: string): AttractionRoute[] {
  // 仅对疑似大型景区生成 mock 路线
  if (
    !attractionName.includes("景区") &&
    !attractionName.includes("公园") &&
    !attractionName.includes("风景区") &&
    attractionName.length < 3
  ) {
    return [];
  }

  return [
    {
      id: `mock_${attractionName}_classic`,
      name: `${attractionName}经典路线`,
      description: `${attractionName}的经典游览路线，覆盖主要景点`,
      duration: 180,
      waypoints: [
        {
          name: `${attractionName}主入口`,
          location: { latitude: 0, longitude: 0 },
          visitDuration: 10,
          isOptional: false,
        },
        {
          name: `${attractionName}核心景区`,
          location: { latitude: 0, longitude: 0 },
          visitDuration: 60,
          isOptional: false,
        },
        {
          name: `${attractionName}观景台`,
          location: { latitude: 0, longitude: 0 },
          visitDuration: 30,
          isOptional: false,
        },
        {
          name: `${attractionName}出口`,
          location: { latitude: 0, longitude: 0 },
          visitDuration: 5,
          isOptional: false,
        },
      ],
      tags: ["经典"],
      source: "llm_knowledge",
      difficulty: 2,
      supplyStrategy: {
        waterStations: 1,
        restAreas: 1,
        recommendedBreaks: [
          {
            afterWaypointIndex: 1,
            duration: 15,
            location: "核心景区",
            availableSupply: "可能有便利店或自动售货机",
          },
        ],
        warnings: ["Mock 路线补给信息有限，建议进入景区前确认补给点位置，自备饮水"],
      },
    },
  ];
}
