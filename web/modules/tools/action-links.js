import { Type } from "@earendil-works/pi-ai";

// ─── 行动链接工具 ────────────────────────────────────
export const generateActionLinksTool = {
  name: "generate_action_links",
  label: "行动链接",
  description: "为旅行计划生成实用行动链接：需预约景点的官方预约链接、酒店比价（Booking/飞猪/去哪儿）、城际交通机票火车票搜索链接。",
  parameters: Type.Object({
    tripPlan: Type.Object({
      city: Type.String({ description: "主城市名" }),
      cities: Type.Array(Type.String()),
      startDate: Type.String(),
      endDate: Type.String(),
      days: Type.Array(Type.Object({
        date: Type.String(),
        dayIndex: Type.Number(),
        city: Type.String(),
        isTransferDay: Type.Optional(Type.Boolean()),
        attractions: Type.Array(Type.Object({
          name: Type.String(),
          nameZh: Type.String(),
          reservationRequired: Type.Optional(Type.Boolean()),
        })),
        hotel: Type.Optional(Type.Object({
          name: Type.String(),
        })),
      })),
    }),
  }),
  execute: async (_id, params) => {
    const { tripPlan } = params;
    const lines = ["## 🔗 行动链接"];
    let linkCount = 0;
    for (const day of tripPlan.days) {
      for (const attr of day.attractions || []) {
        if (attr.reservationRequired) {
          lines.push(`- 📍 **${attr.nameZh}** 需预约 → [查询预约方式](https://www.google.com/search?q=${encodeURIComponent(attr.nameZh + ' 预约 门票')})`);
          linkCount++;
        }
        lines.push(`- ℹ️ **${attr.nameZh}** → [查看信息](https://www.google.com/search?q=${encodeURIComponent(attr.nameZh)})`);
        linkCount++;
      }
      if (day.hotel) {
        lines.push(`- 🏨 **${day.hotel.name}** → [Booking.com 比价](https://www.booking.com/searchresults.html?ss=${encodeURIComponent(day.city)})`);
        linkCount++;
      }
      for (const meal of (day.meals || [])) {
        if (meal.restaurant) {
          const r = meal.restaurant;
          const query = encodeURIComponent(r.name + ' ' + day.city);
          lines.push(`- 🍴 **${r.name}** (${meal.type === 'breakfast' ? '早餐' : meal.type === 'lunch' ? '午餐' : meal.type === 'dinner' ? '晚餐' : '小吃'}) → [大众点评](https://www.dianping.com/search/keyword/${encodeURIComponent(day.city)}/${encodeURIComponent(r.name)}) [搜索](https://www.google.com/search?q=${query})`);
          linkCount++;
        }
      }
    }
    if (tripPlan.cities?.length > 1) {
      for (let i = 0; i < tripPlan.cities.length - 1; i++) {
        const from = tripPlan.cities[i];
        const to = tripPlan.cities[i + 1];
        lines.push(`- 🚄 **${from} → ${to}** → [Skyscanner机票](https://www.skyscanner.net/transport/flights/${encodeURIComponent(from)}/${encodeURIComponent(to)}/) [携程](https://flights.ctrip.com/online/search?departure=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)})`);
        linkCount += 2;
      }
    }
    lines.splice(1, 0, `生成了 **${linkCount}** 个实用链接`);
    // 保存行程数据供地图渲染
    window._lastTripPlan = tripPlan;
    // 启用地图按钮
    document.getElementById("btn-map")?.classList.remove("disabled-ghost");
    // 如果当前在地图页面，自动刷新
    if (window.currentPage === 'page-map') {
      // 调用 initPageMap from window if available (set during init)
      if (typeof window._initPageMap === 'function') window._initPageMap();
    }
    // 检查是否有需要丰富的补给点
    const hasSupplies = tripPlan.days?.some(d =>
      d.attractions?.some(a =>
        a.routes?.some(r => r.waypoints?.some(wp => wp.supplyPoints?.length > 0))
      )
    );
    if (hasSupplies) {
      document.getElementById("btn-enrich-supplies")?.style.setProperty("display", "inline-block");
    }
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { tripPlan, linkCount },
    };
  },
};