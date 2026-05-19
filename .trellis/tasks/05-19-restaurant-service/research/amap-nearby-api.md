# 高德周边搜索 API 调研

## API 端点

```
GET https://restapi.amap.com/v3/place/around
```

## 关键参数

| 参数 | 说明 | 示例 |
|------|------|------|
| key | 高德 Web API Key | — |
| location | 中心点经纬度（逗号分隔，**经度在前**） | `120.155,30.275` |
| types | POI 类型 | 餐饮: `050000` / 中餐: `050100` / 快餐: `050300` |
| radius | 搜索半径（米），最大 50000 | `1000` |
| sortrule | 排序规则 | `distance`（距离优先）/ `weight`（综合排序） |
| offset | 每页记录数（最大 25） | `10` |
| page | 页码 | `1` |
| extensions | 返回数据详细程度 | `all`（返回详细信息） |

## 餐饮类型码

| 类型码 | 说明 |
|--------|------|
| 050000 | 餐饮服务（全部） |
| 050100 | 中餐厅 |
| 050200 | 外国餐厅 |
| 050300 | 快餐 |
| 050400 | 咖啡厅 |
| 050500 | 茶艺馆 |
| 050600 | 冷饮店 |
| 050700 | 糕饼店 |
| 050800 | 甜品店 |

## 返回字段

```json
{
  "status": "1",
  "pois": [
    {
      "id": "B0xxx",
      "name": "外婆家(西湖店)",
      "type": "餐饮服务;中餐厅;浙江菜",
      "address": "杭州市西湖区xxx路xx号",
      "location": "120.155,30.275",
      "tel": "0571-xxxxxxxx",
      "rating": "4.5",
      "cost": { "avg": 85 },
      "photos": [...],
      "biz_ext": {
        "rating": "4.5",
        "cost": "85",
        "open_time": "10:00-22:00"
      },
      "distance": "350"
    }
  ]
}
```

## 关键注意事项

1. **location 格式是 `经度,纬度`**（与 Google Maps 的 `lat,lng` 相反）
2. `biz_ext.cost` 是人均消费（元），部分 POI 无此字段
3. `distance` 单位是米
4. 免费额度 5000 次/日，足够使用
5. 响应中的 `type` 字段格式为 `大类;中类;小类`，可解析出菜系

## Google Places Nearby Search（国外降级）

```
GET https://maps.googleapis.com/maps/api/place/nearbysearch/json
  ?location=30.275,120.155   # 注意：Google 是 lat,lng
  &radius=1000
  &type=restaurant
  &key=API_KEY
```

返回 `results[].price_level` (0-4) 和 `results[].rating`。
