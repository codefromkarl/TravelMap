# 小红书免费数据源部署指南

本文档说明如何部署 **NanmiCoder/MediaCrawler** 自建爬虫服务，作为 TravelAgent 的零成本小红书数据源。

---

## 方案对比

| 方案 | 成本 | 数据质量 | 维护成本 |
|------|------|---------|---------|
| Rnote API | $0.008/次 | ⭐⭐⭐⭐⭐ | 无 |
| JustOneAPI | ~$0.01/次 | ⭐⭐⭐⭐ | 无 |
| TikHub | $0.001-0.01/次 | ⭐⭐⭐⭐ | 无 |
| **MediaCrawler 自部署** | **免费** | ⭐⭐⭐ | 需维护 Cookie |

---

## 一、环境准备

### 1.1 系统要求

- **OS**: macOS / Linux / Windows
- **Python**: >= 3.11
- **Node.js**: >= 16.0
- **Chrome**: >= 144（CDP 模式需要）
- **uv**: Python 包管理器（推荐）

### 1.2 安装 uv

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# 验证
uv --version
```

---

## 二、部署 MediaCrawler

### 2.1 克隆项目

```bash
git clone https://github.com/NanmiCoder/MediaCrawler.git
cd MediaCrawler
```

### 2.2 安装依赖

```bash
uv sync
```

### 2.3 Chrome CDP 模式配置（推荐）

CDP 模式复用你本地的 Chrome 浏览器，反检测能力最强。

1. 打开 Chrome，地址栏输入：
   ```
   chrome://inspect/#remote-debugging
   ```
2. 勾选 **"Allow remote debugging for this browser instance"**
3. 确认页面显示 `Server running at: 127.0.0.1:9222`

> 如不想用 CDP 模式，编辑 `config/base_config.py` 设置 `ENABLE_CDP_MODE = False`

### 2.4 首次登录（建立 Cookie）

```bash
# 启动爬虫，扫码登录小红书
uv run python main.py --platform xhs --lt qrcode --type search

# 弹出二维码 → 用小红书 App 扫码登录
# 登录成功后 Cookie 会自动缓存到本地
```

登录成功后，后续爬取会复用 Cookie，不需要重复扫码。

### 2.5 启动 API 服务

```bash
# 启动 WebUI + API 服务（默认端口 8080）
uv run uvicorn api.main:app --host 0.0.0.0 --port 8080 --reload
```

验证服务是否正常：

```bash
curl http://localhost:8080/api/health
# 返回 {"status":"ok"} 表示成功
```

---

## 三、TravelAgent 对接

### 3.1 配置环境变量

编辑 TravelAgent 项目的 `.env` 文件：

```bash
# 启用 Crawler Provider
XHS_CRAWLER_BASE=http://localhost:8080

# 可选：如果设置了 API 认证
# XHS_CRAWLER_TOKEN=your_token

# 推荐路由策略：优先使用免费 Crawler，失败后降级到付费 API
XHS_ROUTER_PROVIDERS=crawler,rnote,justoneapi,tikhub
# 或者只使用免费方案：
# XHS_ROUTER_PROVIDERS=crawler
```

### 3.2 工作流程

TravelAgent 调用流程：

```
TravelAgent 搜索 "北京 故宫 旅游攻略"
    │
    ├─ POST /api/crawler/start
    │   { platform: "xhs", crawler_type: "search", keywords: "..." }
    │
    ├─ 轮询 GET /api/crawler/status（每 3 秒）
    │   等待 status 从 "running" → "idle"
    │
    ├─ GET /api/data/files?platform=xhs
    │   获取最新爬取结果文件
    │
    └─ GET /api/data/files/{path}?preview=true&limit=10
        读取笔记内容 → 转为 UGCReview
```

### 3.3 注意事项

| 事项 | 说明 |
|------|------|
| **首次需登录** | 必须先通过 WebUI 或 CLI 扫码登录小红书 |
| **Cookie 有效期** | 约 1-7 天，过期需重新扫码 |
| **并发限制** | MediaCrawler 同一时间只能运行一个爬取任务 |
| **爬取耗时** | 单次搜索约 30-60 秒（比 API 慢很多） |
| **风控风险** | 高频爬取可能触发小红书验证码，建议合理控制频率 |

---

## 四、混合方案（推荐）

最佳实践是 **Crawler 为主 + 付费 API 兜底**：

```bash
# .env 配置
XHS_ROUTER_PROVIDERS=crawler,rnote
XHS_ROUTER_STRATEGY=priority
```

这样：
1. **优先**尝试本地免费爬虫（零成本）
2. 爬虫忙/失败/未部署时，**自动降级**到 Rnote API（$0.008/次）
3. 保证服务始终可用

---

## 五、Docker 部署（可选）

如果你想在服务器上长期运行：

```bash
# 待 MediaCrawler 官方支持 Docker 后更新
# 目前建议直接 uv 启动 + systemd / pm2 守护进程

# 使用 nohup 后台运行
nohup uv run uvicorn api.main:app --host 0.0.0.0 --port 8080 > mediacrawler.log 2>&1 &
```

---

## 六、故障排查

| 问题 | 解决方案 |
|------|---------|
| `Crawler busy: already running` | 等待当前任务完成，或 POST `/api/crawler/stop` 停止 |
| Cookie 过期 | 重新运行 `uv run python main.py --platform xhs --lt qrcode --type search` 扫码 |
| Chrome 未启动 | 检查 CDP 端口：`chrome://inspect/#remote-debugging` |
| 数据为空 | 检查 `data/` 目录是否有输出文件 |
| 验证码拦截 | 设置 `HEADLESS = False` 手动过验证 |

---

## 参考链接

- [MediaCrawler GitHub](https://github.com/NanmiCoder/MediaCrawler) — 48K Stars
- [MediaCrawler 文档](https://nanmicoder.github.io/MediaCrawler/)
- [Rnote API](https://rnote.dev/) — 小红书专精付费 API
- [JustOneAPI](https://dashboard.justoneapi.com) — 多平台聚合 API
- [TikHub](https://tikhub.io) — 多平台 API，签到送免费额度
