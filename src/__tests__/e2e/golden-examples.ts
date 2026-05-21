/**
 * 黄金数据集 — AI E2E 评估基准
 *
 * 每个场景定义：
 *   - input: 用户输入
 *   - expectedTools: 期望 Agent 至少调用这些工具（子集匹配）
 *   - expectedStructure: 输出文本必须匹配的正则
 *   - validationFn: 自定义验证函数
 *
 * 创建流程：
 *   1. ✅ 手写 input + expectedTools + expectedStructure
 *   2. ⏸️ 跑一次真实 Agent，捕获输出
 *   3. ⏸️ 人工审核输出是否合理
 *   4. ⏸️ 从审核过的输出提取更精确的 expectedStructure
 *   5. ⏸️ 锁定为 golden
 *
 * 运行方式：OPENAI_API_KEY=xxx npm run test:ai-e2e
 */

export interface GoldenExample {
  /** 场景 ID */
  id: string;
  /** 场景描述 */
  description: string;
  /** 用户输入 */
  input: string;
  /** TripRequest 参数 */
  request: {
    city: string;
    days: number;
    startDate?: string;
    endDate?: string;
    budget?: number;
    companions?: string;
    keywords?: string[];
  };
  /** 期望调用的工具（子集匹配） */
  expectedTools: string[];
  /** 输出必须匹配的正则 */
  expectedStructure: RegExp[];
  /** 自定义验证 */
  validationFn: (
    output: string,
    toolCalls: Array<{ name: string }>,
  ) => {
    passed: boolean;
    details: string;
  };
}

// ─── 工具名称常量 ──────────────────────────────────────────

const TOOLS = {
  SEARCH_ATTRACTIONS: "search_attractions",
  SEARCH_HOTELS: "search_hotels",
  SEARCH_RESTAURANTS: "search_restaurants",
  SEARCH_TRANSPORT: "search_transport",
  GEOCODE: "geocode",
  WEATHER: "get_weather",
  BUDGET: "calculate_budget",
  MULTI_CITY: "plan_multi_city",
} as const;

// ─── 黄金场景定义 ──────────────────────────────────────────

