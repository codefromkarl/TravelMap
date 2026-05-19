# P1: 景点预约通道系统性接入

## 背景

当前预约信息存在三个核心瓶颈：
1. **数据源层**：qunar/wikivoyage/Google Places 均不返回预约字段，`reservationRequired` 几乎全靠 Mock 数据
2. **链接层**：`RESERVATION_URLS` 仅 8 条硬编码映射，覆盖率 <1%
3. **交互层**：Agent 仅在最终输出中静态展示链接，无时间节点提醒、无预约流程引导

## 目标

建立「**数据获取 → 判定 → 链接匹配 → 主动引导**」的完整预约闭环。

---

## 架构分层

### Layer 1: 预约知识库（P0 — 立即可行）
将 `RESERVATION_URLS` 迁移为结构化 JSON 知识库，扩充到 50+ 热门景点。

### Layer 2: 数据源动态提取（P1 — qunar adapter 扩展）
从去哪儿门票页提取「需预约」标签和购票链接，为预约判定提供真实数据源。

### Layer 3: 预约判定引擎（P1 — 融合层改造）
三级瀑布：知识库精确匹配 → 去哪儿数据 → 启发式规则（类别+城市+季节）。

### Layer 4: Agent Prompt 强化（P2 — 交互体验）
增加预约时间轴意识、紧急度标记、预约清单汇总表格、备选方案建议。

### Layer 5: 伴游问答增强（P3 — 多轮对话闭环）
用户可追问预约状态、抢票时间等，Agent 基于行程数据精确回答。

---

## 子任务

### SUB-1: `reservation-db` — 预约知识库（P0）

**文件变更：**
- 新建 `src/data/reservation-db.json` — 结构化预约知识库
- 修改 `src/services/action-link-service.ts` — 消费知识库替代硬编码 `RESERVATION_URLS`

**知识库结构：**
```jsonc
{
  "故宫博物院": {
    "officialUrl": "https://www.dpm.org.cn/visit/ticket.html",
    "platform": "官方小程序/官网",
    "advanceDays": 7,            // 需提前几天预约
    "releaseTime": "20:00",      // 每日放票时间
    "peakSeasonMonths": [4,5,6,7,8,9,10],
    "tips": "实名制，刷身份证入园，每日20:00放第7天票",
    "altChannels": [
      { "platform": "美团", "url": "https://..." },
      { "platform": "携程", "url": "https://..." }
    ]
  }
}
```

**验收标准：**
- [ ] 知识库覆盖 50+ 全国热门景点（含港澳台）
- [ ] `action-link-service.ts` 的 `RESERVATION_URLS` 替换为从知识库读取
- [ ] `getInfoUrl` fallback 保留（不在知识库中的景点仍走 Google 搜索）
- [ ] 现有 action-link 单元测试全部通过
- [ ] 新增测试：知识库查询、fallback、多渠道链接生成

---

### SUB-2: `reservation-qunar-extract` — 去哪儿数据源提取（P1）

**文件变更：**
- 修改 `src/services/free-sources/qunar-adapter.ts` — 扩展提取预约标签+购票链接
- 修改 `src/services/free-sources/types.ts` — `FreeSourceAttraction` 增加 `bookingUrl`

**提取策略：**
1. 去哪儿门票列表页中检测「需预约」「提前购票」等标签文字
2. 提取景点详情链接 `https://piao.qunar.com/ticket/detail/xxx` 作为 `bookingUrl`
3. 从详情页可进一步提取预约说明（可选，第二期）

**验收标准：**
- [ ] `QunarRawItem` 增加 `reservationRequired` 和 `bookingUrl` 字段
- [ ] `FreeSourceAttraction` 增加 `bookingUrl?: string`
- [ ] 去哪儿返回的景点如含预约标签，`reservationRequired` 正确标记
- [ ] 去哪儿返回的景点详情链接作为 `bookingUrl` 传递
- [ ] 融合引擎正确合并去哪儿的预约信息
- [ ] 现有 qunar adapter 测试通过

