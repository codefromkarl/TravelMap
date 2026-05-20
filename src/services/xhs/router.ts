/**
 * XHS 路由器 — 从 xhs-service.ts 提取的路由逻辑
 *
 * 职责：
 *   - 解析路由策略（priority / cost / all）
 *   - 解析 provider 列表和配置
 *   - 执行路由搜索
 */

import { config } from "../config.js";
import { getLogger } from "../logger.js";
import { PROVIDER_ADAPTERS } from "./adapters/index.js";
import type { ProviderContext, ProviderName, ProviderResult } from "./types.js";

// ─── 配置 ────────────────────────────────────────────────

const DEFAULT_PRIORITY: ProviderName[] = ["rnote", "justoneapi", "tikhub", "crawler"];
const PROVIDER_COST_ORDER: ProviderName[] = ["crawler", "rnote", "justoneapi", "tikhub"];

type RouterStrategy = "priority" | "cost" | "all";

// ─── XhsRouter 类 ───────────────────────────────────────

export class XhsRouter {
  private strategy: RouterStrategy;
  private providerOrder: ProviderName[];

  constructor() {
    this.strategy = this.resolveStrategy();
    this.providerOrder = this.resolveOrder();
  }

  /** 获取路由策略 */
  getStrategy(): RouterStrategy {
    return this.strategy;
  }

  /** 获取 provider 顺序 */
  getProviderOrder(): ProviderName[] {
    return [...this.providerOrder];
  }

  /** 刷新配置（测试或配置变更后调用） */
  refresh(): void {
    this.strategy = this.resolveStrategy();
    this.providerOrder = this.resolveOrder();
  }

  /** 检查是否有可用 provider */
  hasAvailableProvider(): boolean {
    return this.providerOrder.some((p) => this.getProviderContext(p) !== null);
  }

  /** 获取各 provider 配置状态 */
  getProviderStatus(): { provider: ProviderName; configured: boolean }[] {
    return this.providerOrder.map((p) => ({
      provider: p,
      configured: this.getProviderContext(p) !== null,
    }));
  }

  /**
   * 执行路由搜索 — 按策略调用 provider
   */
  async routeSearch(keyword: string): Promise<ProviderResult | null> {
    const order = this.providerOrder;

    // all 策略：并行调用，合并去重
    if (this.strategy === "all") {
      return this.routeAll(keyword, order);
    }

    // priority / cost 策略：按序 fallback
    return this.routeFallback(keyword, order);
  }

  // ─── 内部方法 ────────────────────────────────────────

  private resolveStrategy(): RouterStrategy {
    const s = config.xhsRouterStrategy?.toLowerCase();
    if (s === "cost" || s === "all") return s;
    return "priority";
  }

  private resolveOrder(): ProviderName[] {
    switch (this.strategy) {
      case "cost":
        return PROVIDER_COST_ORDER;
      case "all": {
        const available = this.resolveProviders().filter(
          (p) => this.getProviderContext(p) !== null,
        );
        return available.length > 0 ? available : DEFAULT_PRIORITY;
      }
      default:
        return this.resolveProviders();
    }
  }

  private resolveProviders(): ProviderName[] {
    const env = config.xhsRouterProviders ?? config.xhsApiProvider;
    if (!env) return DEFAULT_PRIORITY;
    return env
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is ProviderName => ["rnote", "justoneapi", "tikhub", "crawler"].includes(p));
  }

  private getProviderContext(name: ProviderName): ProviderContext | null {
    switch (name) {
      case "rnote": {
        const token = config.xhsRnoteToken;
        const base = config.xhsRnoteBase ?? "https://rnote.dev";
        return token ? { token, baseUrl: base } : null;
      }
      case "justoneapi": {
        const token = config.xhsJustoneapiToken ?? config.xhsApiToken;
        const base = config.xhsJustoneapiBase ?? config.xhsApiBase ?? "https://api.justoneapi.com";
        return token ? { token, baseUrl: base } : null;
      }
      case "tikhub": {
        const token = config.xhsTikhubToken;
        const base = config.xhsTikhubBase ?? "https://api.tikhub.io";
        return token ? { token, baseUrl: base } : null;
      }
      case "crawler": {
        const base = config.xhsCrawlerBase;
        const token = config.xhsCrawlerToken ?? "";
        return base ? { token, baseUrl: base } : null;
      }
      default:
        return null;
    }
  }

  private async routeFallback(
    keyword: string,
    order: ProviderName[],
  ): Promise<ProviderResult | null> {
    for (const name of order) {
      const ctx = this.getProviderContext(name);
      if (!ctx) continue;

      try {
        const reviews = await PROVIDER_ADAPTERS[name](keyword, ctx);
        if (reviews.length > 0) {
          return { provider: name, reviews };
        }
      } catch (err) {
        getLogger()
          .child({ component: "xhs-router" })
          .warn("provider 失败，尝试下一个", {
            provider: name,
            error: err instanceof Error ? err.message : err,
          });
      }
    }
    return null;
  }

  private async routeAll(keyword: string, order: ProviderName[]): Promise<ProviderResult | null> {
    const tasks = order
      .map((name) => {
        const ctx = this.getProviderContext(name);
        if (!ctx) return null;
        return { name, ctx };
      })
      .filter((t): t is { name: ProviderName; ctx: ProviderContext } => t !== null);

    if (tasks.length === 0) return null;

    const results = await Promise.allSettled(
      tasks.map(async ({ name, ctx }) => {
        const reviews = await PROVIDER_ADAPTERS[name](keyword, ctx);
        return { provider: name, reviews };
      }),
    );

    const allReviews: ProviderResult["reviews"] = [];
    const seenNoteIds = new Set<string>();

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value.reviews.length) continue;
      for (const review of r.value.reviews) {
        const noteId = (review.meta as Record<string, unknown>)?.noteId as string | undefined;
        if (noteId && seenNoteIds.has(noteId)) continue;
        if (noteId) seenNoteIds.add(noteId);
        allReviews.push(review);
      }
    }

    if (allReviews.length === 0) return null;

    return { provider: "rnote", reviews: allReviews };
  }
}
