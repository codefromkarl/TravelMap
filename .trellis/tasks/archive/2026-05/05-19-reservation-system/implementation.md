# 预约系统实现方案（4 个子任务详细设计）

## SUB-1: reservation-db — 预约知识库

### 1.1 新建文件

**`src/data/reservation-db.ts`**

```ts
/** 景点预约知识库条目 */
export interface ReservationEntry {
  /** 官方预约/购票 URL */
  officialUrl: string;
  /** 预约平台描述（如"官方小程序"/"官网"/"公众号"） */
  platform: string;
  /** 需提前几天预约（0 表示当天可约，-1 表示不确定） */
  advanceDays: number;
  /** 每日放票时间（如 "20:00"），空表示全天可约 */
  releaseTime?: string;
  /** 旺季月份（1-12），空表示全年同策 */
  peakSeasonMonths?: number[];
  /** 旺季是否需更多提前量（覆盖 advanceDays） */
  peakAdvanceDays?: number;
  /** 预约提示 */
  tips: string;
  /** 备选购票渠道 */
  altChannels?: Array<{
    platform: string;
    url: string;
  }>;
}

// 内联 JSON 数据（避免额外 IO），按景点名索引
const DB: Record<string, ReservationEntry> = {
  // ─── 北京 ────────────────────────
  "故宫博物院": {
    officialUrl: "https://www.dpm.org.cn/visit/ticket.html",
    platform: "官方小程序「故宫博物院」",
    advanceDays: 7,
    releaseTime: "20:00",
    peakSeasonMonths: [4,5,6,7,8,9,10],
    peakAdvanceDays: 7,
    tips: "实名制，刷身份证入园。每日20:00放第7天票，旺季秒光建议准点抢",
    altChannels: [
      { platform: "美团", url: "https://www.meituan.com/" },
      { platform: "携程", url: "https://www.ctrip.com/" },
    ],
  },
  "国家博物馆": {
    officialUrl: "https://www.chnmuseum.cn/",
    platform: "官方公众号/小程序",
    advanceDays: 7,
    releaseTime: "17:00",
    tips: "免费但必须预约，分上午/下午场次",
  },
  "八达岭长城": {
    officialUrl: "https://www.badaling.cn/",
    platform: "官方公众号「八达岭长城」",
    advanceDays: 7,
    releaseTime: "20:00",
    tips: "旺季限流，建议提前购买缆车票",
  },
  // ... 50+ 条目（见下方完整清单）
};

/** 精确查询 */
export function lookup(nameZh: string): ReservationEntry | undefined {
  return DB[nameZh];
}

/** 模糊查询（别名匹配） */
export function fuzzyLookup(nameZh: string): ReservationEntry | undefined {
  if (DB[nameZh]) return DB[nameZh];
  // 去后缀重试
  const stripped = nameZh.replace(/(风景区|景区|公园|博物馆|纪念馆|名胜区)$/, "");
  return DB[stripped] ?? DB[Object.keys(DB).find(k => k.includes(stripped) || stripped.includes(k)) ?? ""];
}

/** 导出全部条目（供 action-link-service 批量使用） */
export function allEntries(): Readonly<Record<string, ReservationEntry>> {
  return DB;
}
```

### 1.2 修改 `src/services/action-link-service.ts`

**改动点：删除 `RESERVATION_URLS`，改为消费知识库**

```diff
- const RESERVATION_URLS: Record<string, string> = { ... };
+ import { lookup, fuzzyLookup } from "../data/reservation-db.js";

  // enrichTripWithLinks / enrichTripWithLiveLinks 中：
- bookingUrl: a.reservationRequired ? (RESERVATION_URLS[a.nameZh] ?? getInfoUrl(a)) : undefined,
+ bookingUrl: a.reservationRequired ? (lookup(a.nameZh)?.officialUrl ?? fuzzyLookup(a.nameZh)?.officialUrl ?? getInfoUrl(a)) : undefined,
```

### 1.3 知识库覆盖清单（50+ 景点）

按城市分组：

