/**
 * 配额管理模块单元测试
 *
 * 覆盖：用户创建、读取、配额扣减、溢出处理
 */
import { describe, it, expect, vi } from "vitest";
import { getUser, createUser, consumeQuota, FREE_TIER } from "../../functions/_lib/quota.js";

// ─── Mock KV ────────────────────────────────────────────────
function createMockKv(store: Record<string, string> = {}) {
  return {
    get: vi.fn(async (key: string, opts?: { type?: string }) => {
      const val = store[key];
      if (val === undefined) return null;
      if (opts?.type === "json") return JSON.parse(val);
      return val;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    delete: vi.fn(async (key: string) => {
      delete store[key];
    }),
    // 内部引用，方便断言
    _store: store,
  };
}

// ─── getUser ────────────────────────────────────────────────
describe("getUser", () => {
  it("应返回已存在的用户数据", async () => {
    const user = { id: "u1", usage: { apiCalls: 5 } };
    const kv = createMockKv({ "user:u1": JSON.stringify(user) });
    const result = await getUser(kv, "u1");
    expect(result).toEqual(user);
  });

  it("用户不存在应返回 null", async () => {
    const kv = createMockKv();
    const result = await getUser(kv, "nonexistent");
    expect(result).toBeNull();
  });

  it("KV get 抛错应返回 null（catch 兜底）", async () => {
    const kv = {
      get: vi.fn().mockRejectedValue(new Error("KV error")),
      put: vi.fn(),
    };
    const result = await getUser(kv as any, "u1");
    expect(result).toBeNull();
  });
});

// ─── createUser ─────────────────────────────────────────────
describe("createUser", () => {
  it("应创建用户并存入 KV", async () => {
    const kv = createMockKv();
    const profile = {
      id: "new-user",
      provider: "github",
      name: "Test",
      avatar: "https://avatar.url",
      email: "test@example.com",
    };
    const user = await createUser(kv, profile);

    expect(user.id).toBe("new-user");
    expect(user.provider).toBe("github");
    expect(user.name).toBe("Test");
    expect(user.avatar).toBe("https://avatar.url");
    expect(user.email).toBe("test@example.com");
    expect(user.usage.apiCalls).toBe(0);
    expect(user.createdAt).toBeDefined();

    // KV 应被调用写入
    expect(kv.put).toHaveBeenCalledWith("user:new-user", expect.any(String));
    // store 中应有数据
    const stored = JSON.parse(kv._store["user:new-user"]);
    expect(stored.id).toBe("new-user");
  });

  it("缺少可选字段应使用默认空字符串", async () => {
    const kv = createMockKv();
    const user = await createUser(kv, { id: "u-min", provider: "google" });
    expect(user.name).toBe("");
    expect(user.avatar).toBe("");
    expect(user.email).toBe("");
  });
});

// ─── consumeQuota ───────────────────────────────────────────
describe("consumeQuota", () => {
  it("用户不存在应返回失败", async () => {
    const kv = createMockKv();
    const result = await consumeQuota(kv, "ghost");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("User not found");
  });

  it("首次消耗配额应成功，remaining = maxApiCalls - 1", async () => {
    const kv = createMockKv();
    await createUser(kv, { id: "u1", provider: "test" });
    const result = await consumeQuota(kv, "u1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remaining).toBe(FREE_TIER.maxApiCalls - 1);
    }
  });

  it("连续消耗配额应正确递减 remaining", async () => {
    const kv = createMockKv();
    await createUser(kv, { id: "u1", provider: "test" });

    for (let i = 1; i <= 5; i++) {
      const result = await consumeQuota(kv, "u1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.remaining).toBe(FREE_TIER.maxApiCalls - i);
      }
    }
  });

  it("配额耗尽时应返回失败", async () => {
    const kv = createMockKv();
    // 创建一个已耗尽配额的用户
    const exhausted = {
      id: "exhausted",
      provider: "test",
      name: "",
      avatar: "",
      email: "",
      createdAt: new Date().toISOString(),
      usage: { apiCalls: FREE_TIER.maxApiCalls },
    };
    kv._store["user:exhausted"] = JSON.stringify(exhausted);

    const result = await consumeQuota(kv, "exhausted");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("Free quota exhausted");
      expect(result.remaining).toBe(0);
    }
  });

  it("配额恰好用完最后一次应成功", async () => {
    const kv = createMockKv();
    const user = {
      id: "last-one",
      provider: "test",
      name: "",
      avatar: "",
      email: "",
      createdAt: new Date().toISOString(),
      usage: { apiCalls: FREE_TIER.maxApiCalls - 1 },
    };
    kv._store["user:last-one"] = JSON.stringify(user);

    const result = await consumeQuota(kv, "last-one");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remaining).toBe(0);
    }

    // 下一次应该失败
    const result2 = await consumeQuota(kv, "last-one");
    expect(result2.ok).toBe(false);
  });

  it("consumeQuota 后 KV 应写入更新后的 apiCalls", async () => {
    const kv = createMockKv();
    await createUser(kv, { id: "u1", provider: "test" });
    await consumeQuota(kv, "u1");

    const stored = JSON.parse(kv._store["user:u1"]);
    expect(stored.usage.apiCalls).toBe(1);
  });

  it("FREE_TIER.maxApiCalls 应为 200", () => {
    expect(FREE_TIER.maxApiCalls).toBe(200);
  });
});
