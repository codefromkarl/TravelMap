/**
 * share.js 单元测试
 * 测试：分享链接压缩/解压、hash 加载
 * 注意：Canvas/QR 测试需浏览器环境，此处仅测试纯 JS 逻辑
 */

import { describe, it, expect, beforeAll } from 'vitest';

// ─── Mock 浏览器全局对象 ─────────────────────────────
function mockBrowserGlobals() {
  if (typeof globalThis.window === 'undefined') {
    const mockLocation = { hash: '' };
    const mockWindow = {
      location: mockLocation,
      addEventListener: () => {},
    };
    globalThis.window = mockWindow;
  }
}

// Mock TripPlan（最小集用于测试链接生成）
const MOCK_TRIP_PLAN = {
  city: "杭州",
  startDate: "2026-06-01",
  endDate: "2026-06-03",
  days: [
    {
      dayIndex: 1, date: "2026-06-01", city: "杭州",
      transportation: "地铁",
      attractions: [
        { name: "West Lake", nameZh: "西湖", description: "世界文化遗产" },
        { name: "Lingyin Temple", nameZh: "灵隐寺", description: "千年古刹" },
      ],
    },
    {
      dayIndex: 2, date: "2026-06-02", city: "杭州",
      transportation: "公交",
      attractions: [{ name: "Xixi Wetland", nameZh: "西溪湿地", description: "城市湿地" }],
    },
  ],
};

let shareModule;

beforeAll(async () => {
  mockBrowserGlobals();
  shareModule = await import('../../modules/share.js');
});

describe("generateShareLink", () => {
  it("应为 TripPlan 生成压缩分享链接", () => {
    const { generateShareLink } = shareModule;
    const url = generateShareLink(MOCK_TRIP_PLAN);
    expect(url).toBeTruthy();
    expect(url).toContain("travel.codefromkarl.xyz");
    expect(url).toContain("#share=");
  });

  it("链接长度应小于 2000 字符", () => {
    const { generateShareLink } = shareModule;
    const url = generateShareLink(MOCK_TRIP_PLAN);
    expect(url.length).toBeLessThan(2000);
  });

  it("空输入应返回空字符串", () => {
    const { generateShareLink } = shareModule;
    expect(generateShareLink(null)).toBe("");
    expect(generateShareLink(undefined)).toBe("");
  });

  it("链接可在加载后还原为有效数据", () => {
    const { generateShareLink, loadSharedTripFromHash } = shareModule;

    const url = generateShareLink(MOCK_TRIP_PLAN);
    const hashPart = "#" + url.split("#")[1];
    globalThis.window.location.hash = hashPart;

    const data = loadSharedTripFromHash();
    expect(data).toBeTruthy();
    expect(data.c).toBe("杭州");
    expect(data.d).toBeTruthy();
    expect(data.d.length).toBe(2);
  });
});

describe("loadSharedTripFromHash", () => {
  it("无 hash 时应返回 null", () => {
    const { loadSharedTripFromHash } = shareModule;
    globalThis.window.location.hash = "";
    expect(loadSharedTripFromHash()).toBeNull();
  });

  it("错误格式的 hash 返回 null", () => {
    const { loadSharedTripFromHash } = shareModule;
    globalThis.window.location.hash = "#wrong=format";
    expect(loadSharedTripFromHash()).toBeNull();
  });
});

describe("下载辅助函数", () => {
  it("downloadImage 应为函数", () => {
    const { downloadImage } = shareModule;
    expect(typeof downloadImage).toBe('function');
  });
});