/**
 * MSW handlers — 交通/路线相关 API
 *
 * 高德路线规划（城际交通）
 * 高德周边搜索（餐厅）
 */

import { HttpResponse, http } from "msw";

// ─── 高德路线规划（城际交通） ─────────────────────────────
export const amapTransitHandler = http.get(
  "https://restapi.amap.com/v3/direction/transit/integrated",
  () => {
    return HttpResponse.json({
      status: "1",
      route: {
        transits: [
          {
            cost: { duration: "5400", transit_fee: "73.5" },
            distance: "175000",
            segments: [
              {
                transit_mode: "火车",
                bus: {
                  buslines: [
                    {
                      departure_stop: { name: "杭州东站", location: "120.21,30.29" },
                      arrival_stop: { name: "上海虹桥站", location: "121.32,31.19" },
                      name: "G7590",
                      via_num: "1",
                      via_stops: [],
                      start_time: "08:30",
                      end_time: "09:30",
                    },
                  ],
                },
              },
            ],
          },
          {
            cost: { duration: "6000", transit_fee: "55.0" },
            distance: "175000",
            segments: [
              {
                transit_mode: "火车",
                bus: {
                  buslines: [
                    {
                      departure_stop: { name: "杭州东站", location: "120.21,30.29" },
                      arrival_stop: { name: "上海站", location: "121.47,31.23" },
                      name: "D658",
                      via_num: "2",
                      via_stops: [],
                      start_time: "10:00",
                      end_time: "11:40",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
  },
);

// ─── 高德周边搜索（餐厅） ──────────────────────────────
export const amapNearbySearchHandler = http.get(
  "https://restapi.amap.com/v3/place/around",
  ({ request }) => {
    const url = new URL(request.url);
    const keywords = url.searchParams.get("keywords");

    return HttpResponse.json({
      status: "1",
      count: "2",
      pois: [
        {
          id: "B001",
          name: keywords ? `${keywords}餐厅` : "外婆家(西湖店)",
          type: "餐饮服务;中餐厅;浙江菜",
          address: "杭州市西湖区龙井路1号",
          location: "120.155,30.275",
          tel: "0571-88888001",
          rating: "4.5",
          biz_ext: { rating: "4.5", cost: "85", open_time: "10:00-22:00" },
          distance: "350",
        },
        {
          id: "B002",
          name: "绿茶餐厅(西湖银泰店)",
          type: "餐饮服务;中餐厅;浙江菜",
          address: "杭州市上城区延安路98号",
          location: "120.169,30.259",
          tel: "0571-88888002",
          rating: "4.2",
          biz_ext: { rating: "4.2", cost: "65", open_time: "11:00-21:30" },
          distance: "580",
        },
      ],
    });
  },
);
