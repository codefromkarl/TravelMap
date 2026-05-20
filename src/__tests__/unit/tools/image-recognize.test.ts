/**
 * 图片识别工具单元测试
 */

import { describe, expect, it } from "vitest";
import { recognizeImageTool } from "../../../tools/image-recognize.js";

describe("recognizeImageTool", () => {
  const knownAttractions = [
    {
      nameZh: "西湖",
      nameEn: "West Lake",
      city: "杭州",
      description: "著名湖泊景点",
      category: "自然风光",
    },
    {
      nameZh: "灵隐寺",
      nameEn: "Lingyin Temple",
      city: "杭州",
      description: "千年古刹",
      category: "宗教文化",
    },
    {
      nameZh: "外滩",
      nameEn: "The Bund",
      city: "上海",
      description: "黄浦江畔万国建筑群",
      category: "城市景观",
    },
  ];

  it("应有正确的工具名称", () => {
    expect(recognizeImageTool.name).toBe("recognize_image");
  });

  it("应有 cheap costTier", () => {
    expect(recognizeImageTool.costTier).toBe("cheap");
  });

  it("精确名称匹配应返回高置信度", async () => {
    const result = await recognizeImageTool.execute("call-1", {
      imageDescription: "照片中是西湖的断桥残雪，湖面有游船",
      detectedLandmarks: ["西湖", "断桥"],
      knownAttractions,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("西湖");
    expect(text).toContain("高");
    expect(result.details.result.matched).toBe(true);
    expect(result.details.result.confidence).toBe("high");
  });

  it("地标关键词匹配应返回中置信度", async () => {
    const result = await recognizeImageTool.execute("call-2", {
      imageDescription: "照片中是一座古老的寺庙，有佛像",
      detectedLandmarks: ["灵隐"],
      knownAttractions,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("灵隐寺");
    expect(result.details.result.matched).toBe(true);
  });

  it("无匹配时应返回未匹配结果", async () => {
    const result = await recognizeImageTool.execute("call-3", {
      imageDescription: "照片中是一个现代化的购物中心",
      detectedLandmarks: ["万达广场"],
      knownAttractions,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("未匹配");
    expect(result.details.result.matched).toBe(false);
  });

  it("应正确处理空地标列表", async () => {
    const result = await recognizeImageTool.execute("call-4", {
      imageDescription: "照片中有湖光山色",
      detectedLandmarks: [],
      knownAttractions,
    });

    expect(result.details.knownAttractionsCount).toBe(3);
  });

  it("应返回所有已知景点供参考", async () => {
    const result = await recognizeImageTool.execute("call-5", {
      imageDescription: "照片中是上海外滩夜景",
      detectedLandmarks: ["外滩", "东方明珠"],
      knownAttractions,
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("外滩");
    expect(result.details.result.matched).toBe(true);
    expect(result.details.result.attraction?.city).toBe("上海");
  });
});
