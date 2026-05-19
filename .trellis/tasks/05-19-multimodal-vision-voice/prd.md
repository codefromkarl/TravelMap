# 图像与语音多模态能力规划

## 背景

TravelAgent（旅图）当前是一个纯文本交互的旅行规划助手。用户输入文字需求 → LLM 生成行程 → 前端展示地图+卡片。项目中没有图像生成/识别、语音输入/输出能力。

项目已有的相关基础设施：
- `web/modules/share.js` — Canvas 绘制行程分享卡片（900×1200）
- `src/services/xhs-service.ts` — 小红书笔记搜索（含封面图 URL）
- `src/tools/companion.ts` — 伴游问答（可扩展为语音对话入口）
- `src/types/trip.ts` — `Location` 类型（支持经纬度触发）
- 多语言 i18n 基础（中/英/日）

## 总体策略

按优先级分 3 批交付，每批 1-2 周：

- **Batch 1（快速见效）**：景点图片 + 天气可视化 + 语音播报
- **Batch 2（体验升级）**：语音输入 + AI 行程海报 + 图片识别景点
- **Batch 3（深度差异化）**：AI 导游语音讲解 + 语音伴游问答闭环

---

## Batch 1：快速见效

### 1.1 景点图片丰富

**目标**：每个景点附带 1-3 张真实照片，行程卡片展示更生动。

**数据源优先级**：
1. 小红书笔记封面（已有 `xhs-service`，零成本）
2. Unsplash API（免费 50 次/小时）
3. Pexels API（免费 200 次/小时）

**实现**：
- `src/services/supply-enrich-service.ts` 中增加图片丰富步骤
- `Attraction` 类型新增 `images?: string[]` 字段
- 前端行程卡片展示景点图片

**文件变更**：
- `src/types/trip.ts` — Attraction 加 `images` 字段
- `src/services/supply-enrich-service.ts` — 新增图片获取逻辑
- `src/services/image-service.ts`（新建）— 统一图片源路由
- 前端景点卡片组件

### 1.2 天气可视化

**目标**：把 `WeatherInfo` 数据渲染成温度曲线图 + 天气图标，替代纯文字。

**实现**：
- 纯前端，SVG/Canvas 图表
- 不依赖外部 API
- 显示 7 天温度曲线 + 天气图标 + 风力指示

### 1.3 语音行程播报

**目标**：用户点击「语音播报」按钮，TTS 朗读每日行程摘要。

**TTS 数据源优先级**：
1. Edge TTS（免费，中文质量好）
2. OpenAI TTS API（付费，质量最好）
3. 阿里云 TTS（中文专精）

**实现**：
- `src/services/tts-service.ts`（新建）— TTS 路由
- `src/tools/tts.ts`（新建）— TTS Tool 定义
- 前端添加播放按钮 + `<audio>` 播放器
- 行程文本 → 摘要模板 → TTS 音频

---

## Batch 2：体验升级

### 2.1 语音输入规划

**目标**：用户说话 → STT → 送入现有 agent 流程。

**STT 数据源**：
1. 浏览器原生 Web Speech API（免费，零依赖）
2. Whisper API（付费，准确率高）

**实现**：
- 前端录音按钮 → Web Speech API → 文本输入框
- 移动端优先适配

### 2.2 AI 行程海报

**目标**：一键生成小红书风格攻略长图（带排版、emoji、景点照片）。

**实现**：
- 扩展现有 `share.js` Canvas 能力
- 从单页卡片 → 长图滚动布局
- 接入景点照片（Batch 1.1 的成果）

### 2.3 图片识别景点

**目标**：用户上传旅途照片 → 多模态 LLM 识别景点 → 匹配行程。

**实现**：
- 调用多模态 LLM（GPT-4o / Claude Vision / Gemini）
- 新增 `src/tools/image-recognize.ts`
- 识别结果匹配 `Attraction.nameZh/nameEn`

---

## Batch 3：深度差异化

### 3.1 AI 导游语音讲解

**目标**：用户到了景点附近 → 自动播放 AI 生成的景点讲解。

**实现**：
- 基于 `Location` 经纬度 + 前端 Geolocation API
- LLM 生成讲解稿（结合景点信息 + 历史背景）
- TTS 播放

### 3.2 语音伴游问答

**目标**：全语音对话的伴游体验（STT → companionQATool → TTS）。

**实现**：
- 扩展 `companionQATool`，增加语音输入/输出模式
- 前端持续监听 + 对话式交互
- 支持多语言语音问答

---

## 配置规划

`.env` 新增：
```
# 图像
UNSPLASH_ACCESS_KEY=
PEXELS_API_KEY=

# TTS / STT
EDGE_TTS_ENABLED=true
OPENAI_TTS_API_KEY=
ALIYUN_TTS_ACCESS_KEY=
WHISPER_API_KEY=

# 多模态 LLM（复用现有模型配置）
```

`src/services/config.ts` 新增对应字段。

## 依赖分析

```
Batch 1.1（景点图片） ← 无依赖，可独立启动
Batch 1.2（天气可视化） ← 无依赖，可独立启动
Batch 1.3（语音播报） ← 无依赖，可独立启动
Batch 2.1（语音输入） ← 无依赖
Batch 2.2（AI 海报） ← 依赖 1.1（景点图片）
Batch 2.3（图片识别） ← 无依赖
Batch 3.1（导游讲解） ← 依赖 1.3（TTS）+ 1.1（景点数据）
Batch 3.2（语音问答） ← 依赖 2.1（STT）+ 1.3（TTS）
```

## 验收标准

每个 Batch 完成后：
- [ ] 所有新功能有对应的单元测试（mock 外部 API）
- [ ] 现有测试全部通过
- [ ] 无 API Key 时优雅降级（不影响现有功能）
- [ ] 前端 UI 适配移动端
- [ ] 类型安全（TypeScript strict）

## 执行方式

本 PRD 为规划文档，实际执行时每个子项拆分为独立 Trellis 任务，引用本 PRD 作为父任务。