| 城市 | 景点 |
|------|------|
| 北京 | 故宫、国博、八达岭长城、颐和园、天坛、圆明园、毛主席纪念堂、恭王府、雍和宫 |
| 上海 | 上海博物馆、迪士尼乐园、东方明珠、上海科技馆 |
| 西安 | 兵马俑、陕西历史博物馆、华清宫、大雁塔、城墙 |
| 南京 | 中山陵、南京博物院、总统府、明孝陵、夫子庙 |
| 杭州 | 灵隐寺、雷峰塔、西溪湿地、千岛湖 |
| 成都 | 大熊猫繁育基地、三星堆博物馆、都江堰 |
| 重庆 | 洪崖洞、磁器口、武隆天坑 |
| 广州 | 长隆野生动物世界、陈家祠、广州塔 |
| 武汉 | 黄鹤楼、湖北省博物馆、东湖 |
| 厦门 | 鼓浪屿（轮渡）、南普陀寺 |
| 桂林 | 漓江游船、阳朔西街、龙脊梯田 |
| 丽江 | 玉龙雪山、丽江古城、束河古镇 |
| 拉萨 | 布达拉宫、大昭寺 |
| 其他 | 泰山、黄山、张家界、九寨沟、莫高窟、少林寺 |

---

## SUB-2: reservation-qunar-extract — 去哪儿数据源提取

### 2.1 修改 `src/services/free-sources/qunar-adapter.ts`

**改动点：扩展 HTML 解析提取预约标签和购票链接**

`QunarRawItem` 新增字段：
```diff
  interface QunarRawItem {
    name: string;
    address?: string;
    price?: number;
    rating?: number;
    commentCount?: number;
    sales?: number;
    category?: string;
    highlight?: string;
+   reservationRequired?: boolean;
+   bookingUrl?: string;
  }
```

`parseTicketHtml()` 中新增提取逻辑：

```ts
// 策略 2 增强版：从景点列表项中提取预约标签
const reservationPattern = /class="[^"]*(?:tag|label|badge)[^"]*"[^>]*>(需预约|必须预约|实名|限流|提前购票|分时段)/i;

// 景点详情链接提取
const detailUrlPattern = /href="(\/ticket\/detail[^"]+)"/i;

// 在 item 循环内：
const reservMatch = reservationPattern.exec(block);
const detailUrlMatch = detailUrlPattern.exec(block);

items.push({
  // ... 现有字段
  reservationRequired: reservMatch !== null,
  bookingUrl: detailUrlMatch
    ? `https://piao.qunar.com${detailUrlMatch[1]}`
    : undefined,
});

// 策略 3（__INITIAL_STATE__）增强：
// 去哪儿的 sight 对象中可能包含 needBooking / bookUrl 字段
reservationRequired: sight.needBooking === true || sight.needReserve === true,
bookingUrl: sight.bookUrl ? String(sight.bookUrl) : undefined,
```

`searchQunar()` 返回映射中新增：
```diff
  attractions.push({
    // ... 现有映射
+   reservationRequired: item.reservationRequired,
+   reservationTips: item.reservationRequired ? "建议提前在去哪儿购票" : undefined,
  });
```

### 2.2 修改 `src/services/free-sources/types.ts`

`FreeSourceAttraction` 新增（已有 `reservationRequired?` 和 `reservationTips?`，只需确认）：
```diff
  /** 预约提示 */
  reservationTips?: string;
+ /** 购票/预约链接（来自数据源） */
+ bookingUrl?: string;
```

`FusedAttraction` 同样新增：
```diff
  /** 预约提示 */
  reservationTips: string;
+ /** 购票/预约链接（来自数据源） */
+ bookingUrl?: string;
```

### 2.3 修改 `src/services/free-sources/fusion-engine.ts`

`mergeCluster()` 中合并 `bookingUrl`：

```diff
  // 9. 预约信息
  const reservationRequired = items.some((i) => i.reservationRequired);
  const reservationTips = items.find((i) => i.reservationTips)?.reservationTips ?? "";