export const GOLDEN_EXAMPLES: GoldenExample[] = [
  // === 场景 1: 单城市短途游 ===
  {
    id: "beijing-3day",
    description: "北京三日游 — 经典单城市短途行程",
    input: "帮我规划北京三日游",
    request: {
      city: "北京",
      days: 3,
      startDate: "2025-07-01",
      endDate: "2025-07-03",
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_HOTELS, TOOLS.SEARCH_RESTAURANTS],
    expectedStructure: [
      /北京/, // 包含目的地
      /Day\s*1|第[一二三]天|2025-07-01/, // 包含日期
      /景点|游览|参观|故宫|长城|颐和园/, // 包含景点
    ],
    validationFn: (output, toolCalls) => {
      // 工具调用检查（仅 Agent 模式）
      if (toolCalls.length > 0) {
        const calledTools = new Set(toolCalls.map((t) => t.name));
        const missingTools = [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_HOTELS].filter(
          (t) => !calledTools.has(t),
        );
        if (missingTools.length > 0) {
          return { passed: false, details: `缺少工具调用: ${missingTools.join(", ")}` };
        }
      }

      // 输出长度应大于 200 字符（有实质内容）
      if (output.length < 200) {
        return { passed: false, details: `输出过短 (${output.length} chars)，可能不完整` };
      }

      return { passed: true, details: "验证通过" };
    },
  },

  // === 场景 2: 多城市跨省游 ===
  {
    id: "shanghai-hangzhou-suzhou-5day",
    description: "上海→杭州→苏州五日游 — 多城市跨省行程",
    input: "上海到杭州苏州五日游",
    request: {
      city: "上海",
      days: 5,
      startDate: "2025-08-01",
      endDate: "2025-08-05",
      keywords: ["杭州", "苏州"],
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_HOTELS, TOOLS.SEARCH_TRANSPORT],
    expectedStructure: [
      /上海|杭州|苏州/, // 包含多城市
      /交通|火车|高铁|动车|大巴/, // 包含交通信息
      /Day\s*\d|第[一二三四五]天/, // 包含多天行程
    ],
    validationFn: (output, _toolCalls) => {
      // 多城市检查不依赖工具调用，纯文本验证
      const cities = ["上海", "杭州", "苏州"];
      const mentionedCities = cities.filter((c) => output.includes(c));
      if (mentionedCities.length < 2) {
        return {
          passed: false,
          details: `多城市行程应至少提及 2 个城市，实际提及: ${mentionedCities.join(", ")}`,
        };
      }
      return { passed: true, details: `提及城市: ${mentionedCities.join(", ")}` };
    },
  },

  // === 场景 3: 预算约束 ===
  {
    id: "chengdu-2day-budget",
    description: "成都两日游预算1000元 — 预算约束规划",
    input: "成都两日游，预算1000元",
    request: {
      city: "成都",
      days: 2,
      startDate: "2025-09-01",
      endDate: "2025-09-02",
      budget: 1000,
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_HOTELS],
    expectedStructure: [
      /成都/, // 包含目的地
      /1000|预算|费用|价格|元|¥/, // 包含预算信息
    ],
    validationFn: (output) => {
      // 输出应体现预算意识
      const hasBudgetAwareness = /预算|费用|价格|元|¥|经济|实惠|性价比/.test(output);
      if (!hasBudgetAwareness) {
        return {
          passed: false,
          details: "输出未体现预算约束意识",
        };
      }

      return { passed: true, details: "预算约束已体现" };
    },
  },

  // === 场景 4: 亲子游 ===
  {
    id: "guangzhou-2day-family",
    description: "带5岁小孩广州两日游 — 亲子友好行程",
    input: "带5岁小孩去广州玩两天",
    request: {
      city: "广州",
      days: 2,
      startDate: "2025-10-01",
      endDate: "2025-10-02",
      companions: "5岁儿童",
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_RESTAURANTS],
    expectedStructure: [
      /广州/, // 包含目的地
      /儿童|小孩|亲子|适合|小朋友|孩子/, // 包含亲子元素
    ],
    validationFn: (output) => {
      const familyKeywords = /儿童|小孩|亲子|适合.*孩子|小朋友|家庭|游乐园|动物园|海洋馆|科学中心/;
      if (!familyKeywords.test(output)) {
        return {
          passed: false,
          details: "输出未包含亲子友好内容",
        };
      }

      return { passed: true, details: "包含亲子友好内容" };
    },
  },

  // === 场景 5: 美食主题 ===
  {
    id: "chongqing-3day-food",
    description: "重庆美食之旅三天 — 美食主题行程",
    input: "重庆美食之旅三天",
    request: {
      city: "重庆",
      days: 3,
      startDate: "2025-11-01",
      endDate: "2025-11-03",
      keywords: ["美食", "小吃", "火锅"],
    },
    expectedTools: [TOOLS.SEARCH_RESTAURANTS, TOOLS.SEARCH_ATTRACTIONS],
    expectedStructure: [
      /重庆/, // 包含目的地
      /美食|小吃|火锅|串串|酸辣粉|小面/, // 包含美食推荐
    ],
    validationFn: (output) => {
      const foodKeywords = /火锅|串串|小面|酸辣粉|毛血旺|辣子鸡|烤鱼|江湖菜|美食|小吃/;
      if (!foodKeywords.test(output)) {
        return {
          passed: false,
          details: "美食主题行程应包含具体美食推荐",
        };
      }

      return { passed: true, details: "包含美食推荐" };
    },
  },

  // === 场景 6: 长途行程（7天+） ===
  {
    id: "yunnan-7day",
    description: "云南七日游 — 长途多城市行程",
    input: "帮我规划云南七日游，想去昆明、大理、丽江",
    request: {
      city: "昆明",
      days: 7,
      startDate: "2025-08-01",
      endDate: "2025-08-07",
      keywords: ["昆明", "大理", "丽江"],
    },
    expectedTools: [
      TOOLS.SEARCH_ATTRACTIONS,
      TOOLS.SEARCH_HOTELS,
      TOOLS.SEARCH_TRANSPORT,
      TOOLS.MULTI_CITY,
    ],
    expectedStructure: [
      /昆明|大理|丽江/, // 包含多城市
      /Day\s*\d|第[一二三四五六七]天/, // 包含多天行程
      /交通|火车|高铁|大巴|飞机/, // 包含城际交通
    ],
    validationFn: (output, toolCalls) => {
      const cities = ["昆明", "大理", "丽江"];
      const mentionedCities = cities.filter((c) => output.includes(c));
      if (mentionedCities.length < 2) {
        return {
          passed: false,
          details: `多城市行程应至少提及 2 个城市，实际提及: ${mentionedCities.join(", ")}`,
        };
      }
      return { passed: true, details: "长途多城市行程完整" };
    },
  },

  // === 场景 7: 经济型预算 ===
  {
    id: "xian-3day-budget-low",
    description: "西安三日游 — 经济型预算",
    input: "预算1500元，帮我规划西安三日游",
    request: {
      city: "西安",
      days: 3,
      startDate: "2025-09-01",
      endDate: "2025-09-03",
      budget: 1500,
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_HOTELS, TOOLS.BUDGET],
    expectedStructure: [
      /西安/, // 包含目的地
      /1500|预算|费用|价格|元|¥/, // 包含预算信息
      /经济|实惠|性价比|青旅|快捷/, // 包含经济型建议
    ],
    validationFn: (output) => {
      const hasBudgetAwareness = /预算|费用|价格|元|¥|经济|实惠|性价比|省钱|节约/.test(output);
      if (!hasBudgetAwareness) {
        return {
          passed: false,
          details: "输出未体现预算约束意识",
        };
      }
      return { passed: true, details: "经济型预算已体现" };
    },
  },

  // === 场景 8: 豪华型预算 ===
  {
    id: "sanya-5day-luxury",
    description: "三亚五日游 — 豪华度假",
    input: "预算20000元，帮我规划三亚五日豪华度假",
    request: {
      city: "三亚",
      days: 5,
      startDate: "2025-12-01",
      endDate: "2025-12-05",
      budget: 20000,
      keywords: ["豪华", "度假", "五星级酒店"],
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_HOTELS, TOOLS.SEARCH_RESTAURANTS],
    expectedStructure: [
      /三亚/, // 包含目的地
      /豪华|高端|五星级|度假|海景/, // 包含豪华元素
    ],
    validationFn: (output) => {
      const luxuryKeywords = /豪华|高端|五星级|度假|海景|私人|专属|尊享|顶奢/;
      if (!luxuryKeywords.test(output)) {
        return {
          passed: false,
          details: "豪华行程应包含高端服务描述",
        };
      }
      return { passed: true, details: "豪华度假行程已体现" };
    },
  },

  // === 场景 9: 老人同行 ===
  {
    id: "beijing-3day-elderly",
    description: "带父母北京三日游 — 适老行程",
    input: "带父母（60岁）去北京玩三天，行程要轻松",
    request: {
      city: "北京",
      days: 3,
      startDate: "2025-10-01",
      endDate: "2025-10-03",
      companions: "60岁老人",
      keywords: ["轻松", "适合老人"],
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_RESTAURANTS],
    expectedStructure: [
      /北京/, // 包含目的地
      /老人|长辈|父母|轻松|舒适|休息/, // 包含适老元素
    ],
    validationFn: (output) => {
      const elderlyKeywords = /老人|长辈|父母|轻松|舒适|休息|缓|慢|无障碍|轮椅|电梯/;
      if (!elderlyKeywords.test(output)) {
        return {
          passed: false,
          details: "适老行程应包含轻松舒适的安排",
        };
      }
      return { passed: true, details: "适老行程已体现" };
    },
  },

  // === 场景 10: 模糊输入 ===
  {
    id: "vague-input",
    description: "模糊输入 — 应主动追问偏好",
    input: "我想出去玩",
    request: {
      city: "未知",
      days: 0,
    },
    expectedTools: [],
    expectedStructure: [
      /哪里|哪个城市|目的地|想去|几天|天/, // 应该追问
    ],
    validationFn: (output) => {
      // 模糊输入应该触发追问，而不是直接生成行程
      const hasQuestion = /哪里|哪个城市|目的地|想去|几天|天|什么时候|预算|同行/.test(output);
      if (!hasQuestion) {
        return {
          passed: false,
          details: "模糊输入应触发追问",
        };
      }
      return { passed: true, details: "正确触发追问" };
    },
  },

  // === 场景 11: 特殊城市 ===
  {
    id: "lhasa-3day",
    description: "拉萨三日游 — 高原特殊城市",
    input: "帮我规划拉萨三日游",
    request: {
      city: "拉萨",
      days: 3,
      startDate: "2025-07-01",
      endDate: "2025-07-03",
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_HOTELS],
    expectedStructure: [
      /拉萨/, // 包含目的地
      /高原|海拔|氧气|防晒|保暖|注意事项/, // 应包含高原注意事项
    ],
    validationFn: (output) => {
      const hasPlateauTips = /高原|海拔|氧气|防晒|保暖|注意|禁忌|反应/.test(output);
      if (!hasPlateauTips) {
        return {
          passed: false,
          details: "高原城市应包含注意事项",
        };
      }
      return { passed: true, details: "高原注意事项已体现" };
    },
  },

  // === 场景 12: 边界情况 — 不存在的城市 ===
  {
    id: "invalid-city",
    description: "不存在的城市 — 应优雅处理",
    input: "帮我规划 Atlantis 亚特兰蒂斯三日游",
    request: {
      city: "Atlantis",
      days: 3,
    },
    expectedTools: [],
    expectedStructure: [],
    validationFn: (output) => {
      // 不存在的城市应该有友好的提示，而不是崩溃
      const hasGracefulHandling = /找不到|无法|抱歉|建议|推荐|其他/.test(output);
      const hasError = /error|Error|错误|异常|失败/.test(output);
      if (hasError && !hasGracefulHandling) {
        return {
          passed: false,
          details: "应优雅处理不存在的城市，而不是报错",
        };
      }
      return { passed: true, details: "优雅处理不存在的城市" };
    },
  },

  // === 场景 13: 周末短途 ===
  {
    id: "hangzhou-2day-weekend",
    description: "杭州周末两日游 — 短途周末游",
    input: "这周末想去杭州玩两天",
    request: {
      city: "杭州",
      days: 2,
      keywords: ["周末", "短途"],
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_RESTAURANTS],
    expectedStructure: [
      /杭州/, // 包含目的地
      /Day\s*1|第[一二]天|周末/, // 包含时间安排
    ],
    validationFn: (output) => {
      if (output.length < 200) {
        return {
          passed: false,
          details: "输出过短，可能不完整",
        };
      }
      return { passed: true, details: "周末短途行程完整" };
    },
  },

  // === 场景 14: 文化主题 ===
  {
    id: "nanjing-3day-culture",
    description: "南京文化之旅 — 历史文化主题",
    input: "帮我规划南京文化之旅，想了解历史",
    request: {
      city: "南京",
      days: 3,
      keywords: ["文化", "历史", "博物馆"],
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_RESTAURANTS],
    expectedStructure: [
      /南京/, // 包含目的地
      /历史|文化|博物馆|古迹|遗址|纪念馆/, // 包含文化元素
    ],
    validationFn: (output) => {
      const cultureKeywords = /历史|文化|博物馆|古迹|遗址|纪念馆|民国|六朝|明朝|太平天国/;
      if (!cultureKeywords.test(output)) {
        return {
          passed: false,
          details: "文化主题行程应包含历史文化元素",
        };
      }
      return { passed: true, details: "文化主题已体现" };
    },
  },

  // === 场景 15: 孕妇同行 ===
  {
    id: "chengdu-2day-pregnant",
    description: "孕妇成都两日游 — 安全舒适行程",
    input: "孕妇（怀孕6个月）想去成都玩两天，行程要安全舒适",
    request: {
      city: "成都",
      days: 2,
      companions: "孕妇",
      keywords: ["安全", "舒适"],
    },
    expectedTools: [TOOLS.SEARCH_ATTRACTIONS, TOOLS.SEARCH_RESTAURANTS],
    expectedStructure: [
      /成都/, // 包含目的地
      /孕妇|安全|舒适|休息|避免|注意/, // 包含孕妇注意事项
    ],
    validationFn: (output) => {
      const pregnantKeywords = /孕妇|安全|舒适|休息|避免|注意|劳累|剧烈|危险|平缓/;
      if (!pregnantKeywords.test(output)) {
        return {
          passed: false,
          details: "孕妇行程应包含安全舒适建议",
        };
      }
      return { passed: true, details: "孕妇安全建议已体现" };
    },
  },
];

/**
 * 根据 ID 获取黄金场景
 */
export function getGoldenExample(id: string): GoldenExample | undefined {
  return GOLDEN_EXAMPLES.find((e) => e.id === id);
}

/**
 * 获取所有黄金场景 ID
 */
export function getGoldenExampleIds(): string[] {
  return GOLDEN_EXAMPLES.map((e) => e.id);
}
