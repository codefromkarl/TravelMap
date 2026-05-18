/**
 * 小红书服务工具函数
 */

export function extractTips(text: string): string {
  if (!text) return "建议提前查询开放时间和门票信息";

  const tipPatterns = [
    /[^\n。！？]*建议[^\n。！？]+[。！？]?/,
    /[^\n。！？]*记得[^\n。！？]+[。！？]?/,
    /[^\n。！？]*一定要[^\n。！？]+[。！？]?/,
    /[^\n。！？]*注意[^\n。！？]+[。！？]?/,
    /[^\n。！？]*避坑[^\n。！？]+[。！？]?/,
    /[^\n。！？]*千万别[^\n。！？]+[。！？]?/,
    /[^\n。！？]*推荐[^\n。！？]+[。！？]?/,
  ];

  const tips: string[] = [];
  for (const pattern of tipPatterns) {
    const matches = text.match(new RegExp(pattern.source, "g"));
    if (matches) {
      tips.push(...matches.map((m) => m.trim()).filter((t) => t.length > 2 && t.length < 80));
    }
  }

  if (tips.length === 0) {
    return text.slice(0, 60).replace(/[\n#]/g, " ").trim();
  }

  return tips.slice(0, 3).join("；");
}