+ const bookingUrl = items.find((i) => i.bookingUrl)?.bookingUrl;

  return {
    // ... 现有字段
    reservationRequired,
    reservationTips,
+   bookingUrl,
  };
```

### 2.4 修改 `src/types/trip.ts`

`Attraction` 已有 `bookingUrl?: string`，无需改动（确认兼容）。

---

## SUB-3: reservation-prompt — Agent 预约引导强化

### 3.1 新增类型 `src/types/trip.ts`

```diff
+ /** 预约时间轴（由 post-processor 计算） */
+ export interface ReservationTimeline {
+   /** 需提前几天 */
+   advanceDays: number;
+   /** 放票时间 */
+   releaseTime?: string;
+   /** 预约开放日（自动计算：游玩日 - advanceDays） */
+   bookingOpenDate: string;
+   /** 紧急度 */
+   urgency: "expired" | "urgent" | "normal";
+   /** 官方预约链接 */
+   officialUrl?: string;
+   /** 备选渠道 */
+   altChannels?: Array<{ platform: string; url: string }>;
+ }

  /** 景点信息 */
  export interface Attraction {
    // ... 现有字段
    bookingUrl?: string;
+   /** 预约时间轴（由 enrichReservationTimeline 填充） */
+   reservationTimeline?: ReservationTimeline;
  }
```

### 3.2 新建 `src/services/reservation-timeline-service.ts`

```ts
import type { Attraction, DayPlan, ReservationTimeline } from "../types/trip.js";
import { lookup, fuzzyLookup } from "../data/reservation-db.js";

/**
 * 为行程中的需预约景点计算预约时间轴
 */
