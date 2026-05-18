/**
 * 大众点评网页抓取服务 — 增强型补给数据源
 *
 * 背景：美团/大众点评官方 API 需企业资质，个人开发者无法接入。
 * 本模块作为备用数据源，通过解析商户公开页面获取人均消费和营业时间。
 *
 * ⚠️ 使用限制：
 *   - 仅抓取公开可见的商户信息页
 *   - 需遵守 robots.txt 和平台服务条款
 *   - 请求频率需控制在合理范围（建议 ≥5 秒/次）
 *   - 数据标注为 scraped，置信度低于 API 数据
 *
 * 返回数据统一标记为 priceConfidence="scraped"，前端需明确告知用户。
 */

export interface DianpingScrapeConfig {
  /** 请求间隔 ms（默认 5000） */
  requestIntervalMs?: number;
  /** 超时 ms */
  timeout?: number;
}

export interface DianpingScrapeResult {
  /** 人均消费（元） */
  cost?: number;
  /** 营业时间 */
  businessHours?: string;
  /** 评分 */
  rating?: number;
  /** 抓取时间 */
  scrapedAt: string;
  /** 抓取来源 URL */
  sourceUrl?: string;
}

// ─── 抓取逻辑 ────────────────────────────────────────────

/**
 * 搜索大众点评商户并抓取详情
 *
 * 当前为框架实现，实际抓取需处理：
 * 1. 反爬机制（Cookie、User-Agent、验证码）
 * 2. 页面结构变化（需定期维护 CSS selector）
 * 3. 频率限制（IP 封禁风险）
 *
 * 生产环境建议：
 * - 使用 Puppeteer/Playwright 模拟真实浏览器
 * - 配置代理池轮换 IP
 * - 接入验证码识别服务（如 2Captcha）
 */
export async function scrapeDianpingMerchant(
  keyword: string,
  city: string,
  _config?: DianpingScrapeConfig,
): Promise<DianpingScrapeResult | null> {
  // 当前版本：返回 null，标记为未实现
  // 未来可通过以下方式实现：
  // 1. 搜索页: https://www.dianping.com/search/keyword/1/0_{{keyword}}
  // 2. 解析商户 ID 和链接
  // 3. 详情页: https://www.dianping.com/shop/{{shopId}}
  // 4. 解析 HTML 中的人均消费、营业时间 JSON-LD 或 DOM

  console.warn(
    `[DianpingScrape] 商户抓取暂未实现: ${keyword} (${city}). ` +
      `如需启用，需配置 Puppeteer + 代理池，并遵守平台条款。`,
  );

  return null;
}

/** 批量抓取（带间隔控制） */
export async function batchScrapeDianping(
  keywords: Array<{ keyword: string; city: string }>,
  config?: DianpingScrapeConfig,
): Promise<Map<string, DianpingScrapeResult | null>> {
  const interval = config?.requestIntervalMs ?? 5000;
  const results = new Map<string, DianpingScrapeResult | null>();

  for (const { keyword, city } of keywords) {
    const key = `${city}:${keyword}`;
    const result = await scrapeDianpingMerchant(keyword, city, config);
    results.set(key, result);
    // 间隔等待，避免触发反爬
    if (interval > 0) {
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  return results;
}