---

### SUB-3: `reservation-prompt` — Agent 预约引导强化（P2）

**文件变更：**
- 修改 `src/agent/prompts.ts` — 增加预约管理规则
- 修改 `src/services/action-link-service.ts` — 生成预约时间轴数据
- 修改 `src/types/trip.ts` — `Attraction` 增加预约时间轴字段

**Prompt 增加内容：**
1. 预约时间线计算：游玩日期 - advanceDays = 开始预约日期
2. 紧急度标记：🔴 已过窗口 / 🟡 即将开启 / 🟢 尚早
3. 行程末尾预约清单汇总表
4. 对预约不确定性高的景点提供备选

**类型扩展：**
```ts
interface ReservationTimeline {
  advanceDays: number;           // 需提前几天
  releaseTime?: string;          // 放票时间
  bookingOpenDate: string;       // 预约开放日（自动计算）
  urgency: "expired" | "urgent" | "normal";
  officialUrl?: string;
  altChannels?: { platform: string; url: string }[];
}
```

**验收标准：**
- [ ] Agent 输出中包含预约时间轴计算结果
- [ ] 紧急度标记正确显示
- [ ] 行程末尾有预约清单汇总表
- [ ] 已过预约窗口的景点有备选建议
- [ ] 伴游问答可查询预约时间（复用 companion-service）

---

### SUB-4: `reservation-qa` — 伴游预约问答增强（P3）

**文件变更：**
- 修改 `src/services/companion-service.ts` — 增加 `reservation_timeline` 查询类型
- 修改 `src/tools/companion.ts` — 参数适配

**增强内容：**
1. 新增 `reservation_timeline` 意图：用户问"故宫什么时候抢票？"→ 返回预约开放日+放票时间
2. 新增 `reservation_status` 意图：用户问"哪些景点还没预约？"→ 列出待预约清单
3. 回答中包含可点击的预约链接

**验收标准：**
- [ ] "故宫什么时候抢票" → 返回精确日期和时间
- [ ] "哪些景点需要预约" → 列出所有需预约景点及链接
- [ ] "预约清单" → 表格形式输出
- [ ] 现有 companion 测试通过

---

## 设计决策记录

### D1. 知识库 vs 实时 API
- **选择**：本地 JSON 知识库为主，去哪儿购票链接为辅
- **理由**：国内景点预约政策变化虽频繁，但核心规则（提前几天、放票时间）相对稳定；实时 API（如高德/百度 POI）不提供预约信息

### D2. 不支持自动预约
- 景点预约涉及实名认证、支付、退改规则，法律风险高
- 定位为「**信息助手**」：提供链接+提醒，用户自行操作

### D3. 知识库维护策略
- 首期手动维护 50+ 热门景点
- 后续可通过脚本定期从去哪儿/小红书提取更新
- 用户反馈纠错作为补充渠道

### D4. 启发式规则的边界
- 仅作为 fallback（无知识库命中 + 无数据源信息时）
- 基于类别（博物馆）+ 城市（一线）+ 季节（旺季）推断
- 推断结果标记为「可能需要预约」，不标记为确定

---

## 验收总表

- [ ] 知识库覆盖 50+ 景点，替代硬编码 `RESERVATION_URLS`
- [ ] 去哪儿 adapter 提取预约标签+购票链接
- [ ] 三级瀑布判定：知识库 → 数据源 → 启发式
- [ ] Agent 主动输出预约时间轴+紧急度+汇总表
- [ ] 伴游问答支持预约时间和状态查询
- [ ] 所有现有测试不回归
- [ ] 新增单元测试覆盖每个子任务的核心场景

## 后续迭代（不在本期）

- 知识库自动更新脚本（从去哪儿/小红书定期抓取）
- 用户反馈纠错接口
- 预约状态追踪（用户可手动标记"已预约"）
- 与日历 App 集成（生成提醒事件）