export function enrichReservationTimeline(days: DayPlan[], today: string): DayPlan[] {
  const todayDate = new Date(today);

  return days.map(day => ({
    ...day,
    attractions: day.attractions.map(a => {
      if (!a.reservationRequired) return a;

      const entry = lookup(a.nameZh) ?? fuzzyLookup(a.nameZh);
      if (!entry) return a;

      const visitDate = new Date(day.date);
      const advanceDays = entry.peakSeasonMonths?.includes(visitDate.getMonth() + 1)
        ? (entry.peakAdvanceDays ?? entry.advanceDays)
        : entry.advanceDays;

      // 计算预约开放日
      const openDate = new Date(visitDate);
      openDate.setDate(openDate.getDate() - advanceDays);
      const bookingOpenDate = formatDate(openDate);

      // 计算紧急度
      let urgency: ReservationTimeline["urgency"];
      if (todayDate > openDate) {
        urgency = "expired"; // 已过预约窗口
      } else {
        const daysUntilOpen = daysBetween(todayDate, openDate);
        urgency = daysUntilOpen <= 2 ? "urgent" : "normal";
      }

      return {
        ...a,
        bookingUrl: a.bookingUrl ?? entry.officialUrl,
        reservationTimeline: {
          advanceDays,
          releaseTime: entry.releaseTime,
          bookingOpenDate,
          urgency,
          officialUrl: entry.officialUrl,
          altChannels: entry.altChannels,
        },
      };
    }),
  }));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
```

### 3.3 修改 `src/services/post-processor.ts`

在后处理管线中插入预约时间轴计算（在 action-link 之前）：

```diff
+ import { enrichReservationTimeline } from "./reservation-timeline-service.js";

  export async function postProcessTripPlan(tripPlan, config) {
    // ... 现有步骤 0-1

+   // 1.5 预约时间轴计算（在链接生成之前，为 bookingUrl 提供知识库数据）
+   enriched = {
+     ...enriched,
+     days: enrichReservationTimeline(enriched.days, new Date().toISOString().slice(0, 10)),
+   };

    // 2. 行动链接生成
    // ... 现有逻辑
  }
```

### 3.4 修改 `src/agent/prompts.ts`

在 `PLANNING_PROMPT` 末尾追加预约管理规则：

```diff
  ## 重要规则

+ ## 预约管理规则
+
+ 当行程包含需预约景点（`reservationRequired: true`）时，你必须在输出中：
+
+ 1. **预约时间线**：每个需预约景点下方标注预约时间
+    - 如果 `reservationTimeline` 存在，直接引用 `bookingOpenDate` 和 `releaseTime`
+    - 如果不存在，保守建议"建议提前查询官方渠道预约"
+
+ 2. **紧急度标记**：
+    - 🔴 已过预约窗口 → 提醒该景点可能无法入园，建议备选
+    - 🟡 预约窗口 1-2 天内开启 → 提醒设闹钟
+    - 🟢 尚早 → 正常提示
+
+ 3. **预约清单汇总**：在行程末尾生成一张汇总表
+    | 景点 | 游玩日 | 开始预约日 | 放票时间 | 链接 |
+
+ 4. **备选方案**：🔴 紧急度景点必须有备选建议
```

### 3.5 修改 `src/services/action-link-service.ts`

`generateActionLinksTool` 输出增强，增加预约时间轴信息：

```diff
  for (const day of enriched.days) {
    for (const attr of day.attractions) {
      if (attr.bookingUrl) {
        if (attr.reservationRequired) {
-         reservationList.push(`- **${attr.nameZh}** → ${attr.bookingUrl}`);
+         const timeline = attr.reservationTimeline;
+         let entry = `- **${attr.nameZh}** → [预约链接](${attr.bookingUrl})`;
+         if (timeline) {
+           const urgencyEmoji = { expired: "🔴", urgent: "🟡", normal: "🟢" }[timeline.urgency];
+           entry += `\n  ${urgencyEmoji} 游玩日 ${day.date} · 需提前${timeline.advanceDays}天 · `;
+           entry += timeline.releaseTime ? `每日${timeline.releaseTime}放票` : "全天可约";
+           if (timeline.altChannels?.length) {
+             entry += `\n  📎 备选: ${timeline.altChannels.map(c => `[${c.platform}](${c.url})`).join(" | ")}`;
+           }
+         }
+         reservationList.push(entry);
        }
      }
    }
  }
```

---

## SUB-4: reservation-qa — 伴游预约问答增强

### 4.1 修改 `src/services/companion-service.ts`

**新增两个查询意图：**

```diff
  const INTENTS: QueryIntent[] = [
    // ... 现有意图
+   { type: "reservation_timeline", keywords: ["什么时候抢票", "什么时候预约", "几点放票", "抢票时间", "预约时间", "提前几天"] },
+   { type: "reservation_status", keywords: ["预约清单", "哪些要预约", "预约状态", "待预约", "还没预约"] },
  ];
```

**新增两个处理函数：**

```ts
function queryReservationTimeline(attractions: Attraction[], tripPlan: TripPlan): string {
  const withReservation = attractions.filter(a => a.reservationRequired);
  if (withReservation.length === 0) {
    return "当前行程中没有需要提前预约的景点 🎉";
  }

  return withReservation.map(a => {
    const tl = a.reservationTimeline;
    if (!tl) {
      return `${a.nameZh}: 需要预约，建议提前查询官方渠道\n   🔗 ${a.bookingUrl ?? "暂无链接"}`;
    }
    const urgencyMap = {
      expired: "🔴 已过预约窗口！建议寻找备选景点",
      urgent: "🟡 预约窗口即将开启，请设闹钟提醒",
      normal: "🟢 尚早，可稍后预约",
    };
    return [
      `${a.nameZh}:`,
      `   📅 需提前 ${tl.advanceDays} 天预约`,
      `   ⏰ ${tl.releaseTime ? `每日 ${tl.releaseTime} 放票` : "全天可约"}`,
      `   📆 预约开放日: ${tl.bookingOpenDate}`,
      `   ${urgencyMap[tl.urgency]}`,
      `   🔗 ${tl.officialUrl ?? a.bookingUrl ?? "暂无链接"}`,
      tl.altChannels?.length
        ? `   📎 备选: ${tl.altChannels.map(c => `${c.platform}(${c.url})`).join(", ")}`
        : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

function queryReservationStatus(tripPlan: TripPlan): string {
  const allAttractions = tripPlan.days.flatMap(d =>
    d.attractions.map(a => ({ ...a, date: d.date, dayIndex: d.dayIndex }))
  );
  const required = allAttractions.filter(a => a.reservationRequired);

  if (required.length === 0) {
    return "当前行程中没有需要预约的景点 🎉 全部可直接前往！";
  }

  const lines = ["📋 **预约清单**", ""];
  const table = ["| # | 景点 | 游玩日 | 预约开放日 | 放票时间 | 状态 | 链接 |", "|---|------|--------|-----------|---------|------|------|"];

  required.forEach((a, i) => {
    const tl = a.reservationTimeline;
    const statusEmoji = tl
      ? { expired: "🔴过期", urgent: "🟡紧急", normal: "🟢正常" }[tl.urgency]
      : "⚠️未知";
    table.push(
      `| ${i + 1} | ${a.nameZh} | ${a.date} | ${tl?.bookingOpenDate ?? "查询官方" } | ${tl?.releaseTime ?? "全天"} | ${statusEmoji} | [预约](${a.bookingUrl ?? "#"}) |`
    );
  });

  return [...lines, ...table].join("\n");
}
```

**switch 新增分支：**

```diff
  switch (intent) {
    // ... 现有 case
+   case "reservation_timeline":
+     answer = queryReservationTimeline(matchedAttractions, tripPlan);
+     sources.push(...matchedAttractions.filter(a => a.reservationRequired).map(a => a.nameZh));
+     break;
+   case "reservation_status":
+     answer = queryReservationStatus(tripPlan);
+     sources.push("reservation_data");
+     break;
  }
```

### 4.2 修改 `src/tools/companion.ts`

参数中 `attractions` 对象新增 `reservationTimeline`：

```diff
  attractions: Type.Array(
    Type.Object({
      // ... 现有字段
      reservationRequired: Type.Boolean(),
      reservationTips: Type.Optional(Type.String()),
      bookingUrl: Type.Optional(Type.String()),
+     reservationTimeline: Type.Optional(Type.Object({
+       advanceDays: Type.Number(),
+       releaseTime: Type.Optional(Type.String()),
+       bookingOpenDate: Type.String(),
+       urgency: Type.String(),
+       officialUrl: Type.Optional(Type.String()),
+       altChannels: Type.Optional(Type.Array(Type.Object({
+         platform: Type.String(),
+         url: Type.String(),
+       }))),
+     })),
    }),
  ),
```

---

## 数据流总览

```
用户输入行程请求
  ↓
Agent 调用 search_attractions
  ↓ qunar adapter 提取 reservationRequired + bookingUrl
  ↓ 融合引擎合并多源预约信息
  ↓ 知识库查询补充 advanceDays/releaseTime/officialUrl
Agent 编排行程（LLM）
  ↓
Post-Processor:
  1. enrichReservationTimeline() → 计算预约时间轴 + 紧急度
  2. calculateBudget()
  3. enrichTripWithLiveLinks() → 生成含预约信息的行动链接
  ↓
Agent 输出:
  - 行程正文（含 ⚠️ 预约提示）
  - 预约清单汇总表（含紧急度 + 链接）
  - 🔴 景点备选方案
  ↓
用户追问:
  "故宫什么时候抢票？" → queryReservationTimeline()
  "哪些景点要预约？" → queryReservationStatus()
```

## 测试策略

### SUB-1 测试
- `reservation-db.test.ts`: 精确查询、模糊查询、别名匹配
- `action-link-service.test.ts`: 知识库驱动的 bookingUrl 生成

### SUB-2 测试
- `qunar-adapter.test.ts`: Mock HTML 含预约标签 → reservationRequired=true
- `fusion-engine.test.ts`: 多源预约信息合并

### SUB-3 测试
- `reservation-timeline-service.test.ts`: 时间轴计算、紧急度判定、旺季/淡季区别
- `post-processor.test.ts`: 集成测试（预约时间轴 → 链接生成）

### SUB-4 测试
- `companion-service.test.ts`: 预约时间线查询、预约状态查询、无预约景点回答
