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
