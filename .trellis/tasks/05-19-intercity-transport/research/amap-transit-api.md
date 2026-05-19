# 高德路线规划 API（公交/火车）调研

## API 端点

```
GET https://restapi.amap.com/v3/direction/transit/integrated
```

## 关键参数

| 参数 | 说明 | 示例 |
|------|------|------|
| key | 高德 Web API Key | — |
| origin | 起点坐标（**经度,纬度**） | `120.155,30.275` |
| destination | 终点坐标（**经度,纬度**） | `121.474,31.230` |
| city | 起点城市名（必填） | `杭州` |
| cityd | 终点城市名（跨城必填） | `上海` |
| strategy | 路线策略 | `0` 最快 / `1` 最经济 / `2` 最少换乘 |
| nightflag | 是否算夜班车 | `0` 不算 / `1` 算 |
| date | 出发日期 | `2026-05-20` |
| time | 出发时间 | `08:00` |

## strategy 值

| 值 | 含义 |
|----|------|
| 0 | 最快路线 |
| 1 | 最经济路线 |
| 2 | 最少换乘 |
| 3 | 步行少 |

## 返回结构（精简）

```json
{
  "status": "1",
  "route": {
    "transits": [
      {
        "cost": {
          "duration": "7200",
          "transit_fee": "73.5"
        },
        "distance": "175000",
        "segments": [
          {
            "transit_mode": "火车",
            "bus": {
              "buslines": [
                {
                  "departure_stop": { "name": "杭州东站", "location": "120.21,30.29" },
                  "arrival_stop": { "name": "上海虹桥站", "location": "121.32,31.19" },
                  "name": "G7590",
                  "via_num": "1",
                  "via_stops": [],
                  "start_time": "08:30",
                  "end_time": "09:30"
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

## 关键注意事项

1. **坐标格式 `经度,纬度`**（与 Google 相反）
2. 需要先通过 `dualGeocode` 获取城市坐标
3. `cost.duration` 单位是**秒**
4. `transit_fee` 是字符串格式的价格
5. `transit_mode` 可以是 "火车"、"飞机"、"公交" 等
6. 免费额度 5000 次/日
7. 跨城查询必须提供 `cityd` 参数
8. 火车方案在 `segments[].bus.buslines[]` 中，name 是班次号

## 价格估算

火车票价格可通过距离粗略估算：
- 高铁/动车：约 ¥0.46/公里
- 普速列车：约 ¥0.15/公里

API 返回的 `transit_fee` 通常比较准确。
